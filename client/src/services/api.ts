import axios, { type AxiosError, type AxiosResponse } from "axios";
import type { AuthResponse, User, ApiKey, Run, BillingPlan } from "../types/auth.js";

// Server-side session shape (pipeline/sessions endpoint)
interface SessionRecord {
  sessionId: string;
  projectIdea: string;
  status: "running" | "completed" | "error";
  totalTokens: number;
  roundCount: number;
  finalIssues: number;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  zipPath?: string;
}

// Server-side billing plan shape (priceUsd instead of price)
interface ServerPlan {
  id: string;
  name: string;
  priceUsd: number | null;
  runsPerMonth: number | null;
  features: readonly string[];
  priceId: string | null;
}

// Server-side CreatedApiKey shape (returned once on key creation)
interface CreatedApiKeyServer {
  id: string;
  name: string;
  prefix: string;
  isActive: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
  rawKey: string;
}

// Server PublicUser shape (differs from client User type)
interface PublicUser {
  id: string;
  email: string;
  plan: "free" | "starter" | "pro" | "team" | "enterprise";
  runCountCurrentPeriod: number;
  [key: string]: unknown;
}

const PLAN_LIMITS: Record<string, number> = {
  free: 3,
  starter: 30,
  pro: 150,
  team: 500,
  enterprise: -1,
};

function toUser(u: PublicUser): User {
  const limit = PLAN_LIMITS[u.plan] ?? 3;
  return {
    id: u.id,
    email: u.email,
    plan: u.plan,
    runsThisMonth: u.runCountCurrentPeriod ?? 0,
    runsLimit: limit,
  };
}

function toRun(s: SessionRecord): Run {
  return {
    id: s.sessionId,
    sessionId: s.sessionId,
    projectIdea: s.projectIdea,
    status: s.status,
    totalTokens: s.totalTokens,
    roundCount: s.roundCount,
    createdAt: s.startedAt,          // map startedAt → createdAt
    durationMs: s.durationMs ?? null,
    zipReady: !!s.zipPath,
  };
}

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "/api",
  headers: { "Content-Type": "application/json" },
  timeout: 30_000,
});

// ---------------------------------------------------------------------------
// Interceptors
// ---------------------------------------------------------------------------

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: Record<string, unknown>;
}

apiClient.interceptors.response.use(
  (response: AxiosResponse<ApiEnvelope<unknown>>) => {
    // Unwrap { success, data } envelope when present
    if (
      response.data &&
      typeof response.data === "object" &&
      "success" in response.data
    ) {
      if (!response.data.success) {
        return Promise.reject(
          new Error(response.data.error ?? "Request failed"),
        );
      }
      return { ...response, data: response.data.data };
    }
    return response;
  },
  (error: AxiosError<ApiEnvelope<unknown>>) => {
    if (error.response?.status === 401) {
      // Clear token and redirect to login
      localStorage.removeItem("auth_token");
      // Dispatch a custom event so the auth store can react
      window.dispatchEvent(new CustomEvent("auth:unauthorized"));
      window.location.replace("/login");
    }
    const message =
      error.response?.data?.error ??
      error.message ??
      "An unexpected error occurred";
    return Promise.reject(new Error(message));
  },
);

// ---------------------------------------------------------------------------
// Typed API surface
// ---------------------------------------------------------------------------

export const api = {
  auth: {
    login: async (email: string, password: string): Promise<AuthResponse> => {
      const response = await apiClient.post<{ user: PublicUser; token: string }>("/auth/login", { email, password });
      return { user: toUser(response.data.user), token: response.data.token };
    },

    register: async (email: string, password: string): Promise<AuthResponse> => {
      const response = await apiClient.post<{ user: PublicUser; token: string }>("/auth/register", { email, password });
      return { user: toUser(response.data.user), token: response.data.token };
    },

    me: async (): Promise<User> => {
      const response = await apiClient.get<{ user: PublicUser }>("/auth/me");
      return toUser(response.data.user);
    },
  },

  runs: {
    list: async (): Promise<Run[]> => {
      const response = await apiClient.get<SessionRecord[]>("/pipeline/sessions");
      return (response.data ?? []).map(toRun);
    },

    get: async (sessionId: string): Promise<Run> => {
      const response = await apiClient.get<SessionRecord>(
        `/pipeline/sessions/${sessionId}`,
      );
      return toRun(response.data);
    },
  },

  keys: {
    list: async (): Promise<ApiKey[]> => {
      const response = await apiClient.get<{ keys: ApiKey[] }>("/keys");
      return (response.data as { keys: ApiKey[] }).keys ?? [];
    },

    create: async (name: string): Promise<{ key: string; apiKey: ApiKey }> => {
      const response = await apiClient.post<{ key: CreatedApiKeyServer; warning: string }>(
        "/keys",
        { name },
      );
      const created = (response.data as { key: CreatedApiKeyServer }).key;
      return {
        key: created.rawKey,
        apiKey: {
          id: created.id,
          name: created.name,
          prefix: created.prefix,
          createdAt: created.createdAt instanceof Date ? created.createdAt.toISOString() : String(created.createdAt),
          lastUsedAt: created.lastUsedAt
            ? (created.lastUsedAt instanceof Date ? created.lastUsedAt.toISOString() : String(created.lastUsedAt))
            : null,
        },
      };
    },

    revoke: async (keyId: string): Promise<void> => {
      await apiClient.delete(`/keys/${keyId}`);
    },
  },

  billing: {
    plans: async (): Promise<BillingPlan[]> => {
      const response = await apiClient.get<{ plans: ServerPlan[] }>("/billing/plans");
      const serverPlans = Array.isArray(response.data)
        ? response.data as unknown as ServerPlan[]
        : (response.data as { plans: ServerPlan[] }).plans ?? [];
      return serverPlans.map((p) => ({
        id: p.id as BillingPlan["id"],
        name: p.name,
        price: p.priceUsd ?? 0,
        runsPerMonth: p.runsPerMonth ?? -1,
        features: [...p.features],
        priceId: p.priceId,
      }));
    },

    checkout: async (planId: string): Promise<{ url: string }> => {
      const response = await apiClient.post<{ url: string }>(
        "/billing/checkout",
        { planId },
      );
      return response.data;
    },

    manageSubscription: async (): Promise<{ url: string }> => {
      const response = await apiClient.post<{ url: string }>(
        "/billing/portal",
        {},
      );
      return response.data;
    },
  },
};

export default api;
