import type {
  PipelineContext,
  SSEEvent,
  AgentOutput,
  RoundResult,
} from "../types.js";
import { CTOAgent } from "../agents/cto-agent.js";
import { PMAgent } from "../agents/pm-agent.js";
import { BackendAgent } from "../agents/backend-agent.js";
import { FrontendAgent } from "../agents/frontend-agent.js";
import { QAAgent } from "../agents/qa-agent.js";
import { SecurityAgent } from "../agents/security-agent.js";
import { ReviewAgent } from "../agents/review-agent.js";
import { TokenTracker } from "../utils/token-tracker.js";
import { FileManager } from "../utils/file-manager.js";
import { countIssues } from "../utils/issue-extractor.js";
import { estimateCost } from "../utils/cost-estimator.js";
import { saveSession } from "../utils/session-store.js";

const MAX_ROUNDS = parseInt(process.env.MAX_ROUNDS ?? "3", 10);
const MIN_ROUNDS = parseInt(process.env.MIN_ROUNDS ?? "3", 10);

export class PipelineOrchestrator {
  private ctoAgent = new CTOAgent();
  private pmAgent = new PMAgent();
  private backendAgent = new BackendAgent();
  private frontendAgent = new FrontendAgent();
  private qaAgent = new QAAgent();
  private securityAgent = new SecurityAgent();
  private reviewAgent = new ReviewAgent();
  private tokenTracker = new TokenTracker();

  async run(
    projectIdea: string,
    sessionId: string,
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

    // Emit cost estimate upfront so user knows what to expect
    const costEstimate = estimateCost(
      process.env.ANTHROPIC_MODEL ?? "claude-opus-4-6",
      MAX_ROUNDS,
    );
    emit({
      type: "pipeline_start",
      data: { projectIdea, sessionId, costEstimate },
    });

    // Save session as running
    await saveSession({
      sessionId,
      projectIdea,
      status: "running",
      totalTokens: 0,
      roundCount: 0,
      finalIssues: 0,
      startedAt: new Date().toISOString(),
    });

    try {
      // Phase 1: CTO Agent
      ctx.architecture = await this.runAgent(
        "cto",
        "CTO Agent",
        this.ctoAgent.buildPrompt(projectIdea),
        emit,
        (output) => fileManager.saveAgentOutput(output),
      );

      // Phase 2: PM Agent
      ctx.prd = await this.runAgent(
        "pm",
        "PM Agent",
        this.pmAgent.buildPrompt(projectIdea, ctx.architecture),
        emit,
        (output) => fileManager.saveAgentOutput(output),
      );

      // Phase 3: Backend Agent
      ctx.backendCode = await this.runAgent(
        "backend",
        "Backend Agent",
        this.backendAgent.buildPrompt(
          projectIdea,
          ctx.architecture,
          ctx.prd,
        ),
        emit,
        (output) => fileManager.saveAgentOutput(output),
      );

      // Phase 4: Frontend Agent
      ctx.frontendCode = await this.runAgent(
        "frontend",
        "Frontend Agent",
        this.frontendAgent.buildPrompt(
          projectIdea,
          ctx.architecture,
          ctx.prd,
          ctx.backendCode,
        ),
        emit,
        (output) => fileManager.saveAgentOutput(output),
      );

      // Phase 5: Iteration loop (QA + Security + Review)
      let round = 0;
      let totalIssues = Infinity;
      let previousQAIssues = "";
      let previousSecurityIssues = "";

      while (
        (round < MIN_ROUNDS || totalIssues > 0) &&
        round < MAX_ROUNDS
      ) {
        round++;
        emit({ type: "round_start", data: { round } });

        const qaOutput = await this.runAgentWithOutput(
          "qa",
          "QA Agent",
          this.qaAgent.buildPrompt(
            projectIdea,
            ctx.prd,
            ctx.backendCode,
            ctx.frontendCode,
            round,
            previousQAIssues,
          ),
          emit,
          (output) => fileManager.saveAgentOutput({ ...output, agentId: "qa" as const }),
        );

        const securityOutput = await this.runAgentWithOutput(
          "security",
          "Security Agent",
          this.securityAgent.buildPrompt(
            projectIdea,
            ctx.backendCode,
            ctx.frontendCode,
            round,
            previousSecurityIssues,
          ),
          emit,
          (output) => fileManager.saveAgentOutput({ ...output, agentId: "security" as const }),
        );

        const reviewOutput = await this.runAgentWithOutput(
          "review",
          "Review Agent",
          this.reviewAgent.buildPrompt(
            projectIdea,
            ctx.architecture,
            ctx.backendCode,
            ctx.frontendCode,
            round,
            qaOutput.content,
            securityOutput.content,
          ),
          emit,
          (output) => fileManager.saveAgentOutput({ ...output, agentId: "review" as const }),
        );

        const issues = countIssues(
          qaOutput.content,
          securityOutput.content,
          reviewOutput.content,
        );

        totalIssues = issues.total;
        previousQAIssues = qaOutput.content.substring(0, 2000);
        previousSecurityIssues = securityOutput.content.substring(0, 2000);

        const roundResult: RoundResult = {
          round,
          qaOutput,
          securityOutput,
          reviewOutput,
          issues,
        };
        ctx.rounds.push(roundResult);

        emit({
          type: "round_complete",
          data: {
            round,
            issues,
            totalIssues: issues.total,
          },
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
      }

      // Create zip archive
      const zipPath = await fileManager.createZip();
      const relativePath = zipPath.replace(process.cwd(), "");

      // Save summary
      await this.saveSummary(fileManager, ctx);

      const finalIssues = ctx.rounds[ctx.rounds.length - 1]?.issues.total ?? 0;
      const totalTokens = this.tokenTracker.getTotalTokens();
      const duration = Date.now() - ctx.startTime;

      // Persist completed session
      await saveSession({
        sessionId,
        projectIdea,
        status: "completed",
        totalTokens,
        roundCount: round,
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
          roundCount: round,
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
        projectIdea,
        status: "error",
        totalTokens: this.tokenTracker.getTotalTokens(),
        roundCount: ctx.rounds.length,
        finalIssues: 0,
        startedAt: new Date(ctx.startTime).toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - ctx.startTime,
      }).catch(() => {}); // Non-fatal

      throw error;
    }
  }

  private async runAgent(
    agentId: string,
    agentName: string,
    prompt: string,
    emit: (event: SSEEvent) => void,
    onSave?: (output: AgentOutput) => Promise<string>,
  ): Promise<string> {
    const output = await this.runAgentWithOutput(
      agentId,
      agentName,
      prompt,
      emit,
      onSave,
    );
    return output.content;
  }

  private async runAgentWithOutput(
    agentId: string,
    agentName: string,
    prompt: string,
    emit: (event: SSEEvent) => void,
    onSave?: (output: AgentOutput) => Promise<string>,
  ): Promise<AgentOutput> {
    emit({
      type: "agent_start",
      data: { agentId, agentName },
    });

    const agent = this.getAgent(agentId);

    const output = await agent.run(prompt, (streamEvent) => {
      if (streamEvent.type === "thinking") {
        emit({
          type: "agent_thinking",
          data: { agentId, content: streamEvent.content },
        });
      } else if (streamEvent.type === "text") {
        emit({
          type: "agent_output",
          data: { agentId, content: streamEvent.content },
        });
      } else if (streamEvent.type === "complete") {
        this.tokenTracker.add({
          agentId: agentId as never,
          inputTokens: streamEvent.inputTokens ?? 0,
          outputTokens: streamEvent.outputTokens ?? 0,
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
    });

    if (onSave) {
      const filepath = await onSave(output);
      emit({
        type: "file_saved",
        data: { agentId, filepath },
      });
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

  private getAgent(agentId: string) {
    const agents: Record<string, { run: (prompt: string, cb: (e: { type: string; content: string; inputTokens?: number; outputTokens?: number }) => void) => Promise<AgentOutput> }> = {
      cto: this.ctoAgent,
      pm: this.pmAgent,
      backend: this.backendAgent,
      frontend: this.frontendAgent,
      qa: this.qaAgent,
      security: this.securityAgent,
      review: this.reviewAgent,
    };
    const agent = agents[agentId];
    if (!agent) throw new Error(`Unknown agent: ${agentId}`);
    return agent;
  }

  private async saveSummary(
    fileManager: FileManager,
    ctx: PipelineContext,
  ): Promise<void> {
    const roundSummary = ctx.rounds
      .map(
        (r) =>
          `Round ${r.round}: ${r.issues.total} issues (QA: ${r.issues.qa.length}, Security: ${r.issues.security.length}, Review: ${r.issues.review.length})`,
      )
      .join("\n");

    const summary = `# AI Software Team - Generation Summary

## Project Idea
${ctx.projectIdea}

## Session ID
${ctx.sessionId}

## Token Usage
Total: ${this.tokenTracker.getTotalTokens().toLocaleString()} tokens
${Object.entries(this.tokenTracker.getSummary())
  .filter(([k]) => k !== "total")
  .map(([k, v]) => `- ${k}: ${v.toLocaleString()}`)
  .join("\n")}

## Iteration Rounds
${roundSummary}

## Generated At
${new Date().toISOString()}

## Duration
${((Date.now() - ctx.startTime) / 1000).toFixed(1)}s
`;

    await fileManager.saveFile("SUMMARY.md", summary);
  }
}
