/**
 * Central configuration — all env vars accessed here, never directly inline.
 * Fails fast on missing required vars at startup.
 */

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

function optionalInt(key: string, fallback: number): number {
  const val = process.env[key];
  if (!val) return fallback;
  const n = parseInt(val, 10);
  if (isNaN(n)) throw new Error(`Env var ${key} must be an integer, got: ${val}`);
  return n;
}

export const config = {
  port: optionalInt("PORT", 3001),
  nodeEnv: optional("NODE_ENV", "development"),
  clientOrigin: optional("CLIENT_ORIGIN", "http://localhost:3000"),

  demoMode: optional("DEMO_MODE", "false") === "true",

  llm: {
    provider: optional("LLM_PROVIDER", "ollama") as "ollama" | "anthropic",
    model: optional("LLM_PROVIDER", "ollama") === "anthropic"
      ? optional("ANTHROPIC_MODEL", "claude-opus-4-6")
      : optional("OLLAMA_MODEL", "qwen2.5-coder:14b"),
  },

  anthropic: {
    // In demo/Ollama mode the API key is not used — skip the required() check
    apiKey: optional("DEMO_MODE", "false") === "true" || optional("LLM_PROVIDER", "ollama") !== "anthropic"
      ? optional("ANTHROPIC_API_KEY", "demo-key")
      : required("ANTHROPIC_API_KEY"),
    model: optional("ANTHROPIC_MODEL", "claude-opus-4-6"),
    thinkingBudget: optionalInt("THINKING_BUDGET", 8000),
  },

  ollama: {
    baseUrl: optional("OLLAMA_BASE_URL", "http://localhost:11434"),
    model: optional("OLLAMA_MODEL", "qwen2.5-coder:14b"),
  },

  pipeline: {
    maxRounds: optionalInt("MAX_ROUNDS", 3),
    minRounds: optionalInt("MIN_ROUNDS", 3),
    maxConcurrent: optionalInt("MAX_CONCURRENT_PIPELINES", 3),
    outputTtlHours: optionalInt("OUTPUT_TTL_HOURS", 24),
  },

  database: {
    url: optional("DATABASE_URL", ""),
    poolMin: optionalInt("DB_POOL_MIN", 2),
    poolMax: optionalInt("DB_POOL_MAX", 10),
  },

  auth: {
    jwtSecret: optional("JWT_SECRET", "dev-secret-change-in-production"),
    jwtExpiresIn: optional("JWT_EXPIRES_IN", "7d"),
    bcryptRounds: optionalInt("BCRYPT_ROUNDS", 12),
  },

  stripe: {
    secretKey: optional("STRIPE_SECRET_KEY", ""),
    webhookSecret: optional("STRIPE_WEBHOOK_SECRET", ""),
    prices: {
      starter: optional("STRIPE_PRICE_STARTER", ""),
      pro: optional("STRIPE_PRICE_PRO", ""),
      team: optional("STRIPE_PRICE_TEAM", ""),
      enterprise: optional("STRIPE_PRICE_ENTERPRISE", ""),
    },
  },

  rateLimit: {
    pipelineMax: optionalInt("RATE_LIMIT_PIPELINE_MAX", 5),
    pipelineWindowMs: optionalInt("RATE_LIMIT_PIPELINE_WINDOW_MS", 15 * 60 * 1000),
  },

  plans: {
    free:       { runsPerMonth: 3,   label: "Free",       price: 0 },
    starter:    { runsPerMonth: 30,  label: "Starter",    price: 29 },
    pro:        { runsPerMonth: 150, label: "Pro",         price: 99 },
    team:       { runsPerMonth: 500, label: "Team",        price: 299 },
    enterprise: { runsPerMonth: -1,  label: "Enterprise",  price: -1 }, // unlimited = -1
  } as const,
} as const;

export type PlanName = keyof typeof config.plans;
