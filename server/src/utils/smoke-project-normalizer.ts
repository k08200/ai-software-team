import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";

type PackageJson = {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
};

const BACKEND_DEPENDENCIES = {
  express: "^4.19.2",
};

const BACKEND_DEV_DEPENDENCIES = {
  "@types/express": "^4.17.21",
  "@types/node": "^20.14.0",
  tsx: "^4.15.6",
  typescript: "^5.4.5",
};

const FRONTEND_DEPENDENCIES = {
  react: "^18.2.0",
  "react-dom": "^18.2.0",
};

const FRONTEND_DEV_DEPENDENCIES = {
  "@types/react": "^18.2.66",
  "@types/react-dom": "^18.2.22",
  "@vitejs/plugin-react": "^4.3.1",
  typescript: "^5.4.5",
  vite: "^5.4.0",
};

export async function normalizeSmokeGeneratedProjects(outputDir: string): Promise<void> {
  await Promise.all([
    normalizeBackend(path.join(outputDir, "generated/backend")),
    normalizeFrontend(path.join(outputDir, "generated/frontend")),
  ]);
}

async function normalizeBackend(projectDir: string): Promise<void> {
  const packageJsonPath = path.join(projectDir, "package.json");
  const packageJson = await readPackageJson(packageJsonPath);
  if (!packageJson) return;

  delete packageJson.dependencies?.["tsc"];
  delete packageJson.devDependencies?.["tsc"];

  packageJson.scripts = {
    ...packageJson.scripts,
    build: "tsc",
    start: "node dist/index.js",
    dev: "tsx src/index.ts",
  };
  packageJson.dependencies = {
    ...packageJson.dependencies,
    ...BACKEND_DEPENDENCIES,
  };
  packageJson.devDependencies = {
    ...packageJson.devDependencies,
    ...BACKEND_DEV_DEPENDENCIES,
  };

  await writePackageJson(packageJsonPath, packageJson);
}

async function normalizeFrontend(projectDir: string): Promise<void> {
  const packageJsonPath = path.join(projectDir, "package.json");
  const packageJson = await readPackageJson(packageJsonPath);
  if (packageJson) {
    packageJson.scripts = {
      ...packageJson.scripts,
      dev: "vite",
      build: "vite build",
      preview: "vite preview",
    };
    packageJson.dependencies = {
      ...packageJson.dependencies,
      ...FRONTEND_DEPENDENCIES,
    };
    packageJson.devDependencies = {
      ...packageJson.devDependencies,
      ...FRONTEND_DEV_DEPENDENCIES,
    };

    await writePackageJson(packageJsonPath, packageJson);
  }

  await removeMissingCssReferences(path.join(projectDir, "index.html"), projectDir);
  await removeMissingCssImports(path.join(projectDir, "src/main.tsx"), projectDir);
}

async function readPackageJson(packageJsonPath: string): Promise<PackageJson | null> {
  try {
    return JSON.parse(await fs.readFile(packageJsonPath, "utf-8")) as PackageJson;
  } catch {
    return null;
  }
}

async function writePackageJson(packageJsonPath: string, packageJson: PackageJson): Promise<void> {
  await fs.writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf-8");
}

async function removeMissingCssReferences(htmlPath: string, projectDir: string): Promise<void> {
  let html: string;
  try {
    html = await fs.readFile(htmlPath, "utf-8");
  } catch {
    return;
  }

  const nextHtml = html.replace(
    /^\s*<link\s+[^>]*href=["']([^"']+\.css)["'][^>]*>\s*$/gm,
    (line, href: string) => cssFileExists(projectDir, href) ? line : "",
  );

  if (nextHtml !== html) {
    await fs.writeFile(htmlPath, nextHtml, "utf-8");
  }
}

async function removeMissingCssImports(filePath: string, projectDir: string): Promise<void> {
  let source: string;
  try {
    source = await fs.readFile(filePath, "utf-8");
  } catch {
    return;
  }

  const nextSource = source.replace(
    /^import\s+["']([^"']+\.css)["'];?\s*$/gm,
    (line, importPath: string) => cssFileExists(projectDir, importPath) ? line : "",
  );

  if (nextSource !== source) {
    await fs.writeFile(filePath, nextSource, "utf-8");
  }
}

function cssFileExists(projectDir: string, cssPath: string): boolean {
  const normalized = cssPath.startsWith("/")
    ? cssPath.slice(1)
    : path.join("src", cssPath);
  return existsSync(path.join(projectDir, normalized));
}
