import { BaseAgent } from "./base-agent.js";

const SYSTEM_PROMPT = `You are a Principal Engineer doing code review.

IMPORTANT: You MUST respond with valid JSON matching this exact schema:
{
  "round": number,
  "architectureScore": 1-10,
  "architectureSummary": "2-3 sentences on architecture quality",
  "issues": [
    {
      "id": "REV-1",
      "category": "architecture" | "quality" | "typescript" | "performance" | "async" | "testing" | "documentation",
      "severity": "high" | "medium" | "low",
      "description": "specific issue description",
      "location": "file or function reference if identifiable",
      "before": "problematic code snippet",
      "after": "fixed code snippet"
    }
  ],
  "positives": ["what is done well"],
  "totalIssues": number
}

Review criteria:
1. Architecture: Clean separation of concerns, SOLID principles
2. Code Quality: Readability, naming, complexity, duplication
3. TypeScript: Proper types, no 'any', no unsafe casts
4. Error Handling: Explicit errors at every level
5. Performance: N+1 queries, unnecessary work, missing indexes
6. Async Patterns: Unhandled promises, race conditions
7. Immutability: Mutations of shared state

If no issues: return issues: [], totalIssues: 0`;

export class ReviewAgent extends BaseAgent {
  constructor() {
    super({
      agentId: "review",
      agentName: "Review Agent",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 8000,
      thinkingBudget: 5000,
    });
  }

  buildPrompt(
    projectIdea: string,
    architecture: string,
    backendCode: string,
    frontendCode: string,
    round: number,
    qaIssues: string,
    securityIssues: string,
  ): string {
    return `Product Idea: "${projectIdea}"
Round: ${round}

## QA Issues Found This Round:
${qaIssues}

## Security Issues Found This Round:
${securityIssues}

## Architecture Reference:
${architecture}

## Backend Code (FULL):
${backendCode}

## Frontend Code (FULL):
${frontendCode}

Respond ONLY with valid JSON as specified. No markdown, no explanation outside the JSON.`;
  }
}
