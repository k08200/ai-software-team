import { usePipelineStore } from "./store/pipeline-store.js";
import { IdeaInput } from "./components/IdeaInput.js";
import { PipelineStatus } from "./components/PipelineStatus.js";
import { AgentPanel } from "./components/AgentPanel.js";
import { TokenCounter } from "./components/TokenCounter.js";
import { RoundProgress } from "./components/RoundProgress.js";
import { CompletionPanel } from "./components/CompletionPanel.js";
import type { AgentId } from "./types/index.js";

const ALL_AGENTS: AgentId[] = [
  "cto", "pm", "backend", "frontend", "qa", "security", "review",
];

function Header() {
  return (
    <header className="text-center py-12 px-4">
      <div className="inline-flex items-center gap-2 text-xs text-purple-400 bg-purple-900/20 border border-purple-800/40 px-3 py-1.5 rounded-full mb-6">
        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse inline-block" />
        Powered by Claude with Extended Thinking
      </div>
      <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4 tracking-tight">
        AI Software Engineering Team
      </h1>
      <p className="text-gray-400 text-lg max-w-2xl mx-auto">
        한 줄 아이디어 → 7개 AI 에이전트 → 완전한 프로덕션 코드
      </p>
      <div className="flex items-center justify-center gap-6 mt-6 text-sm text-gray-500">
        <span className="flex items-center gap-1.5">
          🏗️ CTO <span className="text-gray-700">→</span>
          📋 PM <span className="text-gray-700">→</span>
          ⚙️ Backend <span className="text-gray-700">→</span>
          🎨 Frontend
        </span>
        <span className="text-gray-700">⟳</span>
        <span className="flex items-center gap-1.5">
          🧪 QA + 🔒 Security + 👁️ Review
        </span>
      </div>
    </header>
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

export function App() {
  const status = usePipelineStore((s) => s.status);
  const projectIdea = usePipelineStore((s) => s.projectIdea);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="max-w-5xl mx-auto px-4 pb-24">
        <Header />

        {/* Current project context */}
        {status !== "idle" && projectIdea && (
          <div className="mb-6 px-4 py-3 bg-gray-900 rounded-xl border border-gray-700 text-sm">
            <span className="text-gray-500">Building: </span>
            <span className="text-white font-medium">{projectIdea}</span>
          </div>
        )}

        {/* Input area */}
        {status === "idle" ? (
          <div className="mb-12">
            <IdeaInput />
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
    </div>
  );
}

export default App;
