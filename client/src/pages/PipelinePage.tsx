import { Link } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { usePipelineStore } from "../store/pipeline-store.js";
import { IdeaInput } from "../components/IdeaInput.js";
import { PipelineStatus } from "../components/PipelineStatus.js";
import { AgentPanel } from "../components/AgentPanel.js";
import { TokenCounter } from "../components/TokenCounter.js";
import { RoundProgress } from "../components/RoundProgress.js";
import { CompletionPanel } from "../components/CompletionPanel.js";
import { CostEstimate } from "../components/CostEstimate.js";
import { SessionHistory } from "../components/SessionHistory.js";
import type { AgentId } from "../types/index.js";
import { PROFILE_DETAILS } from "../utils/pipeline-profile.js";

const ALL_AGENTS: AgentId[] = [
  "planner", "cto", "pm", "backend", "frontend", "qa", "security", "review",
];

function Breadcrumb() {
  return (
    <nav
      className="flex items-center gap-1.5 text-xs text-gray-500 mb-6"
      aria-label="Breadcrumb"
    >
      <Link
        to="/dashboard"
        className="flex items-center gap-1 hover:text-gray-300 transition-colors"
      >
        <Home size={12} />
        Dashboard
      </Link>
      <ChevronRight size={12} className="text-gray-700" />
      <span className="text-gray-300 font-medium">New Pipeline</span>
    </nav>
  );
}

function ActiveAgents() {
  const agents = usePipelineStore((s) => s.agents);
  const status = usePipelineStore((s) => s.status);

  if (status === "idle") return null;

  const activeAgents = ALL_AGENTS.filter(
    (id) => agents[id].status !== "pending",
  );

  if (activeAgents.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">
        Agent Outputs
      </h2>
      <div className="space-y-3">
        {activeAgents.map((agentId) => (
          <AgentPanel key={agentId} agentId={agentId} />
        ))}
      </div>
    </div>
  );
}

export function PipelinePage() {
  const status = usePipelineStore((s) => s.status);
  const projectIdea = usePipelineStore((s) => s.projectIdea);
  const profile = usePipelineStore((s) => s.profile);
  const profileDetails = PROFILE_DETAILS[profile];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-24 py-6">
      <Breadcrumb />

      {/* Page title */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">New Pipeline</h1>
        <p className="text-gray-400 text-sm mt-1">
          Describe your idea — 7 AI agents will build it for you
        </p>
      </div>

      {/* Current project context */}
      {status !== "idle" && projectIdea && (
        <div className="mb-6 flex flex-col gap-2 bg-gray-900 rounded-xl border border-gray-700 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-gray-500">Building: </span>
            <span className="text-white font-medium">{projectIdea}</span>
          </div>
          <span className="inline-flex w-fit items-center rounded-md border border-cyan-800/60 bg-cyan-950/30 px-2 py-1 text-xs font-medium text-cyan-300">
            {profileDetails.label} · {profileDetails.description}
          </span>
        </div>
      )}

      {/* Input area */}
      {status === "idle" ? (
        <div className="mb-12">
          <IdeaInput />
          <CostEstimate />
          <div className="mt-8">
            <SessionHistory />
          </div>
        </div>
      ) : (
        <div className="mb-6">
          <IdeaInput />
        </div>
      )}

      {/* Stats grid */}
      {status !== "idle" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <TokenCounter />
          <RoundProgress />
        </div>
      )}

      {/* Pipeline visualization */}
      <div className="mb-6">
        <PipelineStatus />
      </div>

      {/* Completion panel */}
      {(status === "completed" || status === "error") && (
        <div className="mb-6">
          <CompletionPanel />
        </div>
      )}

      {/* Agent output panels */}
      <ActiveAgents />
    </div>
  );
}

export default PipelinePage;
