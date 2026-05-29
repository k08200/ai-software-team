import { describe, expect, it } from "vitest";
import {
  classifyPipelineError,
  classifyVerificationFailures,
  summarizeFailureCategories,
} from "../../src/utils/benchmark-classifier.js";
import type { ProjectVerification } from "../../src/utils/project-verifier.js";

describe("benchmark classifier", () => {
  it("classifies missing package manifests once per project", () => {
    const verification: ProjectVerification[] = [
      {
        name: "Backend",
        relativePath: "generated/backend",
        fileCount: 3,
        hasPackageJson: false,
        commands: [
          { command: "npm install", status: "skipped", durationMs: 0, reason: "package.json not found" },
          { command: "npm run build", status: "skipped", durationMs: 0, reason: "package.json not found" },
        ],
      },
    ];

    expect(classifyVerificationFailures(verification)).toEqual([
      {
        project: "Backend",
        command: "package.json",
        category: "missing-package-json",
        summary: "package.json not found",
      },
    ]);
  });

  it("classifies common install and build errors", () => {
    const verification: ProjectVerification[] = [
      {
        name: "Frontend",
        relativePath: "generated/frontend",
        fileCount: 12,
        hasPackageJson: true,
        commands: [
          {
            command: "npm install",
            status: "failed",
            durationMs: 20,
            output: "npm ERR! No matching version found for fake-ui@99.0.0",
          },
          {
            command: "npm run build",
            status: "failed",
            durationMs: 40,
            output: "src/App.tsx(4,10): error TS2304: Cannot find name 'Widget'.",
          },
          {
            command: "npm test",
            status: "skipped",
            durationMs: 0,
            reason: "test script not found",
          },
        ],
      },
    ];

    const failures = classifyVerificationFailures(verification);

    expect(failures.map((failure) => failure.category)).toEqual([
      "missing-dependency",
      "typescript-error",
    ]);
    expect(summarizeFailureCategories(failures)).toEqual({
      "missing-dependency": 1,
      "typescript-error": 1,
    });
  });

  it("does not count build and test skips again when install already failed", () => {
    const verification: ProjectVerification[] = [
      {
        name: "Backend",
        relativePath: "generated/backend",
        fileCount: 3,
        hasPackageJson: true,
        commands: [
          { command: "npm install", status: "failed", durationMs: 120000, output: "" },
          { command: "npm run build", status: "skipped", durationMs: 0, reason: "npm install failed" },
          { command: "npm test", status: "skipped", durationMs: 0, reason: "npm install failed" },
        ],
      },
    ];

    expect(classifyVerificationFailures(verification).map((failure) => failure.category)).toEqual([
      "install-failed",
    ]);
  });

  it("classifies missing source and import failures", () => {
    const verification: ProjectVerification[] = [
      {
        name: "Frontend",
        relativePath: "generated/frontend",
        fileCount: 4,
        hasPackageJson: true,
        commands: [
          {
            command: "npm run build",
            status: "failed",
            durationMs: 40,
            output: "error TS18003: No inputs were found in config file.",
          },
          {
            command: "npm run build",
            status: "failed",
            durationMs: 40,
            output: "[vite]: Rollup failed to resolve import \"./Missing\" from src/App.tsx",
          },
        ],
      },
    ];

    expect(classifyVerificationFailures(verification).map((failure) => failure.category)).toEqual([
      "missing-source-files",
      "missing-import",
    ]);
  });

  it("classifies spaced syntax errors and keeps the signal line in the summary", () => {
    const verification: ProjectVerification[] = [
      {
        name: "Frontend",
        relativePath: "generated/frontend",
        fileCount: 4,
        hasPackageJson: true,
        commands: [
          {
            command: "npm run build",
            status: "failed",
            durationMs: 40,
            output: [
              "> vite build",
              "✘ [ERROR] Syntax error \"#\"",
              "vite.config.ts:7:1:",
              "at Socket.readFromStdout",
            ].join("\n"),
          },
        ],
      },
    ];

    const [failure] = classifyVerificationFailures(verification);
    expect(failure.category).toBe("syntax-error");
    expect(failure.summary).toContain("Syntax error");
    expect(failure.summary).not.toContain("Socket.readFromStdout");
  });

  it("classifies Ollama connection errors as infrastructure failures", () => {
    expect(
      classifyPipelineError("[Fast MVP Planner] Ollama error: fetch failed")?.category,
    ).toBe("ollama-unavailable");
  });
});
