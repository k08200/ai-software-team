import type { AgentId } from "../types.js";

interface TokenRecord {
  agentId: AgentId;
  inputTokens: number;
  outputTokens: number;
  round?: number;
}

export class TokenTracker {
  private records: TokenRecord[] = [];

  add(record: TokenRecord): void {
    this.records.push(record);
  }

  getTotalTokens(): number {
    return this.records.reduce(
      (sum, r) => sum + r.inputTokens + r.outputTokens,
      0,
    );
  }

  getTotalInputTokens(): number {
    return this.records.reduce((sum, r) => sum + r.inputTokens, 0);
  }

  getTotalOutputTokens(): number {
    return this.records.reduce((sum, r) => sum + r.outputTokens, 0);
  }

  getByAgent(agentId: AgentId): TokenRecord[] {
    return this.records.filter((r) => r.agentId === agentId);
  }

  getSummary(): Record<string, number> {
    const summary: Record<string, number> = {};
    for (const record of this.records) {
      const key = record.round !== undefined
        ? `${record.agentId}_round${record.round}`
        : record.agentId;
      summary[key] = (summary[key] ?? 0) + record.inputTokens + record.outputTokens;
    }
    summary.total = this.getTotalTokens();
    return summary;
  }

  reset(): void {
    this.records = [];
  }
}
