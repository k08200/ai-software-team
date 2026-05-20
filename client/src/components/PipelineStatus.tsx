import { usePipelineStore } from "../store/pipeline-store.js";
import type { AgentId, AgentStatus } from "../types/index.js";
import { PROFILE_DETAILS } from "../utils/pipeline-profile.js";

function StatusDot({ status }: { status: AgentStatus }) {
  if (status === "pending") {
    return <span className="w-2 h-2 rounded-full bg-gray-600 inline-block" />;
  }
  if (status === "thinking") {
    return (
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500" />
      </span>
    );
  }
  if (status === "running") {
    return (
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
      </span>
    );
  }
  if (status === "completed") {
    return <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />;
  }
  return <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />;
}

function AgentPill({ agentId }: { agentId: AgentId }) {
  const agent = usePipelineStore((s) => s.agents[agentId]);
  const isActive = agent.status === "running" || agent.status === "thinking";

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all duration-300 ${
        isActive
          ? "border-opacity-100 bg-opacity-20 shadow-lg"
          : agent.status === "completed"
            ? "border-green-800/50 bg-green-900/10"
            : agent.status === "error"
              ? "border-red-800/50 bg-red-900/10"
              : "border-gray-700/50 bg-gray-800/30"
      }`}
      style={isActive ? { borderColor: agent.color, backgroundColor: `${agent.color}15` } : {}}
    >
      <StatusDot status={agent.status} />
      <span className="text-base" role="img" aria-label={agent.name}>
        {agent.emoji}
      </span>
      <div>
        <div className="text-xs font-semibold text-white leading-tight">{agent.name}</div>
        <div className="text-[10px] text-gray-400 capitalize">
          {agent.status === "thinking"
            ? "🧠 thinking..."
            : agent.status === "running"
              ? "✍️ writing..."
              : agent.status === "completed"
                ? `✓ ${((agent.inputTokens + agent.outputTokens) / 1000).toFixed(1)}k tokens`
                : agent.status}
        </div>
      </div>
    </div>
  );
}

export function PipelineStatus() {
  const status = usePipelineStore((s) => s.status);
  const profile = usePipelineStore((s) => s.profile);
  const profileDetails = PROFILE_DETAILS[profile];

  if (status === "idle") return null;

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">
          Agent Pipeline
        </h3>
        <span className="w-fit rounded-md border border-gray-700 bg-gray-950/60 px-2 py-1 text-xs text-gray-300">
          {profileDetails.label} · {profileDetails.agentOrder.length} agents
        </span>
      </div>
      <div className={`grid grid-cols-2 gap-2 sm:grid-cols-4 ${profile === "full" ? "lg:grid-cols-7" : "lg:grid-cols-4"}`}>
        {profileDetails.agentOrder.map((agentId, i) => (
          <div key={agentId} className="flex items-center gap-1">
            <AgentPill agentId={agentId} />
            {i < profileDetails.agentOrder.length - 1 && (
              <span className="text-gray-600 text-xs hidden lg:block">→</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
