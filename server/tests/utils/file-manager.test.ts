import fs from "fs/promises";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { FileManager } from "../../src/utils/file-manager.js";

const sessionId = "file-manager-test";
const outputDir = path.join(process.cwd(), "outputs", sessionId);

describe("FileManager", () => {
  afterEach(async () => {
    await fs.rm(outputDir, { recursive: true, force: true });
  });

  it("preserves a trailing unclosed markdown code block as a file", async () => {
    const fileManager = new FileManager(sessionId);
    const markdown = `### package.json
\`\`\`json
{"name":"demo"}
\`\`\`

### src/index.ts
\`\`\`ts
console.log("still useful");
`;

    await fileManager.saveMarkdownCodeBlocksAsFiles(markdown, "generated/backend", "BACKEND_RESPONSE.md");

    await expect(
      fs.readFile(path.join(outputDir, "generated/backend/package.json"), "utf-8"),
    ).resolves.toContain("\"demo\"");
    await expect(
      fs.readFile(path.join(outputDir, "generated/backend/src/index.ts"), "utf-8"),
    ).resolves.toContain("still useful");
  });

  it("extracts file sections even when README content contains fenced code examples", async () => {
    const fileManager = new FileManager(sessionId);
    const markdown = `### README.md
\`\`\`markdown
# Demo

\`\`\`bash
npm install
\`\`\`
\`\`\`

### src/index.ts
\`\`\`ts
console.log("after readme");
\`\`\`
`;

    await fileManager.saveMarkdownCodeBlocksAsFiles(markdown, "generated/backend", "BACKEND_RESPONSE.md");

    const readme = await fs.readFile(path.join(outputDir, "generated/backend/README.md"), "utf-8");
    const source = await fs.readFile(path.join(outputDir, "generated/backend/src/index.ts"), "utf-8");

    expect(readme).toContain("npm install");
    expect(source).toContain("after readme");
  });
});
