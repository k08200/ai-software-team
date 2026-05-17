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
      const response = await apiClient.post<AuthResponse>("/auth/login", {
        email,
        password,
      });
      return response.data;
    },

    register: async (
      email: string,
      password: string,
    ): Promise<AuthResponse> => {
      const response = await apiClient.post<AuthResponse>("/auth/register", {
        email,
        password,
      });
      return response.data;
    },

    me: async (): Promise<User> => {
      const response = await apiClient.get<User>("/auth/me");
      return response.data;
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
      const response = await apiClient.get<ApiKey[]>("/keys");
      return response.data;
    },

    create: async (name: string): Promise<{ key: string; apiKey: ApiKey }> => {
      const response = await apiClient.post<{ key: string; apiKey: ApiKey }>(
        "/keys",
        { name },
      );
      return response.data;
    },

    revoke: async (keyId: string): Promise<void> => {
      await apiClient.delete(`/keys/${keyId}`);
    },
  },

  billing: {
    plans: async (): Promise<BillingPlan[]> => {
      const response = await apiClient.get<BillingPlan[]>("/billing/plans");
      return response.data;
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
