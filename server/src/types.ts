export type AgentId =
  | "planner"
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

export interface AgentOutput {
  agentId: AgentId;
  agentName: string;
  content: string;
  thinkingContent?: string;
  tokensUsed: number;
  inputTokens: number;
  outputTokens: number;
  duration: number;
  timestamp: string;
}

export interface RoundResult {
  round: number;
  qaOutput: AgentOutput;
  securityOutput: AgentOutput;
  reviewOutput: AgentOutput;
  issues: IssueList;
}

export interface IssueList {
  qa: string[];
  security: string[];
  review: string[];
  total: number;
}

export interface PipelineContext {
  projectIdea: string;
  sessionId: string;
  architecture?: string;
  prd?: string;
  backendCode?: string;
  frontendCode?: string;
  rounds: RoundResult[];
  totalTokens: number;
  startTime: number;
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

export interface SSEEvent {
  type: SSEEventType;
  data: Record<string, unknown>;
}

export interface ThinkingConfig {
  type: "enabled";
  budgetTokens: number;
}

export interface AgentConfig {
  model: string;
  maxTokens: number;
  thinkingBudget: number;
  systemPrompt: string;
  agentId: AgentId;
  agentName: string;
}
