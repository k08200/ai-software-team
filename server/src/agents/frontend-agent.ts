import { BaseAgent } from "./base-agent.js";
import { config } from "../config.js";

const SYSTEM_PROMPT = `You are a Senior Frontend Engineer specializing in modern React applications.

You MUST write COMPLETE, RUNNABLE code — no placeholders, no "TODO" comments.

Requirements for ALL code:
1. React 18 + TypeScript (strict)
2. Vite for build tooling
3. TailwindCSS for styling (no arbitrary CSS unless necessary)
4. Zustand for state management
5. React Query (TanStack Query) for server state
6. React Hook Form + Zod for forms
7. Axios for HTTP requests
8. React Router v6 for routing
9. Fully accessible (ARIA attributes, keyboard navigation)
10. Responsive design (mobile-first)
11. Error boundaries and loading states for all async operations
12. Clean component architecture

Structure:
\`\`\`
src/
├── main.tsx
├── App.tsx
├── components/
│   ├── ui/           # Reusable primitives
│   └── features/     # Feature-specific components
├── pages/
│   └── [page]/
├── hooks/
│   └── use[Hook].ts
├── stores/
│   └── [feature].store.ts
├── services/
│   └── [resource].service.ts
├── types/
│   └── index.ts
└── utils/
    └── [utility].ts
\`\`\`

Output format: One markdown code block per file with file path as header.
### src/main.tsx
\`\`\`tsx
// complete code
\`\`\`

STRICT FILE OUTPUT CONTRACT:
- Return ONLY file sections in the format above.
- Each file section MUST start with a markdown heading containing only the relative file path, e.g. "### package.json" or "### src/main.tsx".
- The code fence MUST immediately follow the file path heading.
- Include package.json, vite.config.ts, tailwind.config.js, postcss.config.js, index.html, README.md, and every source/test file needed to run the project.
- Do not wrap multiple files in one code block.
- Do not include prose between files, commentary, summaries, or directory trees outside code blocks.
- Do not use absolute paths or parent directory paths.`;

export class FrontendAgent extends BaseAgent {
  constructor() {
    super({
      agentId: "frontend",
      agentName: "Frontend Agent",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 16000,
      thinkingBudget: 8000,
    });
  }

  buildPrompt(
    projectIdea: string,
    architecture: string,
    prd: string,
    backendCode: string,
  ): string {
    if (config.pipeline.profile === "smoke") {
      return `Product Idea: "${projectIdea}"

SMOKE MODE: Implement a tiny runnable React frontend only. Keep it simple and complete.

Return exactly these files, and no other text:
### package.json
### index.html
### vite.config.ts
### src/main.tsx

Requirements:
- Use React 18 + TypeScript + Vite.
- Implement a single-page memo UI with create and delete behavior.
- Use local component state; do not add routing or extra libraries.
- Do not reference missing CSS files or assets.
- Keep each file concise enough to fit in this response.
- Follow the strict file output contract: each heading immediately followed by one code block.`;
    }

    return `Product Idea: "${projectIdea}"

## Technical Architecture:
${architecture}

## Product Requirements & API Specification:
${prd}

## Backend Implementation (for API reference):
${backendCode.substring(0, 8000)}...

Implement the COMPLETE frontend application.
Include package.json, vite.config.ts, tailwind.config.js, index.html, and all source files.
The UI must be polished, production-ready, and match all user stories from the PRD.
Must run with: npm install && npm run dev

Remember the strict file output contract: one "### relative/path" heading followed immediately by one code block per file, no prose outside file sections.`;
  }
}
