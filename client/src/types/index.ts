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

export type PipelineProfile = "smoke" | "mvp" | "full";

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

export type VerificationStatus = "passed" | "failed" | "skipped";

export interface GeneratedVerificationCommand {
  command: string;
  status: VerificationStatus;
  durationMs: number;
  exitCode?: number;
  output?: string;
  reason?: string;
}

export interface GeneratedProjectVerification {
  name: string;
  relativePath: string;
  fileCount: number;
  hasPackageJson: boolean;
  commands: GeneratedVerificationCommand[];
}

export interface PipelineState {
  status: PipelineStatus;
  profile: PipelineProfile;
  projectIdea: string;
  sessionId: string | null;
  currentAgent: AgentId | null;
  currentRound: number;
  totalTokens: number;
  agents: Record<AgentId, AgentState>;
  rounds: RoundData[];
  generatedVerification: GeneratedProjectVerification[];
  generatedVerificationPassed: boolean | null;
  frontendPreviewUrl: string | null;
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
