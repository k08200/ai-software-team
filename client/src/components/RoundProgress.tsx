import { usePipelineStore } from "../store/pipeline-store.js";
import { PROFILE_DETAILS } from "../utils/pipeline-profile.js";

const MAX_DISPLAY_ROUNDS = 5;

function IssueBar({ count, max }: { count: number; max: number }) {
  const width = max > 0 ? (count / max) * 100 : 0;
  const color =
    count === 0
      ? "bg-green-500"
      : count <= 3
        ? "bg-yellow-400"
        : "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-700 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="text-sm font-bold tabular-nums w-6 text-right text-white">
        {count}
      </span>
    </div>
  );
}

export function RoundProgress() {
  const rounds = usePipelineStore((s) => s.rounds);
  const currentRound = usePipelineStore((s) => s.currentRound);
  const status = usePipelineStore((s) => s.status);
  const profile = usePipelineStore((s) => s.profile);

  if (status === "idle") return null;

  const skipsReviewRounds = profile !== "full";
  const maxIssues = Math.max(...rounds.map((r) => r.total), 1);

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-700 p-6">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">
        Issue Resolution Progress
      </h3>

      {skipsReviewRounds && rounds.length === 0 && (
        <div className="rounded-xl border border-cyan-900/50 bg-cyan-950/20 px-4 py-3 text-sm text-cyan-200">
          {PROFILE_DETAILS[profile].skippedRoundsSummary}
        </div>
      )}

      {!skipsReviewRounds && rounds.length === 0 && currentRound === 0 && (
        <div className="text-gray-500 text-sm text-center py-4">
          {PROFILE_DETAILS.full.skippedRoundsSummary}
        </div>
      )}

      {currentRound > 0 && rounds.length === 0 && (
        <div className="flex items-center gap-2 text-yellow-400 text-sm">
          <span className="inline-block w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          Round {currentRound} in progress...
        </div>
      )}

      <div className="space-y-4">
        {rounds.slice(0, MAX_DISPLAY_ROUNDS).map((round) => (
          <div key={round.round} className="animate-fade-in">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-300">
                Round {round.round}
              </span>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  round.total === 0
                    ? "bg-green-900/50 text-green-400"
                    : "bg-red-900/50 text-red-400"
                }`}
              >
                {round.total === 0 ? "✓ Clean" : `${round.total} issues`}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs text-gray-500 mb-1">
              <span>QA</span>
              <span>Security</span>
              <span>Review</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <IssueBar count={round.qaIssues} max={maxIssues} />
              <IssueBar count={round.securityIssues} max={maxIssues} />
              <IssueBar count={round.reviewIssues} max={maxIssues} />
            </div>
          </div>
        ))}
      </div>

      {rounds.length >= 2 && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Issues trend</span>
            <div className="flex items-center gap-1">
              {rounds.map((r, i) => (
                <span key={r.round}>
                  <span className={r.total === 0 ? "text-green-400 font-bold" : "text-red-400"}>
                    {r.total}
                  </span>
                  {i < rounds.length - 1 && (
                    <span className="text-gray-600"> → </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
