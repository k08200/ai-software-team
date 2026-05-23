import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import type { PipelineProfile } from "../config.js";
import type { ProjectVerification } from "../utils/project-verifier.js";
import {
  classifyVerificationFailures,
  summarizeFailureCategories,
  type BenchmarkFailure,
  type BenchmarkFailureCategory,
} from "../utils/benchmark-classifier.js";
import type { SSEEvent } from "../types.js";

process.env.LLM_PROVIDER ??= "ollama";
process.env.OLLAMA_BASE_URL ??= "http://127.0.0.1:11434";
process.env.OLLAMA_MODEL ??= "qwen2.5-coder:14b";
process.env.PIPELINE_PROFILE ??= "fast-mvp";
process.env.FAST_MVP_MAX_TOKENS ??= "4200";
process.env.MVP_MAX_TOKENS ??= "6000";
process.env.VERIFY_GENERATED_PROJECTS ??= "true";
process.env.DEMO_MODE ??= "false";
process.env.JWT_SECRET ??= "local-benchmark";

type BenchmarkProfile = Extract<PipelineProfile, "fast-mvp" | "mvp">;

interface BenchmarkScenario {
  id: string;
  idea: string;
}

interface AgentRun {
  agentId: string;
  agentName: string;
  durationMs: number;
}

interface BenchmarkScenarioResult {
  id: string;
  idea: string;
  sessionId: string;
  status: "passed" | "failed";
  startedAt: string;
  durationMs: number;
  totalTokens: number;
  zipPath?: string;
  frontendPreviewUrl?: string;
  verificationPassed: boolean;
  verification: ProjectVerification[];
  failures: BenchmarkFailure[];
  agents: AgentRun[];
  error?: string;
}

interface BenchmarkReport {
  profile: BenchmarkProfile;
  provider: string;
  model: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  scenarios: BenchmarkScenarioResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    failureCategories: Record<BenchmarkFailureCategory, number>;
  };
}

interface CliOptions {
  limit?: number;
  scenario?: string;
  profile: BenchmarkProfile;
  list: boolean;
}

const SCENARIOS: BenchmarkScenario[] = [
  { id: "memo-tags", idea: "개인 메모와 태그 관리 MVP 만들어줘" },
  { id: "cafe-reservations", idea: "동네 카페 예약 관리 MVP 만들어줘" },
  { id: "inventory", idea: "작은 매장 재고 관리 MVP 만들어줘" },
  { id: "kanban", idea: "개인 칸반 작업 관리 MVP 만들어줘" },
  { id: "expense-tracker", idea: "프리랜서 지출과 수입 관리 MVP 만들어줘" },
  { id: "habit-tracker", idea: "매일 습관 체크와 통계 MVP 만들어줘" },
  { id: "crm-lite", idea: "소규모 영업 고객 관리 CRM MVP 만들어줘" },
  { id: "event-checkin", idea: "작은 행사 참가자 체크인 MVP 만들어줘" },
  { id: "study-planner", idea: "시험 공부 계획과 진도 관리 MVP 만들어줘" },
  { id: "feedback-board", idea: "제품 피드백 수집과 투표 MVP 만들어줘" },
];

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  process.env.PIPELINE_PROFILE = options.profile;
  const selectedScenarios = selectScenarios(options);

  if (options.list) {
    printScenarioList();
    return;
  }

  if (selectedScenarios.length === 0) {
    throw new Error("No benchmark scenarios selected.");
  }

  const startedAt = new Date();
  const { PipelineOrchestrator } = await import("../pipeline/orchestrator.js");
  const results: BenchmarkScenarioResult[] = [];

  console.log(`[mvp-benchmark] provider=${process.env.LLM_PROVIDER}`);
  console.log(`[mvp-benchmark] model=${process.env.OLLAMA_MODEL}`);
  console.log(`[mvp-benchmark] profile=${options.profile}`);
  console.log(`[mvp-benchmark] scenarios=${selectedScenarios.length}`);

  for (const scenario of selectedScenarios) {
    const orchestrator = new PipelineOrchestrator({ profile: options.profile });
    const result = await runScenario(orchestrator, scenario);
    results.push(result);
    printScenarioResult(result);
  }

  const report = createReport(startedAt, options.profile, results);
  const reportPaths = await writeReport(report);
  console.log(`[mvp-benchmark] json=${reportPaths.json}`);
  console.log(`[mvp-benchmark] markdown=${reportPaths.markdown}`);

  if (report.summary.failed > 0) {
    process.exitCode = 1;
  }
}

async function runScenario(
  orchestrator: { run: (idea: string, sessionId: string, userId: undefined, emit: (event: SSEEvent) => void) => Promise<void> },
  scenario: BenchmarkScenario,
): Promise<BenchmarkScenarioResult> {
  const sessionId = randomUUID();
  const startedAtMs = Date.now();
  const agents: AgentRun[] = [];
  const result: BenchmarkScenarioResult = {
    id: scenario.id,
    idea: scenario.idea,
    sessionId,
    status: "failed",
    startedAt: new Date(startedAtMs).toISOString(),
    durationMs: 0,
    totalTokens: 0,
    verificationPassed: false,
    verification: [],
    failures: [],
    agents,
  };

  console.log(`\n[scenario:start] ${scenario.id}`);

  try {
    await orchestrator.run(scenario.idea, sessionId, undefined, (event) => {
      if (event.type === "agent_start") {
        const agentName = String(event.data.agentName ?? event.data.agentId ?? "agent");
        process.stdout.write(`[agent:start] ${agentName}`);
      } else if (event.type === "agent_complete") {
        const agent = {
          agentId: String(event.data.agentId ?? ""),
          agentName: String(event.data.agentName ?? "agent"),
          durationMs: Number(event.data.duration ?? 0),
        };
        agents.push(agent);
        console.log(`\n[agent:complete] ${agent.agentName} (${agent.durationMs}ms)`);
      } else if (event.type === "round_complete" && event.data.skipped) {
        console.log(`[round:skipped] ${String(event.data.reason ?? "mvp profile")}`);
      } else if (event.type === "pipeline_complete") {
        result.totalTokens = Number(event.data.totalTokens ?? 0);
        result.zipPath = stringOrUndefined(event.data.zipPath);
        result.frontendPreviewUrl = stringOrUndefined(event.data.frontendPreviewUrl);
        result.verificationPassed = event.data.verificationPassed === true;
        result.verification = Array.isArray(event.data.verification)
          ? event.data.verification as ProjectVerification[]
          : [];
      } else if (event.type === "pipeline_error") {
        result.error = String(event.data.message ?? "pipeline error");
      }
    });
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  result.durationMs = Date.now() - startedAtMs;
  result.failures = classifyVerificationFailures(result.verification);
  result.status = result.verificationPassed && result.failures.length === 0 && !result.error
    ? "passed"
    : "failed";

  return result;
}

function createReport(
  startedAt: Date,
  profile: BenchmarkProfile,
  scenarios: BenchmarkScenarioResult[],
): BenchmarkReport {
  const failures = scenarios.flatMap((scenario) => scenario.failures);

  return {
    profile,
    provider: process.env.LLM_PROVIDER ?? "unknown",
    model: process.env.OLLAMA_MODEL ?? "unknown",
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
    scenarios,
    summary: {
      total: scenarios.length,
      passed: scenarios.filter((scenario) => scenario.status === "passed").length,
      failed: scenarios.filter((scenario) => scenario.status === "failed").length,
      failureCategories: summarizeFailureCategories(failures),
    },
  };
}

async function writeReport(report: BenchmarkReport): Promise<{ json: string; markdown: string }> {
  const reportDir = path.join(process.cwd(), "outputs", "benchmark-reports");
  const stamp = report.startedAt.replace(/[:.]/g, "-");
  const jsonPath = path.join(reportDir, `${report.profile}-benchmark-${stamp}.json`);
  const markdownPath = path.join(reportDir, `${report.profile}-benchmark-${stamp}.md`);

  await fs.mkdir(reportDir, { recursive: true });
  await Promise.all([
    fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`),
    fs.writeFile(markdownPath, formatMarkdownReport(report)),
  ]);

  return { json: jsonPath, markdown: markdownPath };
}

function formatMarkdownReport(report: BenchmarkReport): string {
  const lines = [
    "# MVP Benchmark Report",
    "",
    `- Provider: ${report.provider}`,
    `- Model: ${report.model}`,
    `- Profile: ${report.profile}`,
    `- Started: ${report.startedAt}`,
    `- Duration: ${formatDuration(report.durationMs)}`,
    `- Pass rate: ${report.summary.passed}/${report.summary.total}`,
    "",
    "## Scenarios",
    "",
    "| Scenario | Status | Duration | Tokens | Preview | Failures |",
    "|---|---:|---:|---:|---|---|",
  ];

  for (const scenario of report.scenarios) {
    lines.push([
      escapeCell(scenario.id),
      scenario.status,
      formatDuration(scenario.durationMs),
      scenario.totalTokens.toLocaleString(),
      scenario.frontendPreviewUrl ? "yes" : "no",
      escapeCell(scenario.failures.map((failure) => failure.category).join(", ") || "-"),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"));
  }

  lines.push("", "## Failure Categories", "");
  const categories = Object.entries(report.summary.failureCategories);
  if (categories.length === 0) {
    lines.push("No failures classified.");
  } else {
    for (const [category, count] of categories) {
      lines.push(`- ${category}: ${count}`);
    }
  }

  lines.push("", "## Details", "");
  for (const scenario of report.scenarios) {
    lines.push(`### ${scenario.id}`, "");
    lines.push(`- Idea: ${scenario.idea}`);
    lines.push(`- Session: ${scenario.sessionId}`);
    lines.push(`- ZIP: ${scenario.zipPath ?? "-"}`);
    lines.push(`- Preview: ${scenario.frontendPreviewUrl ?? "-"}`);
    if (scenario.error) lines.push(`- Error: ${scenario.error}`);
    if (scenario.failures.length === 0) {
      lines.push("- Failures: none");
    } else {
      for (const failure of scenario.failures) {
        lines.push(`- ${failure.project} ${failure.command}: ${failure.category} - ${failure.summary}`);
      }
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    profile: parseBenchmarkProfile(process.env.PIPELINE_PROFILE) ?? "fast-mvp",
    list: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--list") {
      options.list = true;
    } else if (arg === "--limit") {
      options.limit = parsePositiveInt(args[++i], "--limit");
    } else if (arg.startsWith("--limit=")) {
      options.limit = parsePositiveInt(arg.slice("--limit=".length), "--limit");
    } else if (arg === "--scenario") {
      options.scenario = args[++i];
    } else if (arg.startsWith("--scenario=")) {
      options.scenario = arg.slice("--scenario=".length);
    } else if (arg === "--profile") {
      options.profile = parseRequiredBenchmarkProfile(args[++i]);
    } else if (arg.startsWith("--profile=")) {
      options.profile = parseRequiredBenchmarkProfile(arg.slice("--profile=".length));
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function parseRequiredBenchmarkProfile(value: string | undefined): BenchmarkProfile {
  const profile = parseBenchmarkProfile(value);
  if (!profile) {
    throw new Error("--profile must be one of: fast-mvp, mvp.");
  }
  return profile;
}

function parseBenchmarkProfile(value: unknown): BenchmarkProfile | null {
  return value === "fast-mvp" || value === "mvp" ? value : null;
}

function selectScenarios(options: CliOptions): BenchmarkScenario[] {
  let selected = SCENARIOS;

  if (options.scenario) {
    selected = selected.filter((scenario) => scenario.id === options.scenario);
    if (selected.length === 0) {
      throw new Error(`Unknown scenario: ${options.scenario}`);
    }
  }

  if (options.limit !== undefined) {
    selected = selected.slice(0, options.limit);
  }

  return selected;
}

function printScenarioList(): void {
  for (const scenario of SCENARIOS) {
    console.log(`${scenario.id}\t${scenario.idea}`);
  }
}

function printScenarioResult(result: BenchmarkScenarioResult): void {
  const status = result.status.toUpperCase();
  const failureSummary = result.failures.map((failure) => failure.category).join(", ") || "none";
  console.log(`[scenario:${status}] ${result.id} duration=${formatDuration(result.durationMs)} failures=${failureSummary}`);
}

function parsePositiveInt(value: string | undefined, optionName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${optionName} must be a non-negative integer.`);
  }
  return parsed;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function formatDuration(durationMs: number): string {
  const seconds = durationMs / 1000;
  return seconds < 60 ? `${seconds.toFixed(1)}s` : `${(seconds / 60).toFixed(1)}m`;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
