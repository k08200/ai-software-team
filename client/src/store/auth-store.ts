import { create } from "zustand";
import { apiClient, api } from "../services/api.js";
import type { User } from "../types/auth.js";

// ---------------------------------------------------------------------------
// State + Actions interface
// ---------------------------------------------------------------------------

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;
}

interface AuthActions {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loadFromStorage: () => Promise<void>;
  setUser: (user: User) => void;
  clearError: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TOKEN_KEY = "auth_token";

function setAxiosAuth(token: string | null): void {
  if (token) {
    apiClient.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  } else {
    delete apiClient.defaults.headers.common["Authorization"];
  }
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

// If a token is already in storage, start in loading state so ProtectedRoute
// shows the spinner instead of immediately redirecting to /login.
const hasStoredToken =
  typeof window !== "undefined" && !!localStorage.getItem(TOKEN_KEY);

export const useAuthStore = create<AuthState & AuthActions>((set) => ({
  user: null,
  token: null,
  isLoading: hasStoredToken,
  error: null,

  setUser: (user) => set({ user }),

  clearError: () => set({ error: null }),

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { user, token } = await api.auth.login(email, password);
      localStorage.setItem(TOKEN_KEY, token);
      setAxiosAuth(token);
      set({ user, token, isLoading: false, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      set({ isLoading: false, error: message, user: null, token: null });
      throw err;
    }
  },

  register: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { user, token } = await api.auth.register(email, password);
      localStorage.setItem(TOKEN_KEY, token);
      setAxiosAuth(token);
      set({ user, token, isLoading: false, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Registration failed";
      set({ isLoading: false, error: message, user: null, token: null });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    setAxiosAuth(null);
    set({ user: null, token: null, error: null });
  },

  loadFromStorage: async () => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      set({ isLoading: false });
      return;
    }

    set({ isLoading: true });
    setAxiosAuth(stored);

    try {
      const user = await api.auth.me();
      set({ user, token: stored, isLoading: false });
    } catch {
      // Token is invalid/expired — clear it silently
      localStorage.removeItem(TOKEN_KEY);
      setAxiosAuth(null);
      set({ user: null, token: null, isLoading: false });
    }
  },
}));

// Reactive logout on 401 from any tab
if (typeof window !== "undefined") {
  window.addEventListener("auth:unauthorized", () => {
    const { logout } = useAuthStore.getState();
    logout();
  });
}
