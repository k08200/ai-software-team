import fs from "fs/promises";
import os from "os";
import path from "path";
import { spawn } from "child_process";

const PREVIEWS_DIR = path.join(process.cwd(), "previews");
const PREVIEW_TIMEOUT_MS = parseInt(process.env.PREVIEW_BUILD_TIMEOUT_MS ?? "120000", 10);

interface PackageJson {
  scripts?: Record<string, string>;
}

export interface FrontendPreviewResult {
  url: string;
  path: string;
}

export async function publishFrontendPreview(
  outputDir: string,
  sessionId: string,
): Promise<FrontendPreviewResult | null> {
  const sourceDir = path.join(outputDir, "generated/frontend");
  const packageJson = await readPackageJson(path.join(sourceDir, "package.json"));
  if (!packageJson?.scripts?.["build"]) return null;

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ast-frontend-preview-"));
  const tempProjectDir = path.join(tempRoot, "frontend");
  const previewDir = path.join(PREVIEWS_DIR, sessionId, "frontend");

  try {
    await fs.cp(sourceDir, tempProjectDir, { recursive: true });
    const install = await runCommand(["install", "--package-lock=false", "--no-audit", "--no-fund"], tempProjectDir);
    if (install !== 0) return null;

    const build = await runCommand(["run", "build"], tempProjectDir);
    if (build !== 0) return null;

    const distDir = path.join(tempProjectDir, "dist");
    await fs.rm(previewDir, { recursive: true, force: true });
    await fs.mkdir(path.dirname(previewDir), { recursive: true });
    await fs.cp(distDir, previewDir, { recursive: true });
    await rewriteIndexForNestedPreview(path.join(previewDir, "index.html"));

    return {
      url: `/api/pipeline/app-preview/${sessionId}/`,
      path: previewDir,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Preview] Failed to publish frontend preview: ${message}`);
    return null;
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

export function getFrontendPreviewDir(sessionId: string): string {
  return path.join(PREVIEWS_DIR, sessionId, "frontend");
}

async function readPackageJson(packageJsonPath: string): Promise<PackageJson | null> {
  try {
    return JSON.parse(await fs.readFile(packageJsonPath, "utf-8")) as PackageJson;
  } catch {
    return null;
  }
}

async function rewriteIndexForNestedPreview(indexPath: string): Promise<void> {
  let html: string;
  try {
    html = await fs.readFile(indexPath, "utf-8");
  } catch {
    return;
  }

  const nextHtml = html
    .replace(/(href|src)="\/assets\//g, '$1="./assets/')
    .replace(/(href|src)='\/assets\//g, "$1='./assets/");

  if (nextHtml !== html) {
    await fs.writeFile(indexPath, nextHtml, "utf-8");
  }
}

function runCommand(args: string[], cwd: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn("npm", args, {
      cwd,
      shell: false,
      env: {
        ...process.env,
        CI: "true",
      },
    });

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, PREVIEW_TIMEOUT_MS);

    child.on("error", () => {
      clearTimeout(timer);
      resolve(1);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
  });
}
