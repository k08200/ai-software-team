/**
 * Extracts issues from agent output text using pattern matching.
 * Looks for numbered lists and bullet points in issue-related sections.
 */
export function extractIssues(content: string): string[] {
  const issues: string[] = [];
  const seen = new Set<string>();

  function addIssue(text: string): void {
    const cleaned = text.trim();
    if (cleaned.length >= 10 && !seen.has(cleaned)) {
      seen.add(cleaned);
      issues.push(cleaned);
    }
  }

  // Strategy 1: Find content in issue/bug sections (any heading depth)
  // Matches: "## ISSUES:", "### ISSUES:", "ISSUES:", etc.
  const sectionRegex = /(?:^|\n)#{0,6}\s*(?:ISSUES?|BUGS?|VULNERABILIT(?:Y|IES)|PROBLEMS?|FINDINGS?)\s*:?\s*\n([\s\S]*?)(?=\n#{1,6}\s|\n\n\n|$)/gi;

  let sectionMatch: RegExpExecArray | null;
  while ((sectionMatch = sectionRegex.exec(content)) !== null) {
    const section = sectionMatch[1];
    const lines = section.split("\n");
    for (const line of lines) {
      const stripped = line.trim();
      // Match: "1. text", "- text", "* text", "• text"
      const itemMatch = stripped.match(/^(?:\d+[.)]\s+|[-*•]\s+)(.{10,})/);
      if (itemMatch) {
        addIssue(itemMatch[1]);
      }
    }
  }

  // Strategy 2: Scan entire document for numbered/bulleted items near issue keywords
  const lines = content.split("\n");
  let inIssueSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineLower = line.toLowerCase();

    // Track if we're in an issue-related section
    if (/^#{0,6}\s*(?:issues?|bugs?|vulnerabilit|problems?|findings?)/i.test(line)) {
      inIssueSection = true;
      continue;
    }

    // Exit issue section on new heading
    if (/^#{1,6}\s+\w/.test(line) && !/(?:issues?|bugs?|vulnerabilit)/i.test(lineLower)) {
      inIssueSection = false;
    }

    if (inIssueSection) {
      const stripped = line.trim();
      const itemMatch = stripped.match(/^(?:\d+[.)]\s+|[-*•]\s+)(.{10,})/);
      if (itemMatch) {
        addIssue(itemMatch[1]);
      }
    }
  }

  // Strategy 3: [TAG] markers anywhere in the document
  const markerRegex = /\[(?:BUG|ISSUE|VULN|CRITICAL|HIGH|MEDIUM|LOW)\][:\s]+([^\n]+)/gi;
  let markerMatch: RegExpExecArray | null;
  while ((markerMatch = markerRegex.exec(content)) !== null) {
    addIssue(markerMatch[1]);
  }

  // Strategy 4: Fallback - parse "N issues found" count
  if (issues.length === 0) {
    const countMatch = content.match(/(\d+)\s+(?:issues?|bugs?|vulnerabilit(?:y|ies))\s+(?:found|identified|detected)/i);
    if (countMatch) {
      const count = Math.min(parseInt(countMatch[1], 10), 20);
      for (let i = 1; i <= count; i++) {
        issues.push(`Issue #${i} (see report for details)`);
      }
    }
  }

  return issues;
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
