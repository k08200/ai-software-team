import { describe, it, expect, beforeEach } from "vitest";
import { usePipelineStore } from "../../src/store/pipeline-store.js";

describe("usePipelineStore", () => {
  beforeEach(() => {
    usePipelineStore.getState().resetPipeline();
  });

  it("initializes in idle state", () => {
    const { status, totalTokens, rounds } = usePipelineStore.getState();
    expect(status).toBe("idle");
    expect(totalTokens).toBe(0);
    expect(rounds).toHaveLength(0);
  });

  it("transitions to running on startPipeline", () => {
    usePipelineStore.getState().startPipeline();
    expect(usePipelineStore.getState().status).toBe("running");
  });

  it("sets all agents to pending on start", () => {
    usePipelineStore.getState().startPipeline();
    const { agents } = usePipelineStore.getState();
    for (const agent of Object.values(agents)) {
      expect(agent.status).toBe("pending");
    }
  });

  it("handles agent_start event", () => {
    usePipelineStore.getState().handleSSEEvent("agent_start", { agentId: "cto", agentName: "CTO Agent" });
    const { agents } = usePipelineStore.getState();
    expect(agents.cto.status).toBe("running");
  });

  it("handles agent_output event (appends content)", () => {
    usePipelineStore.getState().handleSSEEvent("agent_output", { agentId: "cto", content: "Hello " });
    usePipelineStore.getState().handleSSEEvent("agent_output", { agentId: "cto", content: "World" });
    expect(usePipelineStore.getState().agents.cto.output).toBe("Hello World");
  });

  it("handles agent_thinking event", () => {
    usePipelineStore.getState().handleSSEEvent("agent_thinking", { agentId: "cto", content: "Let me think..." });
    const { agents } = usePipelineStore.getState();
    expect(agents.cto.status).toBe("thinking");
    expect(agents.cto.thinkingOutput).toBe("Let me think...");
  });

  it("handles agent_complete event", () => {
    usePipelineStore.getState().handleSSEEvent("agent_complete", {
      agentId: "cto",
      inputTokens: 100,
      outputTokens: 200,
      duration: 5000,
    });
    const { agents } = usePipelineStore.getState();
    expect(agents.cto.status).toBe("completed");
    expect(agents.cto.inputTokens).toBe(100);
    expect(agents.cto.outputTokens).toBe(200);
  });

  it("handles token_update event", () => {
    usePipelineStore.getState().handleSSEEvent("token_update", { totalTokens: 12345 });
    expect(usePipelineStore.getState().totalTokens).toBe(12345);
  });

  it("handles issues_update event", () => {
    usePipelineStore.getState().handleSSEEvent("issues_update", {
      round: 1,
      qaIssues: 5,
      securityIssues: 3,
      reviewIssues: 2,
      total: 10,
    });
    const { rounds } = usePipelineStore.getState();
    expect(rounds).toHaveLength(1);
    expect(rounds[0].total).toBe(10);
    expect(rounds[0].qaIssues).toBe(5);
  });

  it("handles pipeline_complete event", () => {
    usePipelineStore.getState().handleSSEEvent("pipeline_complete", {
      totalTokens: 50000,
      verificationPassed: true,
      frontendPreviewUrl: "/api/pipeline/app-preview/test-session/",
      verification: [
        {
          name: "Backend",
          relativePath: "generated/backend",
          fileCount: 3,
          hasPackageJson: true,
          commands: [
            { command: "npm install", status: "passed", durationMs: 100 },
            { command: "npm run build", status: "passed", durationMs: 200 },
          ],
        },
      ],
    });
    const state = usePipelineStore.getState();
    expect(state.status).toBe("completed");
    expect(state.zipReady).toBe(true);
    expect(state.totalTokens).toBe(50000);
    expect(state.generatedVerificationPassed).toBe(true);
    expect(state.frontendPreviewUrl).toBe("/api/pipeline/app-preview/test-session/");
    expect(state.generatedVerification[0].commands[1].status).toBe("passed");
  });

  it("handles pipeline_error event", () => {
    usePipelineStore.getState().handleSSEEvent("pipeline_error", {
      message: "Rate limit exceeded",
    });
    const state = usePipelineStore.getState();
    expect(state.status).toBe("error");
    expect(state.errorMessage).toBe("Rate limit exceeded");
  });

  it("toggles thinking visibility", () => {
    expect(usePipelineStore.getState().agents.cto.isThinkingVisible).toBe(false);
    usePipelineStore.getState().toggleThinking("cto");
    expect(usePipelineStore.getState().agents.cto.isThinkingVisible).toBe(true);
    usePipelineStore.getState().toggleThinking("cto");
    expect(usePipelineStore.getState().agents.cto.isThinkingVisible).toBe(false);
  });

  it("resets to initial state", () => {
    usePipelineStore.getState().startPipeline();
    usePipelineStore.getState().handleSSEEvent("token_update", { totalTokens: 9999 });
    usePipelineStore.getState().resetPipeline();

    const state = usePipelineStore.getState();
    expect(state.status).toBe("idle");
    expect(state.totalTokens).toBe(0);
  });
});
