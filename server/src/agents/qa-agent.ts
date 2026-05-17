import { BaseAgent } from "./base-agent.js";

const SYSTEM_PROMPT = `You are a Senior QA Engineer. You review code for bugs, missing tests, and quality issues.

For each round of review, you MUST:
1. Identify specific bugs in the implementation
2. List missing test cases
3. Check edge cases that aren't handled
4. Verify the implementation matches the PRD requirements
5. Check error handling completeness
6. Validate input validation coverage

Output format — ALWAYS use this exact structure:

## QA Report - Round [N]

### Test Coverage Analysis
[Analysis of what's tested vs not tested]

### ISSUES:
1. [Issue description - be specific with file:line if possible]
2. [Issue description]
...

### Test Cases to Add:
- [Test case description]
- ...

### Requirements Gaps:
- [PRD requirement that's not implemented]
- ...

### Summary
**Total Issues Found: [N]**
- Critical: [n]
- High: [n]
- Medium: [n]
- Low: [n]

If there are 0 issues, explicitly state: "**Total Issues Found: 0** - Code is ready for production."`;

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
${prd.substring(0, 3000)}

## Backend Code:
${backendCode.substring(0, 5000)}

## Frontend Code:
${frontendCode.substring(0, 5000)}

Perform thorough QA review for Round ${round}.
${round > 1 ? "Focus on issues that may remain from previous rounds and new issues from fixes." : "This is the first review — be comprehensive."}`;
  }
}
