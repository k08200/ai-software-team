import fs from "fs/promises";
import path from "path";
import archiver from "archiver";
import { createWriteStream } from "fs";
import type { AgentOutput } from "../types.js";

const FILE_HEADING_RE = /(?:^|\s)([A-Za-z0-9_.@/-]+(?:\.[A-Za-z0-9_.-]+)+)(?:\s|$)/;
const CODE_BLOCK_RE = /(?:^|\n)(?:#{1,6}\s+([^\n]+)\n)?```[^\n]*\n([\s\S]*?)```/g;

export class FileManager {
  private outputDir: string;

  constructor(sessionId: string) {
    this.outputDir = path.join(process.cwd(), "outputs", sessionId);
  }

  async ensureDir(): Promise<void> {
    await fs.mkdir(this.outputDir, { recursive: true });
  }

  async saveAgentOutput(output: AgentOutput): Promise<string> {
    await this.ensureDir();
    const ext = this.getExtension(output.agentId);
    const filename = `${output.agentId}-output.${ext}`;
    const filepath = path.join(this.outputDir, filename);
    await fs.writeFile(filepath, output.content, "utf-8");
    return filepath;
  }

  async saveFile(filename: string, content: string): Promise<string> {
    await this.ensureDir();
    const filepath = path.join(this.outputDir, filename);
    this.assertInsideOutputDir(filepath);
    await fs.mkdir(path.dirname(filepath), { recursive: true });
    await fs.writeFile(filepath, content, "utf-8");
    return filepath;
  }

  async saveMarkdownCodeBlocksAsFiles(
    markdown: string,
    rootDir: string,
    fallbackFilename: string,
  ): Promise<string[]> {
    await this.ensureDir();

    const files = this.extractFiles(markdown);
    if (files.length === 0) {
      return [await this.saveFile(path.join(rootDir, fallbackFilename), markdown)];
    }

    const written: string[] = [];
    const usedNames = new Map<string, number>();

    for (const file of files) {
      const safeName = this.makeSafeRelativePath(file.filename);
      if (!safeName) continue;

      const dedupedName = this.dedupePath(safeName, usedNames);
      written.push(await this.saveFile(path.join(rootDir, dedupedName), file.content));
    }

    if (written.length === 0) {
      return [await this.saveFile(path.join(rootDir, fallbackFilename), markdown)];
    }

    return written;
  }

  async createZip(): Promise<string> {
    await this.ensureDir();
    const zipPath = path.join(
      process.cwd(),
      "outputs",
      `${path.basename(this.outputDir)}.zip`,
    );

    return new Promise((resolve, reject) => {
      const output = createWriteStream(zipPath);
      const archive = archiver("zip", { zlib: { level: 9 } });

      output.on("close", () => resolve(zipPath));
      archive.on("error", reject);

      archive.pipe(output);
      archive.directory(this.outputDir, false);
      archive.finalize();
    });
  }

  getOutputDir(): string {
    return this.outputDir;
  }

  getZipPath(): string {
    return path.join(
      process.cwd(),
      "outputs",
      `${path.basename(this.outputDir)}.zip`,
    );
  }

  private getExtension(agentId: string): string {
    const map: Record<string, string> = {
      cto: "md",
      pm: "md",
      backend: "md",
      frontend: "md",
      qa: "md",
      security: "md",
      review: "md",
    };
    return map[agentId] ?? "txt";
  }

  private extractFiles(markdown: string): Array<{ filename: string; content: string }> {
    const files: Array<{ filename: string; content: string }> = [];
    let match: RegExpExecArray | null;
    let lastMatchEnd = 0;

    while ((match = CODE_BLOCK_RE.exec(markdown)) !== null) {
      lastMatchEnd = CODE_BLOCK_RE.lastIndex;
      const heading = match[1]?.trim() ?? "";
      const filename = this.extractFilenameFromHeading(heading);
      const content = match[2] ?? "";
      if (filename && content.trim().length > 0) {
        files.push({
          filename,
          content: content.replace(/\n$/, ""),
        });
      }
    }

    const trailing = markdown.slice(lastMatchEnd);
    const trailingMatch = trailing.match(/(?:^|\n)#{1,6}\s+([^\n]+)\n```[^\n]*\n([\s\S]*)$/);
    if (trailingMatch) {
      const filename = this.extractFilenameFromHeading(trailingMatch[1]?.trim() ?? "");
      const content = trailingMatch[2] ?? "";
      if (filename && content.trim().length > 0 && !files.some((file) => file.filename === filename)) {
        files.push({
          filename,
          content: content.replace(/\n$/, ""),
        });
      }
    }

    return files;
  }

  private extractFilenameFromHeading(heading: string): string | null {
    const normalized = heading
      .replace(/`/g, "")
      .replace(/^file:\s*/i, "")
      .trim();
    const match = normalized.match(FILE_HEADING_RE);
    return match?.[1] ?? null;
  }

  private makeSafeRelativePath(filename: string): string | null {
    const normalized = filename.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!normalized || normalized.includes("\0")) return null;

    const parts = normalized.split("/").filter(Boolean);
    if (parts.length === 0 || parts.some((part) => part === "." || part === "..")) {
      return null;
    }

    return parts.join("/");
  }

  private dedupePath(filename: string, usedNames: Map<string, number>): string {
    const count = usedNames.get(filename) ?? 0;
    usedNames.set(filename, count + 1);
    if (count === 0) return filename;

    const ext = path.extname(filename);
    const base = filename.slice(0, filename.length - ext.length);
    return `${base}.${count + 1}${ext}`;
  }

  private assertInsideOutputDir(filepath: string): void {
    const resolvedOutputDir = path.resolve(this.outputDir);
    const resolvedPath = path.resolve(filepath);
    if (resolvedPath !== resolvedOutputDir && !resolvedPath.startsWith(`${resolvedOutputDir}${path.sep}`)) {
      throw new Error("Refusing to write outside output directory.");
    }
  }
}
