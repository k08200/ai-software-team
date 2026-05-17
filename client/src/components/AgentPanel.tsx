import { useRef, useEffect } from "react";
import { usePipelineStore } from "../store/pipeline-store.js";
import type { AgentId } from "../types/index.js";

interface AgentPanelProps {
  agentId: AgentId;
}

function CopyButton({ text }: { text: string }) {
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
  };

  return (
    <button
      onClick={handleCopy}
      className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded border border-gray-700 hover:border-gray-500"
      aria-label="Copy output"
    >
      Copy
    </button>
  );
}

export function AgentPanel({ agentId }: AgentPanelProps) {
  const agent = usePipelineStore((s) => s.agents[agentId]);
  const toggleThinking = usePipelineStore((s) => s.toggleThinking);
  const outputRef = useRef<HTMLPreElement>(null);

  // Auto-scroll to bottom as content streams in
  useEffect(() => {
    if (outputRef.current && agent.status === "running") {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [agent.output, agent.status]);

  if (agent.status === "pending") {
    return (
      <div className="rounded-xl border border-gray-700/50 bg-gray-900/30 p-4 opacity-40">
        <div className="flex items-center gap-2 text-gray-500">
          <span>{agent.emoji}</span>
          <span className="text-sm font-medium">{agent.name}</span>
          <span className="text-xs bg-gray-800 px-2 py-0.5 rounded-full">Pending</span>
        </div>
      </div>
    );
  }

  const isActive = agent.status === "running" || agent.status === "thinking";
  const hasOutput = agent.output.length > 0;
  const hasThinking = agent.thinkingOutput.length > 0;
  const totalTokens = agent.inputTokens + agent.outputTokens;

  return (
    <div
      className={`rounded-xl border transition-all duration-300 overflow-hidden animate-slide-up ${
        isActive ? "border-opacity-60 shadow-lg" : "border-gray-700"
      } ${agent.status === "error" ? "border-red-800" : ""}`}
      style={isActive ? { borderColor: agent.color } : {}}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          background: isActive
            ? `linear-gradient(135deg, ${agent.color}20, ${agent.color}08)`
            : "rgb(17 24 39)",
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg" role="img" aria-label={agent.name}>
            {agent.emoji}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">{agent.name}</span>
              {isActive && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{ backgroundColor: `${agent.color}30`, color: agent.color }}
                >
                  {agent.status === "thinking" ? "🧠 thinking" : "✍️ writing"}
                </span>
              )}
              {agent.status === "completed" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-900/40 text-green-400 font-medium">
                  ✓ Done
                </span>
              )}
              {agent.status === "error" && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-red-900/40 text-red-400 font-medium">
                  ✗ Error
                </span>
              )}
            </div>
            {totalTokens > 0 && (
              <div className="text-xs text-gray-500 mt-0.5">
                {totalTokens.toLocaleString()} tokens
                {agent.duration > 0 && ` · ${(agent.duration / 1000).toFixed(1)}s`}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {hasThinking && (
            <button
              onClick={() => toggleThinking(agentId)}
              className="text-xs text-purple-400 hover:text-purple-300 border border-purple-800 hover:border-purple-600 px-2 py-1 rounded transition-colors"
            >
              {agent.isThinkingVisible ? "Hide" : "Show"} thinking
            </button>
          )}
          {hasOutput && <CopyButton text={agent.output} />}
        </div>
      </div>

      {/* Thinking section (collapsible) */}
      {hasThinking && agent.isThinkingVisible && (
        <div className="border-t border-purple-900/30 bg-purple-950/20 px-4 py-3">
          <div className="text-xs text-purple-400 font-medium mb-2 flex items-center gap-1">
            <span>🧠</span> Extended Thinking
          </div>
          <pre className="text-xs text-purple-300/70 whitespace-pre-wrap break-words font-mono max-h-40 overflow-y-auto">
            {agent.thinkingOutput}
          </pre>
        </div>
      )}

      {/* Output section */}
      {hasOutput && (
        <div className="border-t border-gray-700/50">
          <pre
            ref={outputRef}
            className="text-xs text-gray-300 whitespace-pre-wrap break-words font-mono p-4 max-h-80 overflow-y-auto bg-gray-950/50"
          >
            {agent.output}
            {isActive && (
              <span className="inline-block w-1.5 h-3.5 bg-current ml-0.5 animate-pulse" />
            )}
          </pre>
        </div>
      )}

      {isActive && !hasOutput && (
        <div className="p-4 text-xs text-gray-500 flex items-center gap-2">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-current animate-ping" />
          Generating response...
        </div>
      )}
    </div>
  );
}
