/**
 * Demo mode responses — realistic mock output for each agent.
 * Streamed character-by-character to simulate real Claude output.
 */

export type DemoAgentId =
  | "cto"
  | "pm"
  | "backend"
  | "frontend"
  | "qa"
  | "security"
  | "review"
  | "Backend Fix Agent"
  | "Frontend Fix Agent";

// Thinking block shown before the main response
const THINKING: Record<string, string> = {
  cto: "Let me think through the optimal architecture for this project. I need to consider scalability, maintainability, and the right technology choices. Given the requirements, a Node.js + Express backend with a React frontend makes the most sense. I'll use PostgreSQL for persistence and JWT for authentication.",
  pm: "I need to break down this project into clear user stories and acceptance criteria. Let me prioritize the MVP features vs nice-to-haves. The core value proposition needs to be front and center.",
  backend: "I'll design a clean RESTful API with proper error handling, input validation, and security practices. Using TypeScript for type safety throughout.",
  frontend: "I'll create a responsive UI with great UX. Need to handle loading states, error boundaries, and make it feel polished.",
  qa: "I need to carefully review both the backend and frontend code for bugs, missing test coverage, edge cases, and potential runtime errors.",
  security: "Let me check against all OWASP Top 10 vulnerabilities. Looking for injection risks, authentication weaknesses, exposure of sensitive data, and missing security headers.",
  review: "Let me do a comprehensive architectural and code quality review. Looking at separation of concerns, code reuse, performance patterns, and maintainability.",
};

// Main agent output per agentId
export const DEMO_RESPONSES: Record<DemoAgentId, string> = {
  cto: `# System Architecture — AI-Powered Task Manager

## Technology Stack

### Backend
- **Runtime**: Node.js 20 LTS with TypeScript
- **Framework**: Express 4.x
- **Database**: PostgreSQL 16 with Drizzle ORM
- **Auth**: JWT (access + refresh tokens)
- **Validation**: Zod schemas
- **Queue**: Bull (Redis-backed) for async jobs

### Frontend
- **Framework**: React 18 with TypeScript
- **Build**: Vite 5
- **Styling**: Tailwind CSS 3
- **State**: Zustand
- **Data fetching**: React Query (TanStack)
- **Routing**: React Router v6

## Architecture

\`\`\`
┌─────────────────┐     ┌──────────────────┐     ┌──────────────┐
│   React SPA     │────▶│   Express API    │────▶│  PostgreSQL  │
│  (Vite + TW)   │◀────│  (REST + SSE)   │     │  (Drizzle)   │
└─────────────────┘     └──────────────────┘     └──────────────┘
                                │
                                ▼
                        ┌──────────────┐
                        │    Redis     │
                        │  (sessions + │
                        │   queues)    │
                        └──────────────┘
\`\`\`

## API Design

\`\`\`
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/tasks          # list (filter, sort, paginate)
POST   /api/tasks          # create
GET    /api/tasks/:id      # get
PUT    /api/tasks/:id      # update
DELETE /api/tasks/:id      # delete
PATCH  /api/tasks/:id/done # toggle complete

GET    /api/projects
POST   /api/projects
PUT    /api/projects/:id
DELETE /api/projects/:id
\`\`\`

## Security Model
- bcrypt password hashing (12 rounds)
- JWT access tokens (15min) + refresh tokens (7d)
- CORS restricted to client origin
- Rate limiting: 100 req/min general, 10 req/15min auth
- Parameterized queries only (no raw SQL)
- Input sanitization via Zod at API boundary

## Scalability Notes
- Stateless API enables horizontal scaling
- Database connection pooling (min: 2, max: 10)
- Static assets served via CDN in production
`,

  pm: `# Product Requirements Document — AI Task Manager

## Executive Summary
A lightweight task management SaaS where users create projects, assign tasks, set due dates, and track progress. AI-assisted prioritization suggests which task to tackle next.

## User Stories (MVP)

### Authentication
- **US-001**: As a new user, I can register with email + password
- **US-002**: As a user, I can log in and receive a JWT session
- **US-003**: As a user, I can log out and invalidate my session

### Tasks
- **US-004**: As a user, I can create a task with title, description, priority (low/med/high), and due date
- **US-005**: As a user, I can view all my tasks in a list with filters (status, priority, project)
- **US-006**: As a user, I can mark a task complete/incomplete
- **US-007**: As a user, I can edit or delete a task
- **US-008**: As a user, I can assign a task to a project

### Projects
- **US-009**: As a user, I can create a named project with an optional description
- **US-010**: As a user, I can see all tasks under a project

## Acceptance Criteria (US-004)
1. Title required, 1–200 chars
2. Priority defaults to "medium" if not provided
3. Due date must be today or future (when set)
4. Returns 201 with created task body on success
5. Returns 422 with field errors on validation failure

## Non-Functional Requirements
- P95 API response < 200ms
- Mobile-responsive (breakpoints: sm 640, md 768, lg 1024)
- WCAG 2.1 AA accessibility
- 80%+ test coverage

## Out of Scope (v1)
- Real-time collaboration
- File attachments
- Email notifications
- Mobile native apps
`,

  backend: `// server/src/index.ts — Express API for AI Task Manager
import "dotenv/config";
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Pool } from "pg";

const app = express();
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";

app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:3000" }));
app.use(express.json({ limit: "16kb" }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
const apiLimiter  = rateLimit({ windowMs: 60 * 1000, max: 100 });
app.use("/api", apiLimiter);

// ── Auth middleware ────────────────────────────────────────────────────────
function auth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return void res.status(401).json({ error: "Unauthorized" });
  try {
    (req as any).userId = (jwt.verify(token, JWT_SECRET) as { sub: string }).sub;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

// ── Register ───────────────────────────────────────────────────────────────
const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

app.post("/api/auth/register", authLimiter, async (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(422).json({ errors: parsed.error.flatten() });
  const { email, password } = parsed.data;
  const hash = await bcrypt.hash(password, 12);
  try {
    const { rows } = await db.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
      [email, hash],
    );
    const token = jwt.sign({ sub: rows[0].id }, JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({ user: rows[0], token });
  } catch (e: any) {
    if (e.code === "23505") return void res.status(409).json({ error: "Email already exists" });
    throw e;
  }
});

// ── Login ──────────────────────────────────────────────────────────────────
app.post("/api/auth/login", authLimiter, async (req, res) => {
  const parsed = RegisterSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(422).json({ errors: parsed.error.flatten() });
  const { email, password } = parsed.data;
  const { rows } = await db.query("SELECT * FROM users WHERE email = $1", [email]);
  if (!rows[0] || !(await bcrypt.compare(password, rows[0].password_hash))) {
    return void res.status(401).json({ error: "Invalid credentials" });
  }
  const token = jwt.sign({ sub: rows[0].id }, JWT_SECRET, { expiresIn: "7d" });
  res.json({ user: { id: rows[0].id, email: rows[0].email }, token });
});

// ── Tasks ──────────────────────────────────────────────────────────────────
const TaskSchema = z.object({
  title:       z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  priority:    z.enum(["low", "medium", "high"]).default("medium"),
  due_date:    z.string().datetime().optional(),
  project_id:  z.number().int().positive().optional(),
});

app.get("/api/tasks", auth, async (req, res) => {
  const userId = (req as any).userId;
  const { status, priority, project_id } = req.query;
  const conditions = ["user_id = $1"];
  const params: unknown[] = [userId];
  if (status)     { params.push(status);     conditions.push(\`status = $\${params.length}\`); }
  if (priority)   { params.push(priority);   conditions.push(\`priority = $\${params.length}\`); }
  if (project_id) { params.push(project_id); conditions.push(\`project_id = $\${params.length}\`); }
  const { rows } = await db.query(
    \`SELECT * FROM tasks WHERE \${conditions.join(" AND ")} ORDER BY created_at DESC\`,
    params,
  );
  res.json({ tasks: rows });
});

app.post("/api/tasks", auth, async (req, res) => {
  const parsed = TaskSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(422).json({ errors: parsed.error.flatten() });
  const { title, description, priority, due_date, project_id } = parsed.data;
  const { rows } = await db.query(
    \`INSERT INTO tasks (user_id, title, description, priority, due_date, project_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *\`,
    [(req as any).userId, title, description ?? null, priority, due_date ?? null, project_id ?? null],
  );
  res.status(201).json({ task: rows[0] });
});

app.patch("/api/tasks/:id/done", auth, async (req, res) => {
  const { rows } = await db.query(
    "UPDATE tasks SET completed = NOT completed WHERE id = $1 AND user_id = $2 RETURNING *",
    [req.params.id, (req as any).userId],
  );
  if (!rows[0]) return void res.status(404).json({ error: "Not found" });
  res.json({ task: rows[0] });
});

app.delete("/api/tasks/:id", auth, async (req, res) => {
  const { rowCount } = await db.query(
    "DELETE FROM tasks WHERE id = $1 AND user_id = $2",
    [req.params.id, (req as any).userId],
  );
  if (!rowCount) return void res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

// ── Error handler ──────────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(process.env.PORT ?? 3001, () => console.log("API ready"));
`,

  frontend: `// client/src/App.tsx — React Task Manager UI
import { useState, useEffect } from "react";
import axios from "axios";

const api = axios.create({ baseURL: "/api" });
api.interceptors.request.use((c) => {
  const t = localStorage.getItem("token");
  if (t) c.headers.Authorization = \`Bearer \${t}\`;
  return c;
});

interface Task {
  id: number; title: string; description?: string;
  priority: "low" | "medium" | "high"; completed: boolean;
  due_date?: string; created_at: string;
}

const PRIORITY_COLOR = {
  low: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-red-100 text-red-800",
};

// ── Login form ─────────────────────────────────────────────────────────────
function LoginForm({ onLogin }: { onLogin: (token: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const { data } = await api.post("/auth/login", { email, password });
      localStorage.setItem("token", data.token);
      onLogin(data.token);
    } catch {
      setError("Invalid credentials");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={submit} className="bg-white p-8 rounded-xl shadow-sm w-96 space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Task Manager</h1>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <input className="w-full border rounded-lg p-3" placeholder="Email"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="w-full border rounded-lg p-3" type="password" placeholder="Password"
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <button className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700">
          Sign In
        </button>
      </form>
    </div>
  );
}

// ── Task card ──────────────────────────────────────────────────────────────
function TaskCard({ task, onToggle, onDelete }: {
  task: Task;
  onToggle: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className={\`bg-white rounded-xl p-4 shadow-sm flex items-start gap-3 \${task.completed ? "opacity-60" : ""}\`}>
      <input type="checkbox" className="mt-1 h-4 w-4 rounded accent-blue-600"
        checked={task.completed} onChange={() => onToggle(task.id)} />
      <div className="flex-1">
        <p className={\`font-medium \${task.completed ? "line-through text-gray-400" : "text-gray-900"}\`}>
          {task.title}
        </p>
        {task.description && <p className="text-sm text-gray-500 mt-0.5">{task.description}</p>}
        <div className="flex gap-2 mt-2">
          <span className={\`text-xs px-2 py-0.5 rounded-full font-medium \${PRIORITY_COLOR[task.priority]}\`}>
            {task.priority}
          </span>
          {task.due_date && (
            <span className="text-xs text-gray-400">
              Due {new Date(task.due_date).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
      <button onClick={() => onDelete(task.id)}
        className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none">×</button>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────
function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [filter, setFilter] = useState<"all" | "active" | "done">("all");

  useEffect(() => { loadTasks(); }, []);

  async function loadTasks() {
    const { data } = await api.get("/tasks");
    setTasks(data.tasks);
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await api.post("/tasks", { title: title.trim(), priority });
    setTitle("");
    loadTasks();
  }

  async function toggleTask(id: number) {
    await api.patch(\`/tasks/\${id}/done\`);
    loadTasks();
  }

  async function deleteTask(id: number) {
    await api.delete(\`/tasks/\${id}\`);
    loadTasks();
  }

  const filtered = tasks.filter((t) =>
    filter === "all" ? true : filter === "done" ? t.completed : !t.completed,
  );
  const done  = tasks.filter((t) => t.completed).length;
  const total = tasks.length;

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">My Tasks</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{done}/{total} done</span>
          <button onClick={onLogout} className="text-sm text-gray-400 hover:text-gray-600">Logout</button>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Add task */}
        <form onSubmit={addTask} className="flex gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a task..." className="flex-1 border rounded-lg p-3 text-sm" />
          <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}
            className="border rounded-lg p-3 text-sm">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <button type="submit" className="bg-blue-600 text-white px-4 py-3 rounded-lg text-sm font-medium hover:bg-blue-700">
            Add
          </button>
        </form>

        {/* Filter tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          {(["all", "active", "done"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={\`px-4 py-1.5 rounded-md text-sm font-medium transition \${
                filter === f ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}\`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Task list */}
        <div className="space-y-2">
          {filtered.length === 0 && (
            <p className="text-center text-gray-400 py-8">No tasks yet. Add one above!</p>
          )}
          {filtered.map((t) => (
            <TaskCard key={t.id} task={t} onToggle={toggleTask} onDelete={deleteTask} />
          ))}
        </div>
      </main>
    </div>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  function logout() { localStorage.removeItem("token"); setToken(null); }
  return token
    ? <Dashboard onLogout={logout} />
    : <LoginForm onLogin={setToken} />;
}
`,

  qa: `{
  "round": 1,
  "summary": "Found 4 issues in backend and frontend code. Critical SQL injection risk via dynamic query string, missing CSRF protection on state-change endpoints, frontend has no loading/error states, and missing input validation on priority filter.",
  "issues": [
    {
      "id": "QA-001",
      "severity": "critical",
      "description": "Dynamic SQL string interpolation in GET /api/tasks allows potential SQL injection via status/priority/project_id query params",
      "location": "server/src/index.ts:62-70",
      "fix": "Replace string interpolation with parameterized conditions using a query builder"
    },
    {
      "id": "QA-002",
      "severity": "high",
      "description": "Frontend TaskCard onDelete calls API without confirmation — users can accidentally delete tasks",
      "location": "client/src/App.tsx:74",
      "fix": "Add window.confirm or a modal confirmation before delete"
    },
    {
      "id": "QA-003",
      "severity": "medium",
      "description": "loadTasks() in Dashboard has no error handling — if API fails, UI silently shows empty list",
      "location": "client/src/App.tsx:91",
      "fix": "Wrap in try/catch and show error toast"
    },
    {
      "id": "QA-004",
      "severity": "low",
      "description": "addTask does not disable the submit button while the request is in-flight, allowing duplicate submissions",
      "location": "client/src/App.tsx:97",
      "fix": "Add loading state to the form submit button"
    }
  ],
  "missingTests": [
    "Unit tests for auth middleware",
    "Integration tests for POST /api/tasks with invalid payload",
    "Frontend: test TaskCard toggle behavior"
  ],
  "requirementsGaps": [],
  "totalIssues": 4
}`,

  security: `{
  "round": 1,
  "owaspStatus": {
    "A01_AccessControl": "pass",
    "A02_CryptoFailures": "pass",
    "A03_Injection": "fail",
    "A04_InsecureDesign": "warning",
    "A05_SecurityMisconfiguration": "warning",
    "A06_VulnerableComponents": "pass",
    "A07_AuthFailures": "pass",
    "A08_IntegrityFailures": "pass",
    "A09_LoggingFailures": "warning",
    "A10_SSRF": "pass"
  },
  "issues": [
    {
      "id": "SEC-001",
      "severity": "critical",
      "description": "A03 Injection: dynamic SQL in GET /api/tasks — conditions array uses string concatenation to build the WHERE clause, opening risks if column names ever come from user input in future refactors",
      "location": "server/src/index.ts:62",
      "fix": "Use a query builder (Drizzle/Knex) or explicit allow-list for filter columns"
    },
    {
      "id": "SEC-002",
      "severity": "medium",
      "description": "A05 SecurityMisconfiguration: No security headers (X-Content-Type-Options, X-Frame-Options, CSP). Express serves no protective headers by default.",
      "location": "server/src/index.ts:1",
      "fix": "Add helmet middleware: npm install helmet; app.use(helmet())"
    },
    {
      "id": "SEC-003",
      "severity": "low",
      "description": "A09 LoggingFailures: Auth failures (wrong password, expired token) are returned to client but not logged server-side, making brute-force monitoring impossible.",
      "location": "server/src/index.ts:80-85",
      "fix": "Add structured logging for auth failures with IP + timestamp"
    }
  ],
  "hardcodedSecrets": [],
  "totalIssues": 3
}`,

  review: `{
  "round": 1,
  "architectureScore": 74,
  "architectureSummary": "Good overall structure with clean separation of concerns. Main concerns: SQL query construction safety, missing middleware for security headers, frontend needs proper error boundaries.",
  "issues": [
    {
      "id": "REV-001",
      "severity": "high",
      "category": "security",
      "before": "const conditions = [\\"user_id = $1\\"]; params.push(status); conditions.push(\`status = $\${params.length}\`)",
      "after": "Use Drizzle query builder with .where(and(eq(tasks.userId, userId), filter?.status ? eq(tasks.status, filter.status) : undefined))"
    },
    {
      "id": "REV-002",
      "severity": "medium",
      "category": "quality",
      "before": "All code in single App.tsx file — 160+ lines mixing auth, API calls, UI logic",
      "after": "Split into: hooks/useTasks.ts (API calls), components/TaskCard.tsx, components/LoginForm.tsx, pages/Dashboard.tsx"
    }
  ],
  "positives": [
    "JWT auth implemented correctly with proper expiry",
    "bcrypt with 12 rounds is appropriate",
    "Zod validation at API boundary",
    "Rate limiting on auth endpoints"
  ],
  "totalIssues": 2
}`,

  "Backend Fix Agent": `// server/src/index.ts — FIXED: Added helmet, safe query building, auth failure logging
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Pool } from "pg";

const app = express();
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret";

app.use(cors({ origin: process.env.CLIENT_ORIGIN ?? "http://localhost:3000" }));
app.use(helmet());  // FIX SEC-002: security headers
app.use(express.json({ limit: "16kb" }));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });
const apiLimiter  = rateLimit({ windowMs: 60 * 1000, max: 100 });
app.use("/api", apiLimiter);

function auth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return void res.status(401).json({ error: "Unauthorized" });
  try {
    (req as any).userId = (jwt.verify(token, JWT_SECRET) as { sub: string }).sub;
    next();
  } catch {
    console.warn("[Auth] Invalid token attempt from", req.ip);  // FIX SEC-003
    res.status(401).json({ error: "Invalid token" });
  }
}

// FIX QA-001 / SEC-001: Safe parameterized query — no string interpolation for column names
const ALLOWED_STATUS   = new Set(["active", "done", "all"]);
const ALLOWED_PRIORITY = new Set(["low", "medium", "high"]);

app.get("/api/tasks", auth, async (req, res) => {
  const userId    = (req as any).userId;
  const status    = typeof req.query.status === "string" && ALLOWED_STATUS.has(req.query.status)
    ? req.query.status : null;
  const priority  = typeof req.query.priority === "string" && ALLOWED_PRIORITY.has(req.query.priority)
    ? req.query.priority : null;
  const projectId = typeof req.query.project_id === "string"
    ? parseInt(req.query.project_id, 10) || null : null;

  const { rows } = await db.query(
    \`SELECT * FROM tasks
     WHERE user_id = $1
       AND ($2::text IS NULL OR status = $2)
       AND ($3::text IS NULL OR priority = $3)
       AND ($4::int  IS NULL OR project_id = $4)
     ORDER BY created_at DESC\`,
    [userId, status, priority, projectId],
  );
  res.json({ tasks: rows });
});

app.post("/api/tasks", auth, async (req, res) => {
  const TaskSchema = z.object({
    title:       z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    priority:    z.enum(["low", "medium", "high"]).default("medium"),
    due_date:    z.string().datetime().optional(),
    project_id:  z.number().int().positive().optional(),
  });
  const parsed = TaskSchema.safeParse(req.body);
  if (!parsed.success) return void res.status(422).json({ errors: parsed.error.flatten() });
  const { title, description, priority, due_date, project_id } = parsed.data;
  const { rows } = await db.query(
    \`INSERT INTO tasks (user_id, title, description, priority, due_date, project_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *\`,
    [(req as any).userId, title, description ?? null, priority, due_date ?? null, project_id ?? null],
  );
  res.status(201).json({ task: rows[0] });
});

app.patch("/api/tasks/:id/done", auth, async (req, res) => {
  const { rows } = await db.query(
    "UPDATE tasks SET completed = NOT completed WHERE id = $1 AND user_id = $2 RETURNING *",
    [req.params.id, (req as any).userId],
  );
  if (!rows[0]) return void res.status(404).json({ error: "Not found" });
  res.json({ task: rows[0] });
});

app.delete("/api/tasks/:id", auth, async (req, res) => {
  const { rowCount } = await db.query(
    "DELETE FROM tasks WHERE id = $1 AND user_id = $2",
    [req.params.id, (req as any).userId],
  );
  if (!rowCount) return void res.status(404).json({ error: "Not found" });
  res.status(204).end();
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[Server Error]", err.message);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(process.env.PORT ?? 3001, () => console.log("API ready"));
`,

  "Frontend Fix Agent": `// client/src/App.tsx — FIXED: error handling, loading states, delete confirmation
import { useState, useEffect } from "react";
import axios from "axios";

const api = axios.create({ baseURL: "/api" });
api.interceptors.request.use((c) => {
  const t = localStorage.getItem("token");
  if (t) c.headers.Authorization = \`Bearer \${t}\`;
  return c;
});

interface Task {
  id: number; title: string; description?: string;
  priority: "low" | "medium" | "high"; completed: boolean;
  due_date?: string; created_at: string;
}

const PRIORITY_COLOR = {
  low: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-red-100 text-red-800",
};

function LoginForm({ onLogin }: { onLogin: (token: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const { data } = await api.post("/auth/login", { email, password });
      localStorage.setItem("token", data.token);
      onLogin(data.token);
    } catch {
      setError("Invalid credentials");
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form onSubmit={submit} className="bg-white p-8 rounded-xl shadow-sm w-96 space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Task Manager</h1>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <input className="w-full border rounded-lg p-3" placeholder="Email"
          value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className="w-full border rounded-lg p-3" type="password" placeholder="Password"
          value={password} onChange={(e) => setPassword(e.target.value)} />
        <button disabled={loading}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </form>
    </div>
  );
}

// FIX REV-002: extracted TaskCard to own component
function TaskCard({ task, onToggle, onDelete }: {
  task: Task; onToggle: (id: number) => void; onDelete: (id: number) => void;
}) {
  // FIX QA-002: confirmation before delete
  function handleDelete() {
    if (!window.confirm(\`Delete "\${task.title}"?\`)) return;
    onDelete(task.id);
  }

  return (
    <div className={\`bg-white rounded-xl p-4 shadow-sm flex items-start gap-3 \${task.completed ? "opacity-60" : ""}\`}>
      <input type="checkbox" className="mt-1 h-4 w-4 rounded accent-blue-600"
        checked={task.completed} onChange={() => onToggle(task.id)} />
      <div className="flex-1">
        <p className={\`font-medium \${task.completed ? "line-through text-gray-400" : "text-gray-900"}\`}>
          {task.title}
        </p>
        {task.description && <p className="text-sm text-gray-500 mt-0.5">{task.description}</p>}
        <div className="flex gap-2 mt-2">
          <span className={\`text-xs px-2 py-0.5 rounded-full font-medium \${PRIORITY_COLOR[task.priority]}\`}>
            {task.priority}
          </span>
          {task.due_date && (
            <span className="text-xs text-gray-400">
              Due {new Date(task.due_date).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
      <button onClick={handleDelete}
        className="text-gray-300 hover:text-red-400 transition-colors text-lg leading-none">×</button>
    </div>
  );
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tasks, setTasks]     = useState<Task[]>([]);
  const [title, setTitle]     = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">("medium");
  const [filter, setFilter]   = useState<"all" | "active" | "done">("all");
  const [adding, setAdding]   = useState(false);
  const [error, setError]     = useState("");  // FIX QA-003

  useEffect(() => { loadTasks(); }, []);

  async function loadTasks() {
    try {
      const { data } = await api.get("/tasks");
      setTasks(data.tasks);
      setError("");
    } catch {
      setError("Failed to load tasks. Please refresh.");  // FIX QA-003
    }
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || adding) return;
    setAdding(true);  // FIX QA-004: prevent double submit
    try {
      await api.post("/tasks", { title: title.trim(), priority });
      setTitle("");
      loadTasks();
    } finally { setAdding(false); }
  }

  async function toggleTask(id: number) { await api.patch(\`/tasks/\${id}/done\`); loadTasks(); }
  async function deleteTask(id: number) { await api.delete(\`/tasks/\${id}\`); loadTasks(); }

  const filtered = tasks.filter((t) =>
    filter === "all" ? true : filter === "done" ? t.completed : !t.completed,
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">My Tasks</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-500">{tasks.filter(t=>t.completed).length}/{tasks.length} done</span>
          <button onClick={onLogout} className="text-sm text-gray-400 hover:text-gray-600">Logout</button>
        </div>
      </nav>
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {error && <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">{error}</div>}
        <form onSubmit={addTask} className="flex gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a task…" className="flex-1 border rounded-lg p-3 text-sm" />
          <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}
            className="border rounded-lg p-3 text-sm">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <button type="submit" disabled={adding}
            className="bg-blue-600 text-white px-4 py-3 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {adding ? "…" : "Add"}
          </button>
        </form>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          {(["all", "active", "done"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={\`px-4 py-1.5 rounded-md text-sm font-medium transition \${
                filter === f ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}\`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="space-y-2">
          {filtered.length === 0 && <p className="text-center text-gray-400 py-8">No tasks yet.</p>}
          {filtered.map((t) => (
            <TaskCard key={t.id} task={t} onToggle={toggleTask} onDelete={deleteTask} />
          ))}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("token"));
  function logout() { localStorage.removeItem("token"); setToken(null); }
  return token ? <Dashboard onLogout={logout} /> : <LoginForm onLogin={setToken} />;
}
`,
};

// Round 3: QA reports 0 issues (converged)
export const DEMO_RESPONSES_ROUND3: Partial<Record<DemoAgentId, string>> = {
  qa: `{
  "round": 3,
  "summary": "All previously identified issues have been resolved. Backend now uses safe parameterized queries with allowlist validation. Frontend has proper error handling and loading states. Code is production-ready.",
  "issues": [],
  "missingTests": [],
  "requirementsGaps": [],
  "totalIssues": 0
}`,
  security: `{
  "round": 3,
  "owaspStatus": {
    "A01_AccessControl": "pass",
    "A02_CryptoFailures": "pass",
    "A03_Injection": "pass",
    "A04_InsecureDesign": "pass",
    "A05_SecurityMisconfiguration": "pass",
    "A06_VulnerableComponents": "pass",
    "A07_AuthFailures": "pass",
    "A08_IntegrityFailures": "pass",
    "A09_LoggingFailures": "pass",
    "A10_SSRF": "pass"
  },
  "issues": [],
  "hardcodedSecrets": [],
  "totalIssues": 0
}`,
  review: `{
  "round": 3,
  "architectureScore": 92,
  "architectureSummary": "All issues from previous rounds resolved. Code is clean, secure, and maintainable. Ready for production deployment.",
  "issues": [],
  "positives": [
    "SQL injection risk eliminated with parameterized queries and allowlist validation",
    "helmet middleware adds all necessary security headers",
    "Auth failures now logged with IP for security monitoring",
    "Frontend has proper error handling and loading states",
    "Delete confirmation prevents accidental data loss"
  ],
  "totalIssues": 0
}`,
};

export function getDemoThinking(agentId: string): string {
  return THINKING[agentId] ?? "Analyzing requirements and generating output...";
}

export function getDemoResponse(agentId: DemoAgentId, round?: number): string {
  if (round && round >= 3) {
    const r3 = DEMO_RESPONSES_ROUND3[agentId];
    if (r3) return r3;
  }
  return DEMO_RESPONSES[agentId] ?? `[Demo] ${agentId} completed successfully.`;
}
