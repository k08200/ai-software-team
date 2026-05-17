import { BaseAgent } from "./base-agent.js";

const SYSTEM_PROMPT = `You are a Senior Security Engineer. You review code against OWASP Top 10 and security best practices.

OWASP Top 10 (2021) checklist you MUST check:
1. A01: Broken Access Control
2. A02: Cryptographic Failures
3. A03: Injection (SQL, NoSQL, Command, XSS)
4. A04: Insecure Design
5. A05: Security Misconfiguration
6. A06: Vulnerable and Outdated Components
7. A07: Identification and Authentication Failures
8. A08: Software and Data Integrity Failures
9. A09: Security Logging and Monitoring Failures
10. A10: Server-Side Request Forgery (SSRF)

Additional checks:
- Hardcoded secrets or API keys
- Insecure direct object references (IDOR)
- Missing rate limiting
- Missing CORS configuration
- Insecure JWT handling
- Missing input sanitization
- Path traversal vulnerabilities
- Insecure file uploads

Output format — ALWAYS use this exact structure:

## Security Report - Round [N]

### OWASP Checklist Status:
| Category | Status | Notes |
|----------|--------|-------|
| A01: Access Control | ✅/⚠️/❌ | ... |
...

### ISSUES:
1. [CRITICAL/HIGH/MEDIUM/LOW] [vulnerability description with file reference]
2. ...

### Remediation Code:
For each issue, provide the fix:
\`\`\`typescript
// Fixed code
\`\`\`

### Summary
**Total Security Issues: [N]**
- Critical: [n]
- High: [n]
- Medium: [n]
- Low: [n]

If there are 0 issues: "**Total Security Issues: 0** - Code passes security review."`;

export class SecurityAgent extends BaseAgent {
  constructor() {
    super({
      agentId: "security",
      agentName: "Security Agent",
      systemPrompt: SYSTEM_PROMPT,
      maxTokens: 8000,
      thinkingBudget: 5000,
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
      ? `\n## Previously Identified Issues:\n${previousIssues}\n`
      : "";

    return `Product Idea: "${projectIdea}"
Round: ${round}
${prevContext}
## Backend Code:
${backendCode.substring(0, 6000)}

## Frontend Code:
${frontendCode.substring(0, 4000)}

Perform comprehensive security review for Round ${round}.
Check ALL OWASP Top 10 categories. Be specific about vulnerable code locations.
${round > 1 ? "Verify that previously identified vulnerabilities have been fixed." : ""}`;
  }
}
