/**
 * Extracts issues from agent output.
 * Agents now output structured JSON — parse that first, fall back to regex.
 */

interface StructuredIssue {
  id: string;
  severity: string;
  description: string;
}

interface QAOutput {
  issues?: StructuredIssue[];
  totalIssues?: number;
}

interface SecurityOutput {
  issues?: StructuredIssue[];
  totalIssues?: number;
}

interface ReviewOutput {
  issues?: StructuredIssue[];
  totalIssues?: number;
}

function parseJSON<T>(content: string): T | null {
  // Try to extract JSON from the content (handle markdown code blocks)
  const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) ??
                    content.match(/({[\s\S]*})/);

  const raw = jsonMatch ? jsonMatch[1] : content.trim();

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function issueToString(issue: StructuredIssue): string {
  return `[${issue.severity?.toUpperCase() ?? "UNKNOWN"}] ${issue.description}`;
}

function extractFromStructured(content: string): string[] {
  const parsed = parseJSON<QAOutput | SecurityOutput | ReviewOutput>(content);
  if (!parsed) return [];

  const issues = parsed.issues ?? [];
  return issues.map(issueToString).filter((s) => s.length > 10);
}

/**
 * Legacy regex-based extraction (fallback for non-JSON outputs).
 */
function extractFromMarkdown(content: string): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();

  function addIssue(text: string): void {
    const cleaned = text.trim();
    if (cleaned.length >= 10 && !seen.has(cleaned)) {
      seen.add(cleaned);
      issues.push(cleaned);
    }
  }

  const sectionRegex = /(?:^|\n)#{0,6}\s*(?:ISSUES?|BUGS?|VULNERABILIT(?:Y|IES)|PROBLEMS?|FINDINGS?)\s*:?\s*\n([\s\S]*?)(?=\n#{1,6}\s|\n\n\n|$)/gi;
  let sectionMatch: RegExpExecArray | null;
  while ((sectionMatch = sectionRegex.exec(content)) !== null) {
    const section = sectionMatch[1];
    for (const line of section.split("\n")) {
      const m = line.trim().match(/^(?:\d+[.)]\s+|[-*•]\s+)(.{10,})/);
      if (m) addIssue(m[1]);
    }
  }

  const markerRegex = /\[(?:BUG|ISSUE|VULN|CRITICAL|HIGH|MEDIUM|LOW)\][:\s]+([^\n]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = markerRegex.exec(content)) !== null) addIssue(m[1]);

  if (issues.length === 0) {
    const countMatch = content.match(/(\d+)\s+(?:issues?|bugs?|vulnerabilit(?:y|ies))\s+(?:found|identified|detected)/i);
    if (countMatch) {
      const count = Math.min(parseInt(countMatch[1], 10), 20);
      for (let i = 1; i <= count; i++) issues.push(`Issue #${i}`);
    }
  }

  return issues;
}

export function extractIssues(content: string): string[] {
  // Try structured JSON first
  const structured = extractFromStructured(content);
  if (structured.length > 0) return structured;

  // Check for explicit "0 issues" in JSON
  const parsed = parseJSON<{ totalIssues?: number; issues?: unknown[] }>(content);
  if (parsed && (parsed.totalIssues === 0 || (Array.isArray(parsed.issues) && parsed.issues.length === 0))) {
    return [];
  }

  // Fallback to regex
  return extractFromMarkdown(content);
}

export function countIssues(
  qaContent: string,
  securityContent: string,
  reviewContent: string,
): {
  qa: string[];
  security: string[];
  review: string[];
  total: number;
} {
  const qa = extractIssues(qaContent);
  const security = extractIssues(securityContent);
  const review = extractIssues(reviewContent);
  return {
    qa,
    security,
    review,
    total: qa.length + security.length + review.length,
  };
}
