import { usePipelineStore } from "../store/pipeline-store.js";

export function TokenCounter() {
  const totalTokens = usePipelineStore((s) => s.totalTokens);
  const status = usePipelineStore((s) => s.status);

  const formatted = totalTokens.toLocaleString();
  const isActive = status === "running";

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-gray-900 rounded-2xl border border-gray-700">
      <div className="text-xs font-medium text-gray-400 uppercase tracking-widest mb-1">
        Total Tokens Used
      </div>
      <div
        className={`text-5xl font-bold tabular-nums transition-all duration-300 ${
          isActive ? "text-purple-400 animate-pulse-fast" : "text-white"
        }`}
      >
        {formatted}
      </div>
      {isActive && (
        <div className="mt-2 text-xs text-purple-400 flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping" />
          Live counting
        </div>
      )}
    </div>
  );
}
