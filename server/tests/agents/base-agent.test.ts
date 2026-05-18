import { afterEach, describe, it, expect, vi } from "vitest";
import { BaseAgent } from "../../src/agents/base-agent.js";
import type { AgentConfig } from "../../src/types.js";

// Concrete subclass for testing
class TestAgent extends BaseAgent {
  constructor(config?: Partial<AgentConfig>) {
    super({
      agentId: "cto",
      agentName: "Test Agent",
      systemPrompt: "You are a test agent.",
      maxTokens: 1000,
      ...config,
    });
  }
}

describe("BaseAgent", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("initializes with correct config", () => {
    const agent = new TestAgent();
    expect(agent.config.agentId).toBe("cto");
    expect(agent.config.agentName).toBe("Test Agent");
    expect(agent.config.maxTokens).toBe(1000);
  });

  it("uses model from env or default", () => {
    const agent = new TestAgent();
    expect(agent.config.model.length).toBeGreaterThan(0);
  });

  it("applies default thinking budget", () => {
    const agent = new TestAgent();
    expect(agent.config.thinkingBudget).toBeGreaterThan(0);
  });

  it("throws on API error with agent name in message", async () => {
    const agent = new TestAgent();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Provider unavailable")));

    await expect(
      agent.run("test prompt", vi.fn()),
    ).rejects.toThrow("[Test Agent]");
  });
});
