import type { PipelineProfile } from "../config.js";

/**
 * Cost estimation for Claude API usage.
 * Prices as of 2025 (USD per million tokens).
 */

interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheWritePerMillion?: number;
  cacheReadPerMillion?: number;
}

const PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-6": {
    inputPerMillion: 15.0,
    outputPerMillion: 75.0,
    cacheWritePerMillion: 18.75,
    cacheReadPerMillion: 1.5,
  },
  "claude-opus-4-5": {
    inputPerMillion: 15.0,
    outputPerMillion: 75.0,
  },
  "claude-sonnet-4-6": {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheWritePerMillion: 3.75,
    cacheReadPerMillion: 0.3,
  },
  "claude-haiku-4-5": {
    inputPerMillion: 0.8,
    outputPerMillion: 4.0,
    cacheWritePerMillion: 1.0,
    cacheReadPerMillion: 0.08,
  },
};

// Estimated token counts per agent (based on empirical runs)
const AGENT_TOKEN_ESTIMATES: Record<string, { input: number; output: number }> = {
  planner:  { input: 1500,  output: 3000 },
  cto:      { input: 2000,  output: 6000 },
  pm:       { input: 8000,  output: 8000 },
  backend:  { input: 12000, output: 14000 },
  frontend: { input: 16000, output: 14000 },
  qa:       { input: 10000, output: 5000 },
  security: { input: 10000, output: 4000 },
  review:   { input: 10000, output: 4000 },
};

export interface CostEstimate {
  provider: string;
  model: string;
  minTokens: number;
  maxTokens: number;
  minCostUSD: number;
  maxCostUSD: number;
  perRoundCostUSD: number;
  roundCount: number;
  breakdown: Record<string, { tokens: number; costUSD: number }>;
}

export function estimateCost(
  model: string = "claude-opus-4-6",
  rounds: number = 3,
  provider: string = "anthropic",
  profile: PipelineProfile = "full",
): CostEstimate {
  if (provider === "ollama") {
    const totalTokens = estimateTotalTokens(rounds, profile);
    return {
      provider,
      model,
      minTokens: Math.round(totalTokens * 0.6),
      maxTokens: Math.round(totalTokens * 1.5),
      minCostUSD: 0,
      maxCostUSD: 0,
      perRoundCostUSD: 0,
      roundCount: rounds,
      breakdown: buildZeroCostBreakdown(profile),
    };
  }

  const pricing = PRICING[model] ?? PRICING["claude-opus-4-6"];

  const breakdown: Record<string, { tokens: number; costUSD: number }> = {};
  let baseTokens = 0;

  // Phase 1 agents (run once)
  for (const agent of getBaseAgents(profile)) {
    const est = AGENT_TOKEN_ESTIMATES[agent];
    const cost =
      (est.input / 1_000_000) * pricing.inputPerMillion +
      (est.output / 1_000_000) * pricing.outputPerMillion;
    breakdown[agent] = { tokens: est.input + est.output, costUSD: cost };
    baseTokens += est.input + est.output;
  }

  // Phase 2 agents (run per round)
  let roundTokens = 0;
  let roundCost = 0;
  for (const agent of ["qa", "security", "review"]) {
    const est = AGENT_TOKEN_ESTIMATES[agent];
    const cost =
      (est.input / 1_000_000) * pricing.inputPerMillion +
      (est.output / 1_000_000) * pricing.outputPerMillion;
    roundTokens += est.input + est.output;
    roundCost += cost;
  }

  const totalTokens = baseTokens + roundTokens * rounds;
  const baseCost = Object.values(breakdown).reduce((s, b) => s + b.costUSD, 0);
  const totalCost = baseCost + roundCost * rounds;

  return {
    provider,
    model,
    minTokens: Math.round(totalTokens * 0.6),
    maxTokens: Math.round(totalTokens * 1.5),
    minCostUSD: parseFloat((totalCost * 0.6).toFixed(2)),
    maxCostUSD: parseFloat((totalCost * 1.5).toFixed(2)),
    perRoundCostUSD: parseFloat(roundCost.toFixed(2)),
    roundCount: rounds,
    breakdown,
  };
}

function estimateTotalTokens(rounds: number, profile: PipelineProfile): number {
  const baseTokens = getBaseAgents(profile).reduce((sum, agent) => {
    const est = AGENT_TOKEN_ESTIMATES[agent];
    return sum + est.input + est.output;
  }, 0);
  const roundTokens = ["qa", "security", "review"].reduce((sum, agent) => {
    const est = AGENT_TOKEN_ESTIMATES[agent];
    return sum + est.input + est.output;
  }, 0);
  return baseTokens + roundTokens * rounds;
}

function buildZeroCostBreakdown(profile: PipelineProfile): Record<string, { tokens: number; costUSD: number }> {
  const agents = [
    ...getBaseAgents(profile),
    ...(profile === "full" ? ["qa", "security", "review"] : []),
  ];

  return Object.fromEntries(
    agents.map((agent) => {
      const est = AGENT_TOKEN_ESTIMATES[agent];
      return [
        agent,
        { tokens: est.input + est.output, costUSD: 0 },
      ];
    }),
  );
}

function getBaseAgents(profile: PipelineProfile): string[] {
  if (profile === "fast-mvp") {
    return ["planner", "backend", "frontend"];
  }
  return ["cto", "pm", "backend", "frontend"];
}

export function formatCost(usd: number): string {
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}
