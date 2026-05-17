import { describe, it, expect, beforeEach } from "vitest";
import { TokenTracker } from "../../src/utils/token-tracker.js";

describe("TokenTracker", () => {
  let tracker: TokenTracker;

  beforeEach(() => {
    tracker = new TokenTracker();
  });

  it("starts with zero tokens", () => {
    expect(tracker.getTotalTokens()).toBe(0);
  });

  it("tracks input and output tokens", () => {
    tracker.add({ agentId: "cto", inputTokens: 100, outputTokens: 200 });
    expect(tracker.getTotalInputTokens()).toBe(100);
    expect(tracker.getTotalOutputTokens()).toBe(200);
    expect(tracker.getTotalTokens()).toBe(300);
  });

  it("accumulates across multiple agents", () => {
    tracker.add({ agentId: "cto", inputTokens: 100, outputTokens: 200 });
    tracker.add({ agentId: "pm", inputTokens: 150, outputTokens: 300 });
    tracker.add({ agentId: "backend", inputTokens: 200, outputTokens: 500 });

    expect(tracker.getTotalTokens()).toBe(1450);
  });

  it("filters by agent id", () => {
    tracker.add({ agentId: "cto", inputTokens: 100, outputTokens: 200 });
    tracker.add({ agentId: "pm", inputTokens: 50, outputTokens: 100 });
    tracker.add({ agentId: "cto", inputTokens: 50, outputTokens: 100 });

    const ctoRecords = tracker.getByAgent("cto");
    expect(ctoRecords).toHaveLength(2);
  });

  it("generates correct summary", () => {
    tracker.add({ agentId: "cto", inputTokens: 100, outputTokens: 200 });
    tracker.add({ agentId: "pm", inputTokens: 50, outputTokens: 100 });

    const summary = tracker.getSummary();
    expect(summary.cto).toBe(300);
    expect(summary.pm).toBe(150);
    expect(summary.total).toBe(450);
  });

  it("resets to zero", () => {
    tracker.add({ agentId: "cto", inputTokens: 500, outputTokens: 1000 });
    tracker.reset();
    expect(tracker.getTotalTokens()).toBe(0);
  });

  it("tracks round-specific tokens", () => {
    tracker.add({ agentId: "qa", inputTokens: 100, outputTokens: 200, round: 1 });
    tracker.add({ agentId: "qa", inputTokens: 80, outputTokens: 150, round: 2 });

    const summary = tracker.getSummary();
    expect(summary.qa_round1).toBe(300);
    expect(summary.qa_round2).toBe(230);
  });
});
