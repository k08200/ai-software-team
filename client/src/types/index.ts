export type AgentId =
  | "cto"
  | "pm"
  | "backend"
  | "frontend"
  | "qa"
  | "security"
  | "review";

export type AgentStatus =
  | "pending"
  | "thinking"
  | "running"
  | "completed"
  | "error";

export type PipelineStatus =
  | "idle"
  | "running"
  | "completed"
  | "error";

export interface AgentState {
  id: AgentId;
  name: string;
  emoji: string;
  color: string;
  status: AgentStatus;
  output: string;
  thinkingOutput: string;
  inputTokens: number;
  outputTokens: number;
  duration: number;
  isThinkingVisible: boolean;
}

export interface RoundData {
  round: number;
  qaIssues: number;
  securityIssues: number;
  reviewIssues: number;
  total: number;
  completed: boolean;
}

export interface PipelineState {
  status: PipelineStatus;
  projectIdea: string;
  sessionId: string | null;
  currentAgent: AgentId | null;
  currentRound: number;
  totalTokens: number;
  agents: Record<AgentId, AgentState>;
  rounds: RoundData[];
  zipReady: boolean;
  errorMessage: string | null;
  startTime: number | null;
  endTime: number | null;
}

export type SSEEventType =
  | "pipeline_start"
  | "agent_start"
  | "agent_thinking"
  | "agent_output"
  | "agent_complete"
  | "agent_error"
  | "round_start"
  | "round_complete"
  | "issues_update"
  | "pipeline_complete"
  | "pipeline_error"
  | "token_update"
  | "file_saved";
