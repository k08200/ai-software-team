import { BaseAgent } from "./base-agent.js";
import { config } from "../config.js";

const SYSTEM_PROMPT = `You are a Senior Frontend Engineer specializing in modern React applications.

You MUST write COMPLETE, RUNNABLE code — no placeholders, no "TODO" comments.

Default full-profile requirements for frontend code:
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

When the user prompt says MVP MODE or SMOKE MODE, the mode-specific dependency and structure rules override the full-profile defaults.

Full-profile structure:
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
  private readonly runtimeProfile: typeof config.pipeline.profile;

  constructor(profile: typeof config.pipeline.profile = config.pipeline.profile) {
    super({
      agentId: "frontend",
      agentName: "Frontend Agent",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 16000,
      thinkingBudget: 8000,
      profile,
    });
    this.runtimeProfile = profile;
  }

  buildPrompt(
    projectIdea: string,
    architecture: string,
    prd: string,
    backendCode: string,
  ): string {
    if (this.runtimeProfile === "smoke") {
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
- package.json must include scripts: "dev": "vite", "build": "vite build", "preview": "vite preview".
- package.json dependencies must include exactly "react": "^18.2.0", "react-dom": "^18.2.0".
- package.json devDependencies must include exactly "typescript": "^5.4.5", "vite": "^5.4.0", "@vitejs/plugin-react": "^4.3.1", "@types/react": "^18.2.66", "@types/react-dom": "^18.2.22".
- src/main.tsx must use createRoot from "react-dom/client", not ReactDOM.render.
- Do not use Vite 3.x, @vitejs/plugin-react 3.x, ReactDOM.render, or any package not listed in package.json.
- Do not reference missing CSS files or assets.
- Keep each file concise enough to fit in this response.
- Follow the strict file output contract: each heading immediately followed by one code block.`;
    }

    if (this.runtimeProfile === "fast-mvp") {
      return `Product Idea: "${projectIdea}"

## Fast MVP Blueprint:
${prd}

## Backend Implementation (for API reference):
${backendCode.substring(0, 4500)}...

FAST MVP MODE: Implement a polished, idea-specific React frontend for the blueprint.

Return exactly these files, and no other text:
### package.json
### index.html
### vite.config.ts
### src/main.tsx

Requirements:
- Use React 18 + TypeScript + Vite only.
- Keep all UI code in src/main.tsx for reliability.
- Do not use Tailwind, Zustand, React Query, React Router, Axios, Zod, or any package not listed below.
- package.json must include scripts: "dev": "vite", "build": "vite build", "preview": "vite preview".
- package.json dependencies must include exactly "react": "^18.2.0", "react-dom": "^18.2.0".
- package.json devDependencies must include exactly "typescript": "^5.4.5", "vite": "^5.4.0", "@vitejs/plugin-react": "^4.3.1", "@types/react": "^18.2.66", "@types/react-dom": "^18.2.22".
- Use CSS inside src/main.tsx via a <style> tag or injected style element; do not reference external CSS files.
- Use createRoot from "react-dom/client".
- The first screen must be the usable product, not a marketing landing page.
- Make the UI domain-specific with realistic seed data, empty states, loading/error states, and at least one create/update/delete interaction.
- Try to call the backend API endpoints with fetch, but gracefully fall back to local in-memory demo data when the API is unavailable so static preview still works.
- Do not reference undeclared variables in fallback create/update/delete handlers.
- Use accessible labels, keyboard-friendly buttons/forms, responsive layout, and professional visual polish.
- Avoid one-color purple/blue gradient themes; use a restrained multi-color palette that fits the product domain.
- Follow the strict file output contract: each heading immediately followed by one code block.`;
    }

    if (this.runtimeProfile === "mvp") {
      return `Product Idea: "${projectIdea}"

## Technical Architecture:
${architecture}

## Product Requirements & API Specification:
${prd}

## Backend Implementation (for API reference):
${backendCode.substring(0, 6000)}...

MVP MODE: Implement a polished, idea-specific React frontend for one usable vertical slice.

Return exactly these files, and no other text:
### package.json
### index.html
### vite.config.ts
### README.md
### src/main.tsx

Requirements:
- Use React 18 + TypeScript + Vite only.
- Keep all UI code in src/main.tsx for reliability.
- Do not use Tailwind, Zustand, React Query, React Router, Axios, Zod, or any package not listed below.
- package.json must include scripts: "dev": "vite", "build": "vite build", "preview": "vite preview".
- package.json dependencies must include exactly "react": "^18.2.0", "react-dom": "^18.2.0".
- package.json devDependencies must include exactly "typescript": "^5.4.5", "vite": "^5.4.0", "@vitejs/plugin-react": "^4.3.1", "@types/react": "^18.2.66", "@types/react-dom": "^18.2.22".
- Use CSS inside src/main.tsx via a <style> tag or injected style element; do not reference external CSS files.
- Use createRoot from "react-dom/client".
- The first screen must be the usable product, not a marketing landing page.
- Make the UI domain-specific to the product idea with realistic seed data, empty states, loading/error states, and at least one create/update/delete interaction.
- Try to call the backend API endpoints from the PRD with fetch, but gracefully fall back to local in-memory demo data when the API is unavailable so static preview still works.
- When creating fallback records from form state, use the actual state variable names declared in the component; do not reference undeclared shorthand variables.
- Use accessible labels, keyboard-friendly buttons/forms, responsive layout, and professional visual polish.
- Avoid one-color purple/blue gradient themes; use a restrained multi-color palette that fits the product domain.
- README.md must not contain fenced code blocks; write commands as inline code or plain bullet text.
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
