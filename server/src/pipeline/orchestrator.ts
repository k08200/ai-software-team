import type {
  PipelineContext,
  SSEEvent,
  AgentOutput,
} from "../types.js";
import { CTOAgent } from "../agents/cto-agent.js";
import { PMAgent } from "../agents/pm-agent.js";
import { BackendAgent } from "../agents/backend-agent.js";
import { FrontendAgent } from "../agents/frontend-agent.js";
import { QAAgent } from "../agents/qa-agent.js";
import { SecurityAgent } from "../agents/security-agent.js";
import { ReviewAgent } from "../agents/review-agent.js";
import { BackendFixAgent, FrontendFixAgent } from "../agents/fix-agent.js";
import { TokenTracker } from "../utils/token-tracker.js";
import { FileManager } from "../utils/file-manager.js";
import { countIssues } from "../utils/issue-extractor.js";
import { estimateCost } from "../utils/cost-estimator.js";
import { saveSession } from "../utils/session-store.js";
import { config } from "../config.js";
import {
  formatVerificationReport,
  verifyGeneratedProjects,
  type ProjectVerification,
} from "../utils/project-verifier.js";
import { normalizeSmokeGeneratedProjects } from "../utils/smoke-project-normalizer.js";
import type { StreamCallback } from "../agents/base-agent.js";

const MAX_ROUNDS = config.pipeline.maxRounds;
const MIN_ROUNDS = config.pipeline.minRounds;

export class PipelineOrchestrator {
  private ctoAgent = new CTOAgent();
  private pmAgent = new PMAgent();
  private backendAgent = new BackendAgent();
  private frontendAgent = new FrontendAgent();
  private qaAgent = new QAAgent();
  private securityAgent = new SecurityAgent();
  private reviewAgent = new ReviewAgent();
  private backendFixAgent = new BackendFixAgent();
  private frontendFixAgent = new FrontendFixAgent();
  private tokenTracker = new TokenTracker();

  async run(
    projectIdea: string,
    sessionId: string,
    userId: string | undefined,
    emit: (event: SSEEvent) => void,
  ): Promise<void> {
    const fileManager = new FileManager(sessionId);
    await fileManager.ensureDir();

    const ctx: PipelineContext = {
      projectIdea,
      sessionId,
      rounds: [],
      totalTokens: 0,
      startTime: Date.now(),
    };

    // Emit cost estimate upfront
    const estimatedRounds = config.pipeline.profile === "smoke" ? 0 : MAX_ROUNDS;
    const costEstimate = estimateCost(
      config.llm.model,
      estimatedRounds,
      config.llm.provider,
    );
    emit({
      type: "pipeline_start",
      data: { projectIdea, sessionId, profile: config.pipeline.profile, costEstimate },
    });

    await saveSession({
      sessionId,
      userId,
      projectIdea,
      status: "running",
      totalTokens: 0,
      roundCount: 0,
      finalIssues: 0,
      startedAt: new Date().toISOString(),
    });

    try {
      // ─── Phase 1: CTO ────────────────────────────────────────────
      ctx.architecture = await this.runAgent(
        "cto", "CTO Agent",
        this.ctoAgent.buildPrompt(projectIdea),
        emit,
        (o) => fileManager.saveAgentOutput(o),
      );

      // ─── Phase 2: PM ─────────────────────────────────────────────
      ctx.prd = await this.runAgent(
        "pm", "PM Agent",
        this.pmAgent.buildPrompt(projectIdea, ctx.architecture),
        emit,
        (o) => fileManager.saveAgentOutput(o),
      );

      // ─── Phase 3: Backend ─────────────────────────────────────────
      ctx.backendCode = await this.runAgent(
        "backend", "Backend Agent",
        this.backendAgent.buildPrompt(projectIdea, ctx.architecture, ctx.prd),
        emit,
        (o) => fileManager.saveAgentOutput(o),
      );

      // ─── Phase 4: Frontend ────────────────────────────────────────
      ctx.frontendCode = await this.runAgent(
        "frontend", "Frontend Agent",
        this.frontendAgent.buildPrompt(
          projectIdea,
          ctx.architecture,
          ctx.prd,
          ctx.backendCode,
        ),
        emit,
        (o) => fileManager.saveAgentOutput(o),
      );

      if (config.pipeline.profile === "smoke") {
        emit({
          type: "round_complete",
          data: {
            round: 0,
            totalIssues: 0,
            applying_fixes: false,
            skipped: true,
            reason: "PIPELINE_PROFILE=smoke",
          },
        });
      } else {
        await this.runIterationLoop(projectIdea, fileManager, ctx, emit);
      }

      // ─── Create ZIP ────────────────────────────────────────────────
      // Save raw final responses and materialize markdown code blocks as files
      await Promise.all([
        fileManager.saveFile("final-backend.md", ctx.backendCode ?? ""),
        fileManager.saveFile("final-frontend.md", ctx.frontendCode ?? ""),
        fileManager.saveMarkdownCodeBlocksAsFiles(
          ctx.backendCode ?? "",
          "generated/backend",
          "BACKEND_RESPONSE.md",
        ),
        fileManager.saveMarkdownCodeBlocksAsFiles(
          ctx.frontendCode ?? "",
          "generated/frontend",
          "FRONTEND_RESPONSE.md",
        ),
      ]);

      if (config.pipeline.profile === "smoke") {
        await normalizeSmokeGeneratedProjects(fileManager.getOutputDir());
      }

      const verification = await verifyGeneratedProjects(fileManager.getOutputDir());
      await this.saveSummary(fileManager, ctx, verification);

      const finalIssues = ctx.rounds[ctx.rounds.length - 1]?.issues.total ?? 0;
      const totalTokens = this.tokenTracker.getTotalTokens();
      const duration = Date.now() - ctx.startTime;
      const zipPath = await fileManager.createZip();
      const relativePath = zipPath.replace(process.cwd(), "");

      await saveSession({
        sessionId,
        userId,
        projectIdea,
        status: "completed",
        totalTokens,
        roundCount: ctx.rounds.length,
        finalIssues,
        startedAt: new Date(ctx.startTime).toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: duration,
        zipPath: relativePath,
      });

      emit({
        type: "pipeline_complete",
        data: {
          totalTokens,
          tokenSummary: this.tokenTracker.getSummary(),
          roundCount: ctx.rounds.length,
          finalIssues,
          zipPath: relativePath,
          sessionId,
          duration,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      emit({ type: "pipeline_error", data: { message } });

      await saveSession({
        sessionId,
        userId,
        projectIdea,
        status: "error",
        totalTokens: this.tokenTracker.getTotalTokens(),
        roundCount: ctx.rounds.length,
        finalIssues: 0,
        startedAt: new Date(ctx.startTime).toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - ctx.startTime,
      }).catch(() => {});

      throw error;
    }
  }

  // ── Helper: run an agent and return just the content string ───────
  private async runAgent(
    agentId: string,
    agentName: string,
    prompt: string,
    emit: (event: SSEEvent) => void,
    onSave?: (output: AgentOutput) => Promise<string>,
    round?: number,
  ): Promise<string> {
    const output = await this.runAgentWithOutput(
      agentId, agentName, prompt, emit, onSave, round,
    );
    return output.content;
  }

  // ── Helper: run an agent and return full AgentOutput ──────────────
  private async runAgentWithOutput(
    agentId: string,
    agentName: string,
    prompt: string,
    emit: (event: SSEEvent) => void,
    onSave?: (output: AgentOutput) => Promise<string>,
    round?: number,
  ): Promise<AgentOutput> {
    emit({ type: "agent_start", data: { agentId, agentName } });

    const agent = this.getAgent(agentId);

    const onStream: StreamCallback = (streamEvent) => {
      if (streamEvent.type === "thinking") {
        emit({ type: "agent_thinking", data: { agentId, content: streamEvent.content } });
      } else if (streamEvent.type === "text") {
        emit({ type: "agent_output", data: { agentId, content: streamEvent.content } });
      } else if (streamEvent.type === "complete") {
        this.tokenTracker.add({
          agentId: agentId as never,
          inputTokens: streamEvent.inputTokens ?? 0,
          outputTokens: streamEvent.outputTokens ?? 0,
          round,
        });
        emit({
          type: "token_update",
          data: {
            agentId,
            inputTokens: streamEvent.inputTokens,
            outputTokens: streamEvent.outputTokens,
            totalTokens: this.tokenTracker.getTotalTokens(),
          },
        });
      }
    };

    const output = await agent.run(prompt, onStream, round);

    if (onSave) {
      const filepath = await onSave(output);
      emit({ type: "file_saved", data: { agentId, filepath } });
    }

    emit({
      type: "agent_complete",
      data: {
        agentId,
        agentName,
        tokensUsed: output.tokensUsed,
        inputTokens: output.inputTokens,
        outputTokens: output.outputTokens,
        duration: output.duration,
      },
    });

    return output;
  }

  private getAgent(agentId: string): { run: (p: string, cb: StreamCallback, round?: number) => Promise<AgentOutput> } {
    const agents: Record<string, { run: (p: string, cb: StreamCallback) => Promise<AgentOutput> }> = {
      cto:      this.ctoAgent,
      pm:       this.pmAgent,
      backend:  this.backendAgent,
      frontend: this.frontendAgent,
      qa:       this.qaAgent,
      security: this.securityAgent,
      review:   this.reviewAgent,
      "Backend Fix Agent": this.backendFixAgent,
      "Frontend Fix Agent": this.frontendFixAgent,
    };
    const agent = agents[agentId] ?? agents[`${agentId} Fix Agent`];
    if (!agent) throw new Error(`Unknown agent: ${agentId}`);
    return agent;
  }

  private async runIterationLoop(
    projectIdea: string,
    fileManager: FileManager,
    ctx: PipelineContext,
    emit: (event: SSEEvent) => void,
  ): Promise<void> {
    let round = 0;
    let totalIssues = Infinity;

    while (
      (round < MIN_ROUNDS || totalIssues > 0) &&
      round < MAX_ROUNDS
    ) {
      round++;
      emit({ type: "round_start", data: { round } });

      const prevRound = ctx.rounds[round - 2];
      const [qaOutput, securityOutput] = await Promise.all([
        this.runAgentWithOutput(
          "qa", "QA Agent",
          this.qaAgent.buildPrompt(
            projectIdea,
            ctx.prd ?? "",
            ctx.backendCode ?? "",
            ctx.frontendCode ?? "",
            round,
            prevRound?.qaOutput.content,
          ),
          emit,
          (o) => fileManager.saveAgentOutput({ ...o, agentId: "qa" as const }),
          round,
        ),
        this.runAgentWithOutput(
          "security", "Security Agent",
          this.securityAgent.buildPrompt(
            projectIdea,
            ctx.backendCode ?? "",
            ctx.frontendCode ?? "",
            round,
            prevRound?.securityOutput.content,
          ),
          emit,
          (o) => fileManager.saveAgentOutput({ ...o, agentId: "security" as const }),
          round,
        ),
      ]);

      const reviewOutput = await this.runAgentWithOutput(
        "review", "Review Agent",
        this.reviewAgent.buildPrompt(
          projectIdea,
          ctx.architecture ?? "",
          ctx.backendCode ?? "",
          ctx.frontendCode ?? "",
          round,
          qaOutput.content,
          securityOutput.content,
        ),
        emit,
        (o) => fileManager.saveAgentOutput({ ...o, agentId: "review" as const }),
        round,
      );

      const issues = countIssues(
        qaOutput.content,
        securityOutput.content,
        reviewOutput.content,
      );
      totalIssues = issues.total;

      ctx.rounds.push({
        round,
        qaOutput,
        securityOutput,
        reviewOutput,
        issues,
      });

      emit({
        type: "issues_update",
        data: {
          round,
          qaIssues: issues.qa.length,
          securityIssues: issues.security.length,
          reviewIssues: issues.review.length,
          total: issues.total,
        },
      });

      if (totalIssues > 0 && round < MAX_ROUNDS) {
        emit({
          type: "round_complete",
          data: { round, totalIssues, applying_fixes: true },
        });

        const backendFixPromise: Promise<string> =
          issues.qa.length + issues.security.length > 0
            ? this.runAgent(
                "backend", "Backend Fix Agent",
                this.backendFixAgent.buildPrompt(
                  ctx.backendCode ?? "",
                  issues.qa.slice(0, 10).join("\n"),
                  issues.security.slice(0, 10).join("\n"),
                  issues.review.slice(0, 5).join("\n"),
                  ctx.architecture ?? "",
                ),
                emit,
                (o) => fileManager.saveFile(`round-${round}-backend-fixed.ts`, o.content),
              )
            : Promise.resolve(ctx.backendCode ?? "");

        const frontendFixPromise: Promise<string> =
          issues.qa.length + issues.review.length > 0
            ? this.runAgent(
                "frontend", "Frontend Fix Agent",
                this.frontendFixAgent.buildPrompt(
                  ctx.frontendCode ?? "",
                  issues.qa.slice(0, 10).join("\n"),
                  issues.review.slice(0, 5).join("\n"),
                ),
                emit,
                (o) => fileManager.saveFile(`round-${round}-frontend-fixed.tsx`, o.content),
              )
            : Promise.resolve(ctx.frontendCode ?? "");

        const [fixedBackend, fixedFrontend] = await Promise.all([
          backendFixPromise,
          frontendFixPromise,
        ]);

        ctx.backendCode = fixedBackend;
        ctx.frontendCode = fixedFrontend;
      } else {
        emit({
          type: "round_complete",
          data: { round, totalIssues, applying_fixes: false },
        });
      }
    }
  }

  private async saveSummary(
    fileManager: FileManager,
    ctx: PipelineContext,
    verification: ProjectVerification[],
  ): Promise<void> {
    const roundSummary = ctx.rounds.length > 0
      ? ctx.rounds
          .map((r) => `Round ${r.round}: ${r.issues.total} issues (QA: ${r.issues.qa.length}, Security: ${r.issues.security.length}, Review: ${r.issues.review.length})`)
          .join("\n")
      : "No review rounds were run for this profile.";

    const summary = `# AI Software Team — Generation Summary

## Project Idea
${ctx.projectIdea}

## Session ID
${ctx.sessionId}

## Token Usage
Total: ${this.tokenTracker.getTotalTokens().toLocaleString()} tokens
${Object.entries(this.tokenTracker.getSummary())
  .filter(([k]) => k !== "total")
  .map(([k, v]) => `- ${k}: ${(v as number).toLocaleString()}`)
  .join("\n")}

## Iteration Rounds
Profile: ${config.pipeline.profile}

${roundSummary}

${formatVerificationReport(verification)}

## Generated At
${new Date().toISOString()}

## Duration
${((Date.now() - ctx.startTime) / 1000).toFixed(1)}s
`;

    await fileManager.saveFile("SUMMARY.md", summary);
  }
}
