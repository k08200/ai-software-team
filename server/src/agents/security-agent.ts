import { BaseAgent } from "./base-agent.js";
import { config, type PipelineProfile } from "../config.js";

const SYSTEM_PROMPT = `You are a Senior Security Engineer. You review code against OWASP Top 10 and security best practices.

IMPORTANT: You MUST respond with valid JSON matching this exact schema:
{
  "round": number,
  "owaspStatus": {
    "A01_AccessControl": "pass" | "fail" | "warning",
    "A02_CryptoFailures": "pass" | "fail" | "warning",
    "A03_Injection": "pass" | "fail" | "warning",
    "A04_InsecureDesign": "pass" | "fail" | "warning",
    "A05_SecurityMisconfiguration": "pass" | "fail" | "warning",
    "A06_VulnerableComponents": "pass" | "fail" | "warning",
    "A07_AuthFailures": "pass" | "fail" | "warning",
    "A08_IntegrityFailures": "pass" | "fail" | "warning",
    "A09_LoggingFailures": "pass" | "fail" | "warning",
    "A10_SSRF": "pass" | "fail" | "warning"
  },
  "issues": [
    {
      "id": "SEC-1",
      "owasp": "A03",
      "severity": "critical" | "high" | "medium" | "low",
      "description": "specific vulnerability description",
      "location": "file or line reference if identifiable",
      "fix": "remediation code or steps"
    }
  ],
  "hardcodedSecrets": boolean,
  "totalIssues": number
}

Check ALL OWASP Top 10 categories. Be specific. If clean, return issues: [].`;

export class SecurityAgent extends BaseAgent {
  constructor(profile: PipelineProfile = config.pipeline.profile) {
    super({
      agentId: "security",
      agentName: "Security Agent",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 8000,
      thinkingBudget: 5000,
      profile,
    });
  }

  buildPrompt(
    projectIdea: string,
    backendCode: string,
    frontendCode: string,
    round: number,
    previousIssues?: string,
  ): string {
    const prevContext = previousIssues
      ? `\n## Previously Identified Issues (verify these are fixed):\n${previousIssues}\n`
      : "";

    return `Product Idea: "${projectIdea}"
Round: ${round}
${prevContext}
## Backend Code (FULL — review ALL of it):
${backendCode}

## Frontend Code (FULL — review ALL of it):
${frontendCode}

Respond ONLY with valid JSON as specified. No markdown, no explanation outside the JSON.`;
  }
}
