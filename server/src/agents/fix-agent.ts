import { BaseAgent } from "./base-agent.js";
import { config, type PipelineProfile } from "../config.js";

const BACKEND_FIX_PROMPT = `You are a Senior Backend Engineer performing code fixes.

You will receive:
1. The current backend code
2. A list of issues found by QA, Security, and Code Review agents
3. The original architecture specification

Your task: Produce FIXED, COMPLETE, RUNNABLE backend code that addresses ALL listed issues.

RULES:
- Fix every issue in the list
- Do NOT remove features, only fix bugs and security issues
- Maintain the same overall architecture
- Output the complete fixed code, not just diffs
- Every file must be complete — no TODOs, no placeholders

Output format: One code block per file with path as header.
### src/filename.ts
\`\`\`typescript
// complete fixed code
\`\`\`

STRICT FILE OUTPUT CONTRACT:
- Return ONLY file sections in the format above.
- Each file section MUST start with a markdown heading containing only the relative file path.
- The code fence MUST immediately follow the file path heading.
- Include package.json and every changed or required source/test file needed for a runnable project.
- Do not include prose between files, summaries, or directory trees outside code blocks.`;

const FRONTEND_FIX_PROMPT = `You are a Senior Frontend Engineer performing code fixes.

You will receive:
1. The current frontend code
2. A list of issues found by QA, Security, and Code Review agents

Your task: Produce FIXED, COMPLETE, RUNNABLE frontend code that addresses ALL listed issues.

RULES:
- Fix every issue in the list
- Do NOT remove features, only fix bugs and quality issues
- Output the complete fixed code for each affected file
- Every file must be complete

Output format: One code block per file with path as header.
### src/filename.tsx
\`\`\`tsx
// complete fixed code
\`\`\`

STRICT FILE OUTPUT CONTRACT:
- Return ONLY file sections in the format above.
- Each file section MUST start with a markdown heading containing only the relative file path.
- The code fence MUST immediately follow the file path heading.
- Include package.json and every changed or required source/test file needed for a runnable project.
- Do not include prose between files, summaries, or directory trees outside code blocks.`;

export class BackendFixAgent extends BaseAgent {
  constructor(profile: PipelineProfile = config.pipeline.profile) {
    super({
      agentId: "backend",
      agentName: "Backend Fix Agent",
      systemPrompt: BACKEND_FIX_PROMPT,
      maxTokens: 16000,
      thinkingBudget: 6000,
      profile,
    });
  }

  buildPrompt(
    currentCode: string,
    qaIssues: string,
    securityIssues: string,
    reviewIssues: string,
    architecture: string,
  ): string {
    const allIssues = [
      qaIssues ? `## QA Issues:\n${qaIssues}` : "",
      securityIssues ? `## Security Issues:\n${securityIssues}` : "",
      reviewIssues ? `## Code Review Issues:\n${reviewIssues}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    return `## Issues to Fix:
${allIssues}

## Architecture Reference:
${architecture.substring(0, 3000)}

## Current Backend Code:
${currentCode}

Fix ALL issues listed above. Return the complete fixed backend code.`;
  }
}

export class FrontendFixAgent extends BaseAgent {
  constructor(profile: PipelineProfile = config.pipeline.profile) {
    super({
      agentId: "frontend",
      agentName: "Frontend Fix Agent",
      systemPrompt: FRONTEND_FIX_PROMPT,
      maxTokens: 16000,
      thinkingBudget: 6000,
      profile,
    });
  }

  buildPrompt(
    currentCode: string,
    qaIssues: string,
    reviewIssues: string,
  ): string {
    const allIssues = [
      qaIssues ? `## QA Issues:\n${qaIssues}` : "",
      reviewIssues ? `## Code Review Issues:\n${reviewIssues}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    return `## Issues to Fix:
${allIssues}

## Current Frontend Code:
${currentCode}

Fix ALL issues listed above. Return the complete fixed frontend code.`;
  }
}
