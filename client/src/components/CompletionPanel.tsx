import { CheckCircle, MinusCircle, XCircle } from "lucide-react";
import { usePipelineStore } from "../store/pipeline-store.js";
import { usePipeline } from "../hooks/usePipeline.js";
import type { GeneratedVerificationCommand, VerificationStatus } from "../types/index.js";

export function CompletionPanel() {
  const status = usePipelineStore((s) => s.status);
  const zipReady = usePipelineStore((s) => s.zipReady);
  const totalTokens = usePipelineStore((s) => s.totalTokens);
  const rounds = usePipelineStore((s) => s.rounds);
  const generatedVerification = usePipelineStore((s) => s.generatedVerification);
  const generatedVerificationPassed = usePipelineStore((s) => s.generatedVerificationPassed);
  const startTime = usePipelineStore((s) => s.startTime);
  const endTime = usePipelineStore((s) => s.endTime);
  const resetPipeline = usePipelineStore((s) => s.resetPipeline);
  const errorMessage = usePipelineStore((s) => s.errorMessage);
  const { download } = usePipeline();

  if (status !== "completed" && status !== "error") return null;

  const duration = startTime && endTime ? (endTime - startTime) / 1000 : 0;
  const lastRound = rounds[rounds.length - 1];
  const finalIssues = lastRound?.total ?? 0;

  if (status === "error") {
    return (
      <div className="bg-red-950/30 border border-red-800 rounded-2xl p-6 text-center animate-fade-in">
        <div className="text-3xl mb-3">❌</div>
        <h3 className="text-lg font-semibold text-red-400 mb-2">Pipeline Error</h3>
        <p className="text-sm text-red-300/70 mb-4">{errorMessage}</p>
        <button
          onClick={resetPipeline}
          className="bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
        >
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-green-950/30 to-emerald-950/20 border border-green-800/50 rounded-2xl p-6 animate-fade-in">
      <div className="text-center mb-6">
        <div className="text-5xl mb-3">🎉</div>
        <h3 className="text-xl font-bold text-white mb-1">프로젝트 생성 완료!</h3>
        <p className="text-sm text-gray-400">
          {rounds.length}라운드 후 {finalIssues === 0 ? "모든 이슈가 해결되었습니다" : `${finalIssues}개 이슈 잔존`}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center bg-gray-900/50 rounded-xl p-3">
          <div className="text-2xl font-bold text-purple-400">
            {totalTokens.toLocaleString()}
          </div>
          <div className="text-xs text-gray-500 mt-1">총 토큰</div>
        </div>
        <div className="text-center bg-gray-900/50 rounded-xl p-3">
          <div className="text-2xl font-bold text-cyan-400">{rounds.length}</div>
          <div className="text-xs text-gray-500 mt-1">반복 라운드</div>
        </div>
        <div className="text-center bg-gray-900/50 rounded-xl p-3">
          <div className="text-2xl font-bold text-green-400">
            {duration > 60
              ? `${Math.floor(duration / 60)}m ${Math.round(duration % 60)}s`
              : `${duration.toFixed(1)}s`}
          </div>
          <div className="text-xs text-gray-500 mt-1">소요 시간</div>
        </div>
      </div>

      {generatedVerification.length > 0 && (
        <div className="mb-6 bg-gray-950/40 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h4 className="text-sm font-semibold text-white">Generated Build Checks</h4>
            <span className={`text-xs font-medium ${generatedVerificationPassed ? "text-green-400" : "text-amber-300"}`}>
              {generatedVerificationPassed ? "All checks passed" : "Review required"}
            </span>
          </div>
          <div className="space-y-3">
            {generatedVerification.map((project) => (
              <div key={project.relativePath} className="rounded-lg border border-gray-800 bg-gray-900/40 p-3">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div>
                    <div className="text-sm font-medium text-gray-100">{project.name}</div>
                    <div className="text-xs text-gray-500">
                      {project.fileCount} files · package.json {project.hasPackageJson ? "found" : "missing"}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {["npm install", "npm run build", "npm test"].map((command) => (
                    <VerificationBadge
                      key={command}
                      command={command}
                      result={project.commands.find((item) => item.command === command)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        {zipReady && (
          <button
            onClick={download}
            className="flex-1 bg-green-700 hover:bg-green-600 text-white font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <span>⬇️</span>
            프로젝트 다운로드 (.zip)
          </button>
        )}
        <button
          onClick={resetPipeline}
          className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-medium py-3 px-4 rounded-xl transition-colors"
        >
          새 프로젝트 시작
        </button>
      </div>
    </div>
  );
}

function VerificationBadge({
  command,
  result,
}: {
  command: string;
  result?: GeneratedVerificationCommand;
}) {
  const status = result?.status ?? "skipped";
  const Icon = status === "passed" ? CheckCircle : status === "failed" ? XCircle : MinusCircle;
  const label = status === "passed" ? "Passed" : status === "failed" ? "Failed" : "Skipped";
  const color = getStatusColor(status);

  return (
    <div className={`flex min-h-12 items-center gap-2 rounded-md border px-2.5 py-2 ${color}`}>
      <Icon size={15} aria-hidden="true" />
      <div className="min-w-0">
        <div className="truncate text-xs font-medium">{command.replace("npm ", "")}</div>
        <div className="truncate text-[11px] opacity-80">
          {result?.reason ?? label}
        </div>
      </div>
    </div>
  );
}

function getStatusColor(status: VerificationStatus): string {
  if (status === "passed") return "border-green-800/70 bg-green-950/30 text-green-300";
  if (status === "failed") return "border-red-800/70 bg-red-950/30 text-red-300";
  return "border-gray-700 bg-gray-900/70 text-gray-400";
}
