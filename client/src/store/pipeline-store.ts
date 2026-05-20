import { create } from "zustand";
import type {
  PipelineState,
  AgentId,
  AgentState,
  AgentStatus,
  GeneratedProjectVerification,
  PipelineProfile,
  RoundData,
  VerificationStatus,
} from "../types/index.js";

const AGENTS: Record<AgentId, Pick<AgentState, "id" | "name" | "emoji" | "color">> = {
  cto: { id: "cto", name: "CTO Agent", emoji: "🏗️", color: "#6366f1" },
  pm: { id: "pm", name: "PM Agent", emoji: "📋", color: "#8b5cf6" },
  backend: { id: "backend", name: "Backend Agent", emoji: "⚙️", color: "#06b6d4" },
  frontend: { id: "frontend", name: "Frontend Agent", emoji: "🎨", color: "#10b981" },
  qa: { id: "qa", name: "QA Agent", emoji: "🧪", color: "#f59e0b" },
  security: { id: "security", name: "Security Agent", emoji: "🔒", color: "#ef4444" },
  review: { id: "review", name: "Review Agent", emoji: "👁️", color: "#3b82f6" },
};

function makeInitialAgentState(id: AgentId): AgentState {
  return {
    ...AGENTS[id],
    status: "pending",
    output: "",
    thinkingOutput: "",
    inputTokens: 0,
    outputTokens: 0,
    duration: 0,
    isThinkingVisible: false,
  };
}

function makeInitialAgents(): Record<AgentId, AgentState> {
  return Object.fromEntries(
    (Object.keys(AGENTS) as AgentId[]).map((id) => [id, makeInitialAgentState(id)]),
  ) as Record<AgentId, AgentState>;
}

interface PipelineActions {
  setProjectIdea: (idea: string) => void;
  setProfile: (profile: PipelineProfile) => void;
  startPipeline: () => void;
  resetPipeline: () => void;
  handleSSEEvent: (type: string, data: Record<string, unknown>) => void;
  toggleThinking: (agentId: AgentId) => void;
  updateAgentStatus: (agentId: AgentId, status: AgentStatus) => void;
}

const initialState: PipelineState = {
  status: "idle",
  profile: "mvp",
  projectIdea: "",
  sessionId: null,
  currentAgent: null,
  currentRound: 0,
  totalTokens: 0,
  agents: makeInitialAgents(),
  rounds: [],
  generatedVerification: [],
  generatedVerificationPassed: null,
  frontendPreviewUrl: null,
  zipReady: false,
  errorMessage: null,
  startTime: null,
  endTime: null,
};

export const usePipelineStore = create<PipelineState & PipelineActions>((set, get) => ({
  ...initialState,

  setProjectIdea: (idea) => set({ projectIdea: idea }),
  setProfile: (profile) => set({ profile }),

  startPipeline: () =>
    set({
      status: "running",
      agents: makeInitialAgents(),
      rounds: [],
      generatedVerification: [],
      generatedVerificationPassed: null,
      frontendPreviewUrl: null,
      totalTokens: 0,
      zipReady: false,
      errorMessage: null,
      sessionId: null,
      currentAgent: null,
      currentRound: 0,
      startTime: Date.now(),
      endTime: null,
    }),

  resetPipeline: () => set({ ...initialState }),

  toggleThinking: (agentId) =>
    set((state) => ({
      agents: {
        ...state.agents,
        [agentId]: {
          ...state.agents[agentId],
          isThinkingVisible: !state.agents[agentId].isThinkingVisible,
        },
      },
    })),

  updateAgentStatus: (agentId, status) =>
    set((state) => ({
      agents: {
        ...state.agents,
        [agentId]: { ...state.agents[agentId], status },
      },
    })),

  handleSSEEvent: (type, data) => {
    const state = get();

    switch (type) {
      case "pipeline_start":
        set({
          sessionId: data.sessionId as string,
          status: "running",
          profile: parseProfile(data.profile, state.profile),
        });
        break;

      case "agent_start": {
        const agentId = data.agentId as AgentId;
        set((s) => ({
          currentAgent: agentId,
          agents: {
            ...s.agents,
            [agentId]: { ...s.agents[agentId], status: "running" },
          },
        }));
        break;
      }

      case "agent_thinking": {
        const agentId = data.agentId as AgentId;
        const content = data.content as string;
        set((s) => ({
          agents: {
            ...s.agents,
            [agentId]: {
              ...s.agents[agentId],
              status: "thinking",
              thinkingOutput: s.agents[agentId].thinkingOutput + content,
            },
          },
        }));
        break;
      }

      case "agent_output": {
        const agentId = data.agentId as AgentId;
        const content = data.content as string;
        set((s) => ({
          agents: {
            ...s.agents,
            [agentId]: {
              ...s.agents[agentId],
              status: "running",
              output: s.agents[agentId].output + content,
            },
          },
        }));
        break;
      }

      case "agent_complete": {
        const agentId = data.agentId as AgentId;
        set((s) => ({
          agents: {
            ...s.agents,
            [agentId]: {
              ...s.agents[agentId],
              status: "completed",
              inputTokens: (data.inputTokens as number) ?? 0,
              outputTokens: (data.outputTokens as number) ?? 0,
              duration: (data.duration as number) ?? 0,
            },
          },
        }));
        break;
      }

      case "agent_error": {
        const agentId = state.currentAgent;
        if (agentId) {
          set((s) => ({
            agents: {
              ...s.agents,
              [agentId]: { ...s.agents[agentId], status: "error" },
            },
          }));
        }
        break;
      }

      case "token_update":
        set({ totalTokens: (data.totalTokens as number) ?? 0 });
        break;

      case "round_start":
        set({ currentRound: data.round as number });
        break;

      case "issues_update": {
        const round = data.round as number;
        const roundData: RoundData = {
          round,
          qaIssues: (data.qaIssues as number) ?? 0,
          securityIssues: (data.securityIssues as number) ?? 0,
          reviewIssues: (data.reviewIssues as number) ?? 0,
          total: (data.total as number) ?? 0,
          completed: true,
        };
        set((s) => ({
          rounds: [...s.rounds.filter((r) => r.round !== round), roundData].sort(
            (a, b) => a.round - b.round,
          ),
        }));
        break;
      }

      case "pipeline_complete":
        set({
          status: "completed",
          zipReady: true,
          totalTokens: (data.totalTokens as number) ?? 0,
          generatedVerification: parseVerification(data.verification),
          generatedVerificationPassed: typeof data.verificationPassed === "boolean"
            ? data.verificationPassed
            : null,
          frontendPreviewUrl: typeof data.frontendPreviewUrl === "string"
            ? data.frontendPreviewUrl
            : null,
          endTime: Date.now(),
        });
        break;

      case "pipeline_error":
        set({
          status: "error",
          errorMessage: data.message as string,
          endTime: Date.now(),
        });
        break;
    }
  },
}));

function parseVerification(value: unknown): GeneratedProjectVerification[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((project): project is Record<string, unknown> => !!project && typeof project === "object")
    .map((project) => ({
      name: typeof project.name === "string" ? project.name : "Project",
      relativePath: typeof project.relativePath === "string" ? project.relativePath : "",
      fileCount: typeof project.fileCount === "number" ? project.fileCount : 0,
      hasPackageJson: project.hasPackageJson === true,
      commands: parseCommands(project.commands),
    }));
}

function parseCommands(value: unknown): GeneratedProjectVerification["commands"] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((command): command is Record<string, unknown> => !!command && typeof command === "object")
    .map((command) => ({
      command: typeof command.command === "string" ? command.command : "command",
      status: parseStatus(command.status),
      durationMs: typeof command.durationMs === "number" ? command.durationMs : 0,
      exitCode: typeof command.exitCode === "number" ? command.exitCode : undefined,
      output: typeof command.output === "string" ? command.output : undefined,
      reason: typeof command.reason === "string" ? command.reason : undefined,
    }));
}

function parseStatus(value: unknown): VerificationStatus {
  return value === "passed" || value === "failed" || value === "skipped" ? value : "skipped";
}

function parseProfile(value: unknown, fallback: PipelineProfile): PipelineProfile {
  return value === "smoke" || value === "mvp" || value === "full" ? value : fallback;
}
