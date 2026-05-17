import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus,
  Download,
  TrendingUp,
  Zap,
  DollarSign,
  Activity,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth.js";
import { api } from "../services/api.js";
import type { Run } from "../types/auth.js";
import { Button } from "../components/ui/Button.js";
import { Badge, PlanBadge } from "../components/ui/Badge.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const COST_PER_1K_TOKENS = 0.003; // approximate blended rate

function estimateCost(tokens: number): string {
  const usd = (tokens / 1000) * COST_PER_1K_TOKENS;
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function truncate(text: string, max = 60): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  accent: string;
}

function StatCard({ label, value, sub, icon, accent }: StatCardProps) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex items-start gap-4">
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${accent}`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">
          {label}
        </p>
        <p className="text-2xl font-bold text-white mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function StatusRunBadge({ status }: { status: Run["status"] }) {
  const cfg = {
    completed: { label: "Completed", variant: "success" as const },
    running: { label: "Running", variant: "warning" as const },
    error: { label: "Error", variant: "danger" as const },
  }[status];
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

// ---------------------------------------------------------------------------
// CSS bar chart for run usage
// ---------------------------------------------------------------------------

interface UsageBarProps {
  used: number;
  limit: number;
}

function UsageBar({ used, limit }: UsageBarProps) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const isWarning = pct >= 80;
  const isCritical = pct >= 95;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">Monthly Runs Usage</span>
        <span className="text-gray-300 font-medium">
          {used} / {limit === -1 ? "∞" : limit}
        </span>
      </div>
      <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className={[
            "h-full rounded-full transition-all duration-700",
            isCritical
              ? "bg-red-500"
              : isWarning
                ? "bg-yellow-500"
                : "bg-purple-500",
          ].join(" ")}
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={used}
          aria-valuemin={0}
          aria-valuemax={limit}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Weekly sparkline — CSS only
// ---------------------------------------------------------------------------

function WeeklyChart({ runs }: { runs: Run[] }) {
  // Bucket last 7 days
  const days: number[] = Array.from({ length: 7 }, (_, i) => {
    const day = new Date();
    day.setDate(day.getDate() - (6 - i));
    const dayStr = day.toISOString().slice(0, 10);
    return runs.filter((r) => r.createdAt.startsWith(dayStr)).length;
  });

  const max = Math.max(...days, 1);

  const dayLabels = Array.from({ length: 7 }, (_, i) => {
    const day = new Date();
    day.setDate(day.getDate() - (6 - i));
    return day.toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2);
  });

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-300">Runs — Last 7 Days</h3>
        <TrendingUp size={14} className="text-gray-600" />
      </div>
      <div className="flex items-end gap-2 h-24">
        {days.map((count, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1">
            <div className="w-full flex flex-col justify-end h-20">
              <div
                className="w-full bg-purple-600/70 rounded-t-md transition-all duration-500"
                style={{ height: `${Math.max((count / max) * 100, count > 0 ? 8 : 0)}%` }}
                title={`${count} run${count !== 1 ? "s" : ""}`}
              />
            </div>
            <span className="text-[10px] text-gray-600">{dayLabels[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [runs, setRuns] = useState<Run[]>([]);
  const [isLoadingRuns, setIsLoadingRuns] = useState(true);
  const [runsError, setRunsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingRuns(true);
    api.runs
      .list()
      .then((data) => {
        if (!cancelled) setRuns(data);
      })
      .catch((err: Error) => {
        if (!cancelled) setRunsError(err.message);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingRuns(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!user) return null;

  const totalTokens = runs.reduce((sum, r) => sum + r.totalTokens, 0);
  const quotaRemaining =
    user.runsLimit === -1
      ? "Unlimited"
      : Math.max(user.runsLimit - user.runsThisMonth, 0).toString();

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-white">Dashboard</h1>
            <PlanBadge plan={user.plan} />
          </div>
          <p className="text-gray-400 text-sm">
            Welcome back,{" "}
            <span className="text-white">{user.email.split("@")[0]}</span>
          </p>
        </div>
        <Button
          variant="primary"
          size="md"
          onClick={() => navigate("/pipeline")}
          className="flex-shrink-0"
        >
          <Plus size={16} />
          New Pipeline
        </Button>
      </div>

      {/* Free tier upgrade banner */}
      {user.plan === "free" && (
        <div className="bg-gradient-to-r from-purple-900/30 to-indigo-900/30 border border-purple-800/50 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex-1">
            <p className="text-sm font-semibold text-purple-300">
              Upgrade to Pro for 500 runs/month
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              You are on the Free plan. Upgrade to unlock more runs, priority
              support, and advanced models.
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate("/settings?tab=billing")}
          >
            Upgrade
          </Button>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Runs This Month"
          value={user.runsThisMonth}
          sub={`of ${user.runsLimit === -1 ? "unlimited" : user.runsLimit}`}
          icon={<Activity size={18} className="text-purple-400" />}
          accent="bg-purple-900/40"
        />
        <StatCard
          label="Total Tokens"
          value={totalTokens.toLocaleString()}
          sub="across all runs"
          icon={<Zap size={18} className="text-cyan-400" />}
          accent="bg-cyan-900/40"
        />
        <StatCard
          label="Cost Estimate"
          value={estimateCost(totalTokens)}
          sub="approx. this month"
          icon={<DollarSign size={18} className="text-green-400" />}
          accent="bg-green-900/40"
        />
        <StatCard
          label="Quota Remaining"
          value={quotaRemaining}
          sub="runs available"
          icon={<TrendingUp size={18} className="text-yellow-400" />}
          accent="bg-yellow-900/40"
        />
      </div>

      {/* Chart + Usage bar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <WeeklyChart runs={runs} />
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-300 mb-4">
              Usage Overview
            </h3>
            <UsageBar used={user.runsThisMonth} limit={user.runsLimit} />
          </div>
          <div className="text-xs text-gray-500 space-y-1">
            <div className="flex justify-between">
              <span>Plan</span>
              <PlanBadge plan={user.plan} />
            </div>
            <div className="flex justify-between">
              <span>Account ID</span>
              <span className="text-gray-400 font-mono">{user.id.slice(0, 8)}…</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent runs */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">Recent Runs</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/pipeline")}
          >
            + New run
          </Button>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          {isLoadingRuns ? (
            <div className="flex items-center justify-center py-12">
              <span
                className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"
                aria-label="Loading runs"
              />
            </div>
          ) : runsError ? (
            <div className="text-center py-12 text-sm text-gray-500">
              <p className="text-red-400">{runsError}</p>
            </div>
          ) : runs.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <Zap size={32} className="text-gray-700 mx-auto" />
              <p className="text-sm text-gray-500">No runs yet</p>
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate("/pipeline")}
              >
                Start your first pipeline
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm" aria-label="Recent runs">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Idea
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tokens
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="text-right px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Download
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {runs.slice(0, 10).map((run) => (
                    <tr
                      key={run.id}
                      className="hover:bg-gray-800/40 transition-colors"
                    >
                      <td className="px-5 py-3.5 text-gray-300">
                        {truncate(run.projectIdea)}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusRunBadge status={run.status} />
                      </td>
                      <td className="px-4 py-3.5 text-right text-gray-400 font-mono text-xs">
                        {run.totalTokens.toLocaleString()}
                      </td>
                      <td className="px-4 py-3.5 text-gray-500 text-xs whitespace-nowrap">
                        {formatDate(run.createdAt)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        {run.status === "completed" && run.zipReady ? (
                          <a
                            href={`/api/pipeline/download/${run.sessionId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-purple-400 hover:text-purple-300 transition-colors"
                            aria-label={`Download ${run.projectIdea}`}
                          >
                            <Download size={12} />
                            .zip
                          </a>
                        ) : (
                          <span className="text-gray-700 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DashboardPage;
