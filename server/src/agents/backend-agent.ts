import { BaseAgent } from "./base-agent.js";
import { config } from "../config.js";

const SYSTEM_PROMPT = `You are a Senior Backend Engineer. You write production-quality, complete server-side code.

You MUST write COMPLETE, RUNNABLE code — no placeholders, no "TODO" comments, no "implement this later".

Default full-profile requirements for code you write:
1. TypeScript with strict mode
2. Full error handling with proper HTTP status codes
3. Input validation on all endpoints
4. Authentication middleware where specified
5. Database queries with proper error handling
6. Environment variable configuration (no hardcoded values)
7. Proper logging
8. Clean architecture: routes → controllers → services → repositories

When the user prompt says MVP MODE or SMOKE MODE, the mode-specific dependency and structure rules override the full-profile defaults.

When producing full-profile backend code, structure it as a complete project:

\`\`\`
src/
├── index.ts           # Entry point
├── app.ts             # Express/Fastify setup
├── config.ts          # Environment configuration
├── routes/
│   └── [resource].routes.ts
├── controllers/
│   └── [resource].controller.ts
├── services/
│   └── [resource].service.ts
├── repositories/
│   └── [resource].repository.ts
├── models/
│   └── [resource].model.ts
├── middleware/
│   ├── auth.middleware.ts
│   ├── error.middleware.ts
│   └── validate.middleware.ts
├── types/
│   └── index.ts
└── utils/
    └── [utility].ts
\`\`\`

Output format: One markdown code block per file, with the file path as the header.
Example:
### src/index.ts
\`\`\`typescript
// complete code here
\`\`\`

STRICT FILE OUTPUT CONTRACT:
- Return ONLY file sections in the format above.
- Each file section MUST start with a markdown heading containing only the relative file path, e.g. "### package.json" or "### src/index.ts".
- The code fence MUST immediately follow the file path heading.
- Include package.json, tsconfig.json, .env.example, README.md, and every source/test file needed to run the project.
- Do not wrap multiple files in one code block.
- Do not include prose between files, commentary, summaries, or directory trees outside code blocks.
- Do not use absolute paths or parent directory paths.`;

export class BackendAgent extends BaseAgent {
  private readonly runtimeProfile: typeof config.pipeline.profile;

  constructor(profile: typeof config.pipeline.profile = config.pipeline.profile) {
    super({
      agentId: "backend",
      agentName: "Backend Agent",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 16000,
      thinkingBudget: 8000,
      profile,
    });
    this.runtimeProfile = profile;
  }

  buildPrompt(projectIdea: string, architecture: string, prd: string): string {
    if (this.runtimeProfile === "smoke") {
      return `Product Idea: "${projectIdea}"

SMOKE MODE: Implement a tiny runnable backend only. Keep it simple and complete.

Return exactly these files, and no other text:
### package.json
### tsconfig.json
### src/index.ts

Requirements:
- Use Express + TypeScript.
- Use in-memory storage only.
- Implement only: GET /health, GET /memos, POST /memos, PUT /memos/:id, DELETE /memos/:id.
- package.json must include scripts: "build": "tsc", "start": "node dist/index.js", "dev": "tsx src/index.ts".
- package.json dependencies must include exactly "express": "^4.19.2".
- package.json devDependencies must include exactly "typescript": "^5.4.5", "tsx": "^4.15.6", "@types/express": "^4.17.21", "@types/node": "^20.14.0".
- tsconfig.json must set "rootDir": "src", "outDir": "dist", "module": "CommonJS", "target": "ES2022", "esModuleInterop": true, and "strict": true.
- Do not import packages that are not listed in package.json.
- Use a simple incrementing number id; do not import uuid.
- Do not add comments or extra architecture layers.
- Keep each file concise enough to fit in this response.
- Follow the strict file output contract: each heading immediately followed by one code block.`;
    }

    if (this.runtimeProfile === "fast-mvp") {
      return `Product Idea: "${projectIdea}"

## Fast MVP Blueprint:
${prd}

FAST MVP MODE: Implement a small idea-specific Express + TypeScript backend for the blueprint.

Return exactly these files, and no other text:
### package.json
### tsconfig.json
### src/index.ts

Requirements:
- Use Express + TypeScript only.
- Use in-memory storage with realistic seed data derived from the product idea.
- Implement GET /health plus 3-4 REST endpoints under /api that match the blueprint.
- Include JSON responses, CORS support, and small local request validation helpers.
- package.json must include scripts: "build": "tsc", "start": "node dist/index.js", "dev": "tsx src/index.ts".
- package.json dependencies must include exactly "express": "^4.19.2", "cors": "^2.8.5".
- package.json devDependencies must include exactly "typescript": "^5.4.5", "tsx": "^4.15.6", "@types/express": "^4.17.21", "@types/cors": "^2.8.17", "@types/node": "^20.14.0".
- tsconfig.json must set "rootDir": "src", "outDir": "dist", "module": "CommonJS", "target": "ES2022", "esModuleInterop": true, and "strict": true.
- Keep all backend source in src/index.ts.
- Do not import packages that are not listed in package.json.
- Do not import uuid; use a simple local incrementing id like let nextId = 3.
- No databases, auth, payments, queues, Docker, tests, or cloud services.
- Follow the strict file output contract: each heading immediately followed by one code block.`;
    }

    if (this.runtimeProfile === "mvp") {
      return `Product Idea: "${projectIdea}"

## Technical Architecture:
${architecture}

## Product Requirements & API Specification:
${prd}

MVP MODE: Implement a small idea-specific Express + TypeScript backend that supports one usable vertical slice.

Return exactly these files, and no other text:
### package.json
### tsconfig.json
### .env.example
### README.md
### src/index.ts

Requirements:
- Use Express + TypeScript only.
- Use in-memory storage with realistic seed data derived from the product idea.
- Implement GET /health plus 3-5 REST endpoints under /api that match the PRD.
- Include CORS-friendly JSON responses and consistent error responses.
- Validate request bodies with small local helper functions; do not add validation libraries.
- package.json must include scripts: "build": "tsc", "start": "node dist/index.js", "dev": "tsx src/index.ts".
- package.json dependencies must include exactly "express": "^4.19.2", "cors": "^2.8.5".
- package.json devDependencies must include exactly "typescript": "^5.4.5", "tsx": "^4.15.6", "@types/express": "^4.17.21", "@types/cors": "^2.8.17", "@types/node": "^20.14.0".
- tsconfig.json must set "rootDir": "src", "outDir": "dist", "module": "CommonJS", "target": "ES2022", "esModuleInterop": true, and "strict": true.
- Keep all backend source in src/index.ts for reliability.
- Do not import packages that are not listed in package.json.
- Do not import uuid; use a simple local incrementing id like let nextId = 3.
- No databases, auth, payments, queues, Docker, or cloud services.
- README.md must not contain fenced code blocks; write commands as inline code or plain bullet text.
- Follow the strict file output contract: each heading immediately followed by one code block.`;
    }

    return `Product Idea: "${projectIdea}"

## Technical Architecture:
${architecture}

## Product Requirements & API Specification:
${prd}

Implement the COMPLETE backend application.
Write every file completely — no stubs, no TODOs.
Include package.json, tsconfig.json, .env.example, and all source files.
The code must be runnable with: npm install && npm run dev

Remember the strict file output contract: one "### relative/path" heading followed immediately by one code block per file, no prose outside file sections.`;
  }
}
