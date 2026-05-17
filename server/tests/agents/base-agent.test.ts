import { describe, it, expect, vi, beforeEach } from "vitest";
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
  it("initializes with correct config", () => {
    const agent = new TestAgent();
    expect(agent.config.agentId).toBe("cto");
    expect(agent.config.agentName).toBe("Test Agent");
    expect(agent.config.maxTokens).toBe(1000);
  });

  it("uses model from env or default", () => {
    const agent = new TestAgent();
    expect(agent.config.model).toMatch(/claude/);
  });

  it("applies default thinking budget", () => {
    const agent = new TestAgent();
    expect(agent.config.thinkingBudget).toBeGreaterThan(0);
  });

  it("throws on API error with agent name in message", async () => {
    const agent = new TestAgent();
    // Override client to throw
    (agent as unknown as { client: { messages: { stream: () => never } } }).client = {
      messages: {
        stream: () => {
          throw new Error("Rate limit exceeded");
        },
      },
    };

    await expect(
      agent.run("test prompt", vi.fn()),
    ).rejects.toThrow("[Test Agent] API error");
  });
});
