import { describe, expect, it } from "vitest";
import { estimateCost } from "../../src/utils/cost-estimator.js";

describe("estimateCost", () => {
  it("uses the compressed planner flow for fast MVP estimates", () => {
    const fast = estimateCost("qwen2.5-coder:14b", 0, "ollama", "fast-mvp");
    const mvp = estimateCost("qwen2.5-coder:14b", 0, "ollama", "mvp");

    expect(fast.breakdown.planner.tokens).toBeGreaterThan(0);
    expect(fast.breakdown.cto).toBeUndefined();
    expect(fast.breakdown.pm).toBeUndefined();
    expect(fast.maxTokens).toBeLessThan(mvp.maxTokens);
  });
});
