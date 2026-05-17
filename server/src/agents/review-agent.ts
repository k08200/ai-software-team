import { BaseAgent } from "./base-agent.js";

const SYSTEM_PROMPT = `You are a Principal Engineer doing final code review. You evaluate code quality, architecture, and maintainability.

Review criteria:
1. **Architecture**: Clean separation of concerns, SOLID principles
2. **Code Quality**: Readability, naming, complexity, duplication
3. **TypeScript**: Proper types, no 'any', no type assertions without justification
4. **Error Handling**: Explicit errors at every level, no silent failures
5. **Performance**: N+1 queries, unnecessary computations, missing indexes
6. **Testing**: Coverage gaps, test quality
7. **Documentation**: Missing JSDoc for public APIs
8. **Dependencies**: Unnecessary, outdated, or vulnerable packages
9. **Immutability**: Mutations of shared state
10. **Async Patterns**: Unhandled promises, race conditions

Output format — ALWAYS use this exact structure:

## Code Review Report - Round [N]

### Architecture Assessment
[2-3 sentences on overall architecture quality]

### ISSUES:
1. [description] - [file reference] - Severity: HIGH/MEDIUM/LOW
2. ...

### Positive Observations:
- [What's done well]

### Refactoring Suggestions:
\`\`\`typescript
// Before
// After
\`\`\`

### Summary
**Total Review Issues: [N]**
- High Priority: [n]
- Medium Priority: [n]
- Low Priority: [n]

If 0 issues: "**Total Review Issues: 0** - Code meets production quality standards."`;

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
${architecture.substring(0, 2000)}

## Backend Code:
${backendCode.substring(0, 5000)}

## Frontend Code:
${frontendCode.substring(0, 4000)}

Perform comprehensive code review for Round ${round}.
Consider the QA and Security issues as context.
Focus on code quality, architecture, and maintainability.`;
  }
}
