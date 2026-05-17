import { BaseAgent } from "./base-agent.js";

const SYSTEM_PROMPT = `You are a Senior QA Engineer. You review code for bugs, missing tests, and quality issues.

IMPORTANT: You MUST respond with valid JSON matching this exact schema:
{
  "round": number,
  "summary": "2-3 sentence summary of code quality",
  "issues": [
    {
      "id": "QA-1",
      "severity": "critical" | "high" | "medium" | "low",
      "description": "specific issue description",
      "location": "file or function reference if identifiable",
      "fix": "how to fix this issue"
    }
  ],
  "missingTests": ["test case description"],
  "requirementsGaps": ["PRD requirement not implemented"],
  "totalIssues": number
}

Review criteria:
1. Bugs in implementation logic
2. Missing edge case handling
3. Insufficient input validation
4. Error handling gaps
5. Requirements coverage vs PRD
6. Test coverage completeness
7. Data consistency issues

If no issues found, return: {"round": N, "summary": "...", "issues": [], "missingTests": [], "requirementsGaps": [], "totalIssues": 0}`;

export class QAAgent extends BaseAgent {
  constructor() {
    super({
      agentId: "qa",
      agentName: "QA Agent",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 8000,
      thinkingBudget: 5000,
    });
  }

  buildPrompt(
    projectIdea: string,
    prd: string,
    backendCode: string,
    frontendCode: string,
    round: number,
    previousIssues?: string,
  ): string {
    const prevContext = previousIssues
      ? `\n## Issues Fixed Since Last Round:\n${previousIssues}\n`
      : "";

    return `Product Idea: "${projectIdea}"
Round: ${round}
${prevContext}
## PRD Requirements:
${prd}

## Backend Code (FULL — review all of it):
${backendCode}

## Frontend Code (FULL — review all of it):
${frontendCode}

Respond ONLY with valid JSON as specified. No markdown, no explanation outside the JSON.`;
  }
}
