import { usePipelineStore } from "../store/pipeline-store.js";
import { usePipeline } from "../hooks/usePipeline.js";

export function CompletionPanel() {
  const status = usePipelineStore((s) => s.status);
  const zipReady = usePipelineStore((s) => s.zipReady);
  const totalTokens = usePipelineStore((s) => s.totalTokens);
  const rounds = usePipelineStore((s) => s.rounds);
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
