import { useEffect, useState } from "react";
import { usePipelineStore } from "../store/pipeline-store.js";

interface EstimateData {
  provider?: string;
  model: string;
  minCostUSD: number;
  maxCostUSD: number;
  minTokens: number;
  maxTokens: number;
  roundCount: number;
}

function fmt(usd: number): string {
  if (usd < 0.01) return "<$0.01";
  return `$${usd.toFixed(2)}`;
}

export function CostEstimate() {
  const status = usePipelineStore((s) => s.status);
  const [estimate, setEstimate] = useState<EstimateData | null>(null);

  useEffect(() => {
    if (status !== "idle") return;
    fetch("/api/pipeline/estimate")
      .then((r) => r.json())
      .then((data: EstimateData) => setEstimate(data))
      .catch(() => {}); // Non-critical
  }, [status]);

  if (!estimate || status !== "idle") return null;

  return (
    <div className="flex items-center justify-center gap-3 text-xs text-gray-500 mt-3">
      <span className="flex items-center gap-1">
        <span>💰</span>
        예상 비용:
        <span className="text-gray-400 font-medium">
          {estimate.provider === "ollama"
            ? "로컬 실행 무료"
            : `${fmt(estimate.minCostUSD)} ~ ${fmt(estimate.maxCostUSD)}`}
        </span>
      </span>
      <span className="text-gray-700">·</span>
      <span>
        토큰: ~{Math.round((estimate.minTokens + estimate.maxTokens) / 2).toLocaleString()}
      </span>
      <span className="text-gray-700">·</span>
      <span>모델: {estimate.model}</span>
    </div>
  );
}
