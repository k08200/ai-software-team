import fs from "fs/promises";
import path from "path";
import archiver from "archiver";
import { createWriteStream } from "fs";
import type { AgentOutput } from "../types.js";

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
    const dir = path.dirname(filepath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filepath, content, "utf-8");
    return filepath;
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
      backend: "ts",
      frontend: "tsx",
      qa: "md",
      security: "md",
      review: "md",
    };
    return map[agentId] ?? "txt";
  }
}
