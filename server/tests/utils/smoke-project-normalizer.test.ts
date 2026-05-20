import fs from "fs/promises";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { normalizeSmokeGeneratedProjects } from "../../src/utils/smoke-project-normalizer.js";

const outputDir = path.join(process.cwd(), "outputs", "smoke-normalizer-test");

describe("normalizeSmokeGeneratedProjects", () => {
  afterEach(async () => {
    await fs.rm(outputDir, { recursive: true, force: true });
  });

  it("repairs smoke package manifests and removes missing css references", async () => {
    const backendDir = path.join(outputDir, "generated/backend");
    const frontendDir = path.join(outputDir, "generated/frontend");
    await fs.mkdir(path.join(frontendDir, "src"), { recursive: true });
    await fs.mkdir(path.join(backendDir, "src"), { recursive: true });

    await fs.writeFile(path.join(backendDir, "package.json"), JSON.stringify({
      scripts: {},
      dependencies: {},
      devDependencies: { tsc: "^5.4.5" },
    }));
    await fs.writeFile(path.join(frontendDir, "package.json"), JSON.stringify({
      scripts: { build: "tsc && vite build" },
      dependencies: {},
      devDependencies: { vite: "^3.0.0", "@vitejs/plugin-react": "^3.0.0" },
    }));
    await fs.writeFile(path.join(frontendDir, "index.html"), "<link rel=\"stylesheet\" href=\"/src/assets/tailwind.css\">\n<div id=\"root\"></div>");
    await fs.writeFile(path.join(frontendDir, "src/main.tsx"), "import './missing.css';\nconsole.log('ok');");
    await fs.writeFile(
      path.join(backendDir, "src/index.ts"),
      "import express from 'express';\nconst app = express();\nconst PORT = process.env.PORT || 3000;\napp.listen(PORT, () => {\n  console.log(`Server is running",
    );

    await normalizeSmokeGeneratedProjects(outputDir);

    const backendPackage = JSON.parse(await fs.readFile(path.join(backendDir, "package.json"), "utf-8"));
    const frontendPackage = JSON.parse(await fs.readFile(path.join(frontendDir, "package.json"), "utf-8"));
    const backendSource = await fs.readFile(path.join(backendDir, "src/index.ts"), "utf-8");
    const html = await fs.readFile(path.join(frontendDir, "index.html"), "utf-8");
    const source = await fs.readFile(path.join(frontendDir, "src/main.tsx"), "utf-8");

    expect(backendPackage.devDependencies.tsc).toBeUndefined();
    expect(backendPackage.devDependencies.typescript).toBe("^5.4.5");
    expect(frontendPackage.scripts.build).toBe("vite build");
    expect(frontendPackage.devDependencies.vite).toBe("^5.4.0");
    expect(backendSource).toContain("Server is running on port ${PORT}");
    expect(backendSource).toContain("});");
    expect(html).not.toContain("tailwind.css");
    expect(html).toContain('<script type="module" src="/src/main.tsx"></script>');
    expect(source).not.toContain("missing.css");
  });
});
