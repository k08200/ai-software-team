import type { ProjectVerification, VerificationCommand } from "./project-verifier.js";

export type BenchmarkFailureCategory =
  | "missing-package-json"
  | "verification-skipped"
  | "install-failed"
  | "build-script-missing"
  | "build-failed"
  | "test-failed"
  | "missing-dependency"
  | "missing-import"
  | "typescript-error"
  | "missing-source-files"
  | "syntax-error"
  | "timeout"
  | "ollama-unavailable"
  | "pipeline-error"
  | "unknown";

export interface BenchmarkFailure {
  project: string;
  command: string;
  category: BenchmarkFailureCategory;
  summary: string;
}

export function classifyVerificationFailures(
  verification: ProjectVerification[],
): BenchmarkFailure[] {
  const failures: BenchmarkFailure[] = [];

  for (const project of verification) {
    if (!project.hasPackageJson) {
      failures.push({
        project: project.name,
        command: "package.json",
        category: "missing-package-json",
        summary: "package.json not found",
      });
      continue;
    }

    const installFailed = project.commands.some((command) => (
      command.command === "npm install" && command.status === "failed"
    ));

    for (const command of project.commands) {
      if (
        installFailed &&
        command.status === "skipped" &&
        command.reason === "npm install failed"
      ) {
        continue;
      }
      const failure = classifyCommandFailure(project.name, command);
      if (failure) failures.push(failure);
    }
  }

  return failures;
}

export function summarizeFailureCategories(
  failures: BenchmarkFailure[],
): Record<BenchmarkFailureCategory, number> {
  const summary = {} as Record<BenchmarkFailureCategory, number>;
  for (const failure of failures) {
    summary[failure.category] = (summary[failure.category] ?? 0) + 1;
  }
  return summary;
}

export function classifyPipelineError(error: string | undefined): BenchmarkFailure | null {
  if (!error) return null;

  return {
    project: "Pipeline",
    command: "pipeline",
    category: classifyPipelineErrorMessage(error),
    summary: error.slice(0, 260),
  };
}

function classifyCommandFailure(
  projectName: string,
  command: VerificationCommand,
): BenchmarkFailure | null {
  if (command.status === "passed") return null;

  const summary = summarizeCommand(command);
  const searchable = `${command.reason ?? ""}\n${command.output ?? ""}`.toLowerCase();

  if (command.status === "skipped") {
    if (command.command === "npm test" && searchable.includes("test script not found")) {
      return null;
    }

    return {
      project: projectName,
      command: command.command,
      category: classifySkippedCommand(command.command, searchable),
      summary,
    };
  }

  return {
    project: projectName,
    command: command.command,
    category: classifyFailedCommand(command.command, searchable),
    summary,
  };
}

function classifySkippedCommand(
  command: string,
  searchable: string,
): BenchmarkFailureCategory {
  if (searchable.includes("package.json not found")) return "missing-package-json";
  if (searchable.includes("set verify_generated_projects=true")) return "verification-skipped";
  if (searchable.includes("npm install failed")) return "install-failed";
  if (searchable.includes("build script not found")) return "build-script-missing";
  if (command === "npm run build") return "build-failed";
  if (command === "npm test") return "test-failed";
  return "unknown";
}

function classifyFailedCommand(
  command: string,
  searchable: string,
): BenchmarkFailureCategory {
  if (searchable.includes("timed out") || searchable.includes("sigterm")) return "timeout";
  if (searchable.includes("no inputs were found")) return "missing-source-files";
  if (
    searchable.includes("could not resolve") ||
    searchable.includes("failed to resolve import")
  ) {
    return "missing-import";
  }
  if (
    searchable.includes("cannot find module") ||
    searchable.includes("module not found") ||
    searchable.includes("can't resolve") ||
    searchable.includes("no matching version found")
  ) {
    return "missing-dependency";
  }
  if (
    /\bts\d{4}\b/.test(searchable) ||
    searchable.includes("cannot find name") ||
    searchable.includes("type error")
  ) {
    return "typescript-error";
  }
  if (
    searchable.includes("syntaxerror") ||
    searchable.includes("syntax error") ||
    searchable.includes("unexpected token") ||
    searchable.includes("unterminated")
  ) {
    return "syntax-error";
  }
  if (command === "npm install") return "install-failed";
  if (command === "npm run build") return "build-failed";
  if (command === "npm test") return "test-failed";
  return "unknown";
}

function classifyPipelineErrorMessage(error: string): BenchmarkFailureCategory {
  const searchable = error.toLowerCase();
  if (
    searchable.includes("ollama") &&
    (searchable.includes("fetch failed") || searchable.includes("couldn't connect"))
  ) {
    return "ollama-unavailable";
  }
  if (searchable.includes("timed out") || searchable.includes("timeout")) return "timeout";
  return "pipeline-error";
}

function summarizeCommand(command: VerificationCommand): string {
  const source = command.output?.trim() || command.reason?.trim() || command.status;
  const lines = source.split("\n").map((line) => line.trim()).filter(Boolean);
  const signalLines = lines.filter((line) => (
    /\berror\b/i.test(line) ||
    /failed/i.test(line) ||
    /cannot find/i.test(line) ||
    /could not resolve/i.test(line) ||
    /no inputs were found/i.test(line) ||
    /syntax/i.test(line)
  ));
  return (signalLines.length > 0 ? signalLines.slice(0, 3) : lines.slice(-3))
    .join(" ")
    .slice(0, 260);
}
