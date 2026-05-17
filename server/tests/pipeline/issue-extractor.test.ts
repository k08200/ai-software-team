import { describe, it, expect } from "vitest";
import { extractIssues, countIssues } from "../../src/utils/issue-extractor.js";

describe("extractIssues", () => {
  it("extracts numbered issues from ISSUES section", () => {
    const content = `
## QA Report

### ISSUES:
1. Missing input validation on /api/login endpoint
2. Password not hashed before storage
3. No rate limiting on authentication endpoint

### Summary
**Total Issues Found: 3**
`;
    const issues = extractIssues(content);
    expect(issues.length).toBeGreaterThanOrEqual(3);
  });

  it("returns empty array when no issues", () => {
    const content = `
## Security Report

### Summary
**Total Security Issues: 0** - Code passes security review.
`;
    const issues = extractIssues(content);
    expect(issues.length).toBe(0);
  });

  it("extracts issues from bullet points", () => {
    const content = `
## Code Review

### ISSUES:
- Missing error handling in database queries - services/user.service.ts - Severity: HIGH
- Unused import in App.tsx - Severity: LOW
`;
    const issues = extractIssues(content);
    expect(issues.length).toBeGreaterThanOrEqual(2);
  });

  it("handles [BUG] markers", () => {
    const content = `
[BUG]: SQL injection vulnerability in search endpoint
[VULN]: XSS in user input rendering
[CRITICAL]: Authentication bypass possible
`;
    const issues = extractIssues(content);
    expect(issues.length).toBeGreaterThanOrEqual(3);
  });

  it("falls back to count pattern", () => {
    const content = `Analysis complete. 5 issues found in the codebase.`;
    const issues = extractIssues(content);
    expect(issues.length).toBe(5);
  });
});

describe("countIssues", () => {
  it("sums issues across all agents", () => {
    const qaContent = `### ISSUES:\n1. Missing validation\n2. No error handling\n**Total Issues Found: 2**`;
    const secContent = `### ISSUES:\n1. SQL injection risk\n**Total Security Issues: 1**`;
    const reviewContent = `**Total Review Issues: 0** - Code meets production quality standards.`;

    const result = countIssues(qaContent, secContent, reviewContent);
    expect(result.total).toBeGreaterThanOrEqual(2);
    expect(result.qa.length).toBeGreaterThanOrEqual(2);
    expect(result.security.length).toBeGreaterThanOrEqual(1);
  });

  it("returns zero total when all agents report clean", () => {
    const clean = "**Total Issues Found: 0** - Code is ready for production.";
    const result = countIssues(clean, clean, clean);
    expect(result.total).toBe(0);
  });
});
