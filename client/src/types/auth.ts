export type Plan = "free" | "starter" | "pro" | "team" | "enterprise";

export interface User {
  id: string;
  email: string;
  plan: Plan;
  runsThisMonth: number;
  runsLimit: number;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface Run {
  id: string;
  sessionId: string;
  projectIdea: string;
  status: "running" | "completed" | "error";
  totalTokens: number;
  roundCount: number;
  createdAt: string;
  durationMs: number | null;
  zipReady: boolean;
}

export interface BillingPlan {
  id: Plan;
  name: string;
  price: number;
  runsPerMonth: number;
  features: string[];
  priceId?: string | null;
}

export interface AuthResponse {
  user: User;
  token: string;
}
