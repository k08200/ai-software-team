import { BaseAgent } from "./base-agent.js";
import { config, type PipelineProfile } from "../config.js";

const SYSTEM_PROMPT = `You are an expert local-first MVP planner. You replace separate CTO and PM planning for fast MVP generation.

Your job is to produce one compact implementation blueprint that backend and frontend agents can follow without extra clarification.

Use these hard constraints:
- React 18 + TypeScript + Vite frontend.
- Express + TypeScript backend.
- In-memory storage with realistic seed data.
- No auth, databases, queues, payments, Docker, cloud services, or heavy dependencies.
- One polished vertical slice only.
- Prefer fewer endpoints and fewer fields when the idea is broad.

Be specific, short, and implementation-oriented.`;

export class FastMvpPlannerAgent extends BaseAgent {
  constructor(profile: PipelineProfile = config.pipeline.profile) {
    super({
      agentId: "planner",
      agentName: "Fast MVP Planner",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 2600,
      thinkingBudget: 1000,
      profile,
    });
  }

  buildPrompt(projectIdea: string): string {
    return `Product Idea: "${projectIdea}"

FAST MVP MODE: Produce one compact implementation blueprint. Output only these sections:

## Product Slice
- Product name
- Primary user
- One core workflow the generated app must support

## Data Model
- Define 1-2 TypeScript interfaces only.
- Include realistic seed data shape.

## API Contract
- Define GET /health.
- Define 3-4 REST endpoints under /api.
- For each endpoint include method, path, purpose, request shape, and response shape.

## Frontend Contract
- Single-screen layout sections.
- Form fields and primary actions.
- Local fallback behavior when API fetch fails.

## Acceptance Checks
- 5 concrete checks for the generated app.

Keep the full answer under 700 words. Do not include code fences.`;
  }
}
