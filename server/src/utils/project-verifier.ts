import fs from "fs/promises";
import path from "path";
import os from "os";
import { spawn } from "child_process";

interface PackageJson {
  scripts?: Record<string, string>;
}

export interface VerificationCommand {
  command: string;
  status: "passed" | "failed" | "skipped";
  durationMs: number;
  exitCode?: number;
  output?: string;
  reason?: string;
}

export interface ProjectVerification {
  name: string;
  relativePath: string;
  fileCount: number;
  hasPackageJson: boolean;
  commands: VerificationCommand[];
}

const VERIFY_COMMANDS = process.env.VERIFY_GENERATED_PROJECTS === "true";
const VERIFY_TIMEOUT_MS = parseInt(process.env.VERIFY_TIMEOUT_MS ?? "120000", 10);

export async function verifyGeneratedProjects(outputDir: string): Promise<ProjectVerification[]> {
  const roots = [
    { name: "Backend", relativePath: "generated/backend" },
    { name: "Frontend", relativePath: "generated/frontend" },
  ];

  const results: ProjectVerification[] = [];
  for (const root of roots) {
    results.push(await verifyProject(outputDir, root.name, root.relativePath));
  }
  return results;
}

export function formatVerificationReport(results: ProjectVerification[]): string {
  const lines = ["## Generated Project Verification"];

  for (const result of results) {
    lines.push("");
    lines.push(`### ${result.name}`);
    lines.push(`- Path: ${result.relativePath}`);
    lines.push(`- Files: ${result.fileCount}`);
    lines.push(`- package.json: ${result.hasPackageJson ? "yes" : "no"}`);

    for (const command of result.commands) {
      const suffix =
        command.status === "skipped"
          ? `skipped (${command.reason ?? "not applicable"})`
          : `${command.status}${command.exitCode === undefined ? "" : ` (exit ${command.exitCode})`}`;
      lines.push(`- ${command.command}: ${suffix}`);
      if (command.output) {
        lines.push("  ```");
        lines.push(indent(command.output.trim().slice(-2000), "  "));
        lines.push("  ```");
      }
    }
  }

  return lines.join("\n");
}

async function verifyProject(
  outputDir: string,
  name: string,
  relativePath: string,
): Promise<ProjectVerification> {
  const sourceCwd = path.join(outputDir, relativePath);
  const fileCount = await countFiles(sourceCwd);
  const packageJsonPath = path.join(sourceCwd, "package.json");
  const packageJson = await readPackageJson(packageJsonPath);

  const commands: VerificationCommand[] = [];
  if (!packageJson) {
    commands.push(skip("npm install", "package.json not found"));
    commands.push(skip("npm run build", "package.json not found"));
    commands.push(skip("npm test", "package.json not found"));
  } else if (!VERIFY_COMMANDS) {
    commands.push(skip("npm install", "set VERIFY_GENERATED_PROJECTS=true to execute generated code"));
    commands.push(skip("npm run build", "set VERIFY_GENERATED_PROJECTS=true to execute generated code"));
    commands.push(skip("npm test", "set VERIFY_GENERATED_PROJECTS=true to execute generated code"));
  } else {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "ast-generated-verify-"));
    const verifyCwd = path.join(tempRoot, relativePath);
    try {
      await fs.mkdir(path.dirname(verifyCwd), { recursive: true });
      await fs.cp(sourceCwd, verifyCwd, { recursive: true });

      const install = await runCommand("npm install", ["install", "--package-lock=false", "--no-audit", "--no-fund"], verifyCwd);
      commands.push(install);
      if (install.status !== "passed") {
        commands.push(skip("npm run build", "npm install failed"));
        commands.push(skip("npm test", "npm install failed"));
      } else if (packageJson.scripts?.["build"]) {
        commands.push(await runCommand("npm run build", ["run", "build"], verifyCwd));
        if (packageJson.scripts?.["test"]) {
          commands.push(await runCommand("npm test", ["test"], verifyCwd));
        } else {
          commands.push(skip("npm test", "test script not found"));
        }
      } else {
        commands.push(skip("npm run build", "build script not found"));
        commands.push(skip("npm test", "build script not found"));
      }
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  }

  return {
    name,
    relativePath,
    fileCount,
    hasPackageJson: !!packageJson,
    commands,
  };
}

async function readPackageJson(packageJsonPath: string): Promise<PackageJson | null> {
  try {
    const content = await fs.readFile(packageJsonPath, "utf-8");
    return JSON.parse(content) as PackageJson;
  } catch {
    return null;
  }
}

async function countFiles(root: string): Promise<number> {
  let count = 0;

  async function walk(dir: string): Promise<void> {
    let entries: Array<import("fs").Dirent>;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        count++;
      }
    }
  }

  await walk(root);
  return count;
}

function skip(command: string, reason: string): VerificationCommand {
  return {
    command,
    status: "skipped",
    durationMs: 0,
    reason,
  };
}

function runCommand(command: string, args: string[], cwd: string): Promise<VerificationCommand> {
  const start = Date.now();

  return new Promise((resolve) => {
    const child = spawn("npm", args, {
      cwd,
      shell: false,
      env: {
        ...process.env,
        CI: "true",
      },
    });

    let output = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, VERIFY_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf-8");
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf-8");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        command,
        status: "failed",
        durationMs: Date.now() - start,
        output: err.message,
      });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        command,
        status: code === 0 ? "passed" : "failed",
        durationMs: Date.now() - start,
        exitCode: code ?? undefined,
        output: output.trim().slice(-4000),
      });
    });
  });
}

function indent(value: string, prefix: string): string {
  return value
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}
