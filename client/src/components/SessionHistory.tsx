import { useEffect, useState } from "react";
import { usePipelineStore } from "../store/pipeline-store.js";

interface Session {
  sessionId: string;
  projectIdea: string;
  status: "running" | "completed" | "error";
  totalTokens: number;
  roundCount: number;
  finalIssues: number;
  startedAt: string;
  durationMs?: number;
  zipPath?: string;
}

function StatusBadge({ status }: { status: Session["status"] }) {
  const config = {
    completed: { text: "✓ 완료", cls: "bg-green-900/40 text-green-400" },
    running:   { text: "⟳ 실행중", cls: "bg-yellow-900/40 text-yellow-400" },
    error:     { text: "✗ 오류", cls: "bg-red-900/40 text-red-400" },
  }[status];

  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${config.cls}`}>
      {config.text}
    </span>
  );
}

export function SessionHistory() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const pipelineStatus = usePipelineStore((s) => s.status);

  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/pipeline/sessions")
      .then((r) => r.json())
      .then((data: Session[]) => setSessions(data))
      .catch(() => {});
  }, [isOpen, pipelineStatus]);

  if (sessions.length === 0 && !isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
      >
        히스토리 보기
      </button>
    );
  }

  return (
    <div className="w-full">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-300 transition-colors w-full justify-center"
      >
        <span>{isOpen ? "▲" : "▼"}</span>
        이전 세션 {sessions.length > 0 ? `(${sessions.length})` : ""}
      </button>

      {isOpen && (
        <div className="mt-3 space-y-2 animate-fade-in">
          {sessions.length === 0 ? (
            <p className="text-xs text-gray-600 text-center py-4">아직 완료된 세션이 없습니다.</p>
          ) : (
            sessions.slice(0, 5).map((s) => (
              <div
                key={s.sessionId}
                className="bg-gray-900 border border-gray-800 rounded-xl p-3 flex items-start justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{s.projectIdea}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(s.startedAt).toLocaleString("ko-KR")}
                    {s.durationMs && ` · ${(s.durationMs / 1000).toFixed(0)}s`}
                    {` · ${s.totalTokens.toLocaleString()} tokens`}
                    {` · ${s.roundCount}라운드`}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <StatusBadge status={s.status} />
                  {s.status === "completed" && s.zipPath && (
                    <a
                      href={`/api/pipeline/download/${s.sessionId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-300"
                    >
                      ⬇️
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
