import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import {
  runPipeline,
  getHistory,
  getSessionDetails,
  getStatus,
  getDownloadUrl,
  getDashboardUrl,
  checkConnection,
  type SSEEvent,
  type SessionRecord,
} from "./api-client";

// ── Global state ──────────────────────────────────────────────────────────────

let outputChannel: vscode.OutputChannel;
let runsProvider: RunsTreeDataProvider;
let activeAbortController: AbortController | null = null;

// ── Extension entry point ─────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel("AI Software Team");
  context.subscriptions.push(outputChannel);

  // Tree view
  runsProvider = new RunsTreeDataProvider();
  const treeView = vscode.window.createTreeView("aiTeamRuns", {
    treeDataProvider: runsProvider,
    showCollapseAll: false,
  });
  context.subscriptions.push(treeView);

  // Register all commands
  context.subscriptions.push(
    vscode.commands.registerCommand("ai-team.runPipeline", () => cmdRunPipeline()),
    vscode.commands.registerCommand("ai-team.showHistory", () => cmdShowHistory()),
    vscode.commands.registerCommand("ai-team.openDashboard", () => cmdOpenDashboard()),
    vscode.commands.registerCommand("ai-team.configure", () => cmdConfigure()),
    vscode.commands.registerCommand("ai-team.cancelPipeline", () => cmdCancelPipeline()),
    vscode.commands.registerCommand("ai-team.showRunDetails", (item?: RunTreeItem) =>
      cmdShowRunDetails(item)
    ),
    vscode.commands.registerCommand("ai-team.refreshHistory", () => runsProvider.refresh())
  );

  // Check connection on startup
  checkConnectionOnStartup();
}

export function deactivate(): void {
  activeAbortController?.abort();
}

// ── Startup connection check ──────────────────────────────────────────────────

async function checkConnectionOnStartup(): Promise<void> {
  const connected = await checkConnection();
  if (connected) {
    outputChannel.appendLine("[AI Team] Connected to server.");
    runsProvider.refresh();
  } else {
    const apiUrl =
      vscode.workspace.getConfiguration("aiTeam").get<string>("apiUrl") ??
      "http://localhost:3001";
    outputChannel.appendLine(
      `[AI Team] WARNING: Cannot reach server at ${apiUrl}. Use "AI Team: Configure API Connection" to update the URL.`
    );
    const action = await vscode.window.showWarningMessage(
      `AI Software Team: Cannot connect to server at ${apiUrl}`,
      "Configure",
      "Dismiss"
    );
    if (action === "Configure") {
      await cmdConfigure();
    }
  }
}

// ── Command: Run Pipeline ─────────────────────────────────────────────────────

async function cmdRunPipeline(): Promise<void> {
  if (activeAbortController) {
    vscode.window.showWarningMessage(
      "A pipeline is already running. Use 'AI Team: Cancel Running Pipeline' to stop it first."
    );
    return;
  }

  const idea = await vscode.window.showInputBox({
    title: "AI Software Engineering Team",
    prompt: "Describe the software you want to build",
    placeHolder: "e.g. A REST API for a todo list with PostgreSQL and JWT authentication",
    validateInput: (value) => {
      if (!value || value.trim().length < 5) {
        return "Please enter at least 5 characters.";
      }
      if (value.length > 1000) {
        return "Project idea must be under 1000 characters.";
      }
      return null;
    },
  });

  if (!idea) {
    return; // User dismissed
  }

  const autoOpen =
    vscode.workspace.getConfiguration("aiTeam").get<boolean>("autoOpenOutput") ?? true;
  if (autoOpen) {
    outputChannel.show(true);
  }

  outputChannel.appendLine("");
  outputChannel.appendLine("═".repeat(70));
  outputChannel.appendLine(`AI Software Team — Pipeline Start`);
  outputChannel.appendLine(`Idea: ${idea.trim()}`);
  outputChannel.appendLine(`Started: ${new Date().toLocaleString()}`);
  outputChannel.appendLine("═".repeat(70));

  const abortController = new AbortController();
  activeAbortController = abortController;

  // Update tree view to show a "running" state
  runsProvider.setRunning(true);

  // Create a webview panel for rich output
  const panel = createRunWebviewPanel(idea.trim(), vscode.ViewColumn.Beside);

  let sessionId: string | undefined;
  let totalTokens = 0;
  let currentRound = 0;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "AI Team: Running pipeline...",
      cancellable: true,
    },
    async (progress, token) => {
      // Wire up VS Code's cancel button to our AbortController
      token.onCancellationRequested(() => {
        abortController.abort();
      });

      progress.report({ message: "Connecting to server..." });

      const result = await runPipeline(
        idea.trim(),
        (event: SSEEvent) => {
          handleSSEEvent(event, outputChannel, panel, progress);

          // Track session ID
          if (
            (event.type === "pipeline_start" || event.type === "pipeline_complete") &&
            typeof event.data["sessionId"] === "string"
          ) {
            sessionId = event.data["sessionId"] as string;
          }

          // Track tokens
          if (
            event.type === "token_update" &&
            typeof event.data["totalTokens"] === "number"
          ) {
            totalTokens = event.data["totalTokens"] as number;
          }

          // Track round
          if (
            event.type === "round_start" &&
            typeof event.data["round"] === "number"
          ) {
            currentRound = event.data["round"] as number;
            progress.report({ message: `Improvement round ${currentRound}...` });
          }
        },
        abortController.signal
      );

      activeAbortController = null;
      runsProvider.setRunning(false);
      runsProvider.refresh();

      if (result.cancelled) {
        outputChannel.appendLine("[AI Team] Pipeline cancelled by user.");
        panel.webview.postMessage({ type: "cancelled" });
        vscode.window.showInformationMessage("AI Team: Pipeline cancelled.");
        return;
      }

      if (!result.success) {
        const errMsg = result.error ?? "Unknown error";
        outputChannel.appendLine(`[AI Team] Pipeline failed: ${errMsg}`);
        panel.webview.postMessage({ type: "error", message: errMsg });
        vscode.window.showErrorMessage(`AI Team: Pipeline failed — ${errMsg}`);
        return;
      }

      outputChannel.appendLine("");
      outputChannel.appendLine("═".repeat(70));
      outputChannel.appendLine("Pipeline completed successfully!");
      outputChannel.appendLine(`Total tokens used: ${totalTokens.toLocaleString()}`);
      if (sessionId) {
        outputChannel.appendLine(
          `Download: ${getDownloadUrl(sessionId)}`
        );
      }
      outputChannel.appendLine("═".repeat(70));

      // Notify user with action buttons
      const actions: string[] = [];
      if (sessionId) {
        actions.push("Download ZIP");
      }
      actions.push("Open Dashboard");

      const choice = await vscode.window.showInformationMessage(
        `AI Team: Pipeline complete! ${totalTokens.toLocaleString()} tokens used.`,
        ...actions
      );

      if (choice === "Download ZIP" && sessionId) {
        await downloadZip(sessionId);
      } else if (choice === "Open Dashboard") {
        await cmdOpenDashboard();
      }
    }
  );
}

// ── Command: Show History ─────────────────────────────────────────────────────

async function cmdShowHistory(): Promise<void> {
  let sessions: SessionRecord[];
  try {
    sessions = await getHistory();
  } catch (err) {
    vscode.window.showErrorMessage(
      `AI Team: Failed to fetch history — ${err instanceof Error ? err.message : String(err)}`
    );
    return;
  }

  if (sessions.length === 0) {
    vscode.window.showInformationMessage("AI Team: No pipeline runs found yet.");
    return;
  }

  const statusIcon = (s: SessionRecord["status"]) => {
    if (s === "completed") return "$(pass)";
    if (s === "error") return "$(error)";
    return "$(sync~spin)";
  };

  const items: vscode.QuickPickItem[] = sessions.map((s) => ({
    label: `${statusIcon(s.status)} ${s.projectIdea.slice(0, 60)}${s.projectIdea.length > 60 ? "…" : ""}`,
    description: s.sessionId.slice(0, 8),
    detail: `${s.status.toUpperCase()} · ${new Date(s.startedAt).toLocaleString()} · ${s.totalTokens.toLocaleString()} tokens · ${s.roundCount} rounds`,
    // Store session ID for lookup
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: "AI Team — Recent Pipeline Runs",
    placeHolder: "Select a run to view details",
    matchOnDescription: true,
    matchOnDetail: true,
  });

  if (!picked) {
    return;
  }

  // Find matching session by matching description prefix
  const matchedSession = sessions.find(
    (s) => picked.description && s.sessionId.startsWith(picked.description)
  );

  if (matchedSession) {
    showSessionWebview(matchedSession);
  }
}

// ── Command: Open Dashboard ───────────────────────────────────────────────────

async function cmdOpenDashboard(): Promise<void> {
  const dashboardUrl = getDashboardUrl();
  const uri = vscode.Uri.parse(dashboardUrl);
  await vscode.env.openExternal(uri);
}

// ── Command: Configure ────────────────────────────────────────────────────────

async function cmdConfigure(): Promise<void> {
  const config = vscode.workspace.getConfiguration("aiTeam");
  const currentUrl = config.get<string>("apiUrl") ?? "http://localhost:3001";
  const currentKey = config.get<string>("apiKey") ?? "";

  const newUrl = await vscode.window.showInputBox({
    title: "AI Team: Configure API URL",
    prompt: "Enter the base URL of your AI Software Team server",
    value: currentUrl,
    placeHolder: "http://localhost:3001",
    validateInput: (v) => {
      if (!v || !v.startsWith("http")) {
        return "URL must start with http:// or https://";
      }
      return null;
    },
  });

  if (newUrl === undefined) {
    return; // Cancelled
  }

  const newKey = await vscode.window.showInputBox({
    title: "AI Team: Configure API Key (optional)",
    prompt: "Enter your API key for the server, or leave blank if not required",
    value: currentKey,
    password: true,
    placeHolder: "Leave blank if no authentication is required",
  });

  if (newKey === undefined) {
    return; // Cancelled
  }

  await config.update("apiUrl", newUrl.replace(/\/$/, ""), vscode.ConfigurationTarget.Global);
  await config.update("apiKey", newKey, vscode.ConfigurationTarget.Global);

  // Test the connection with the new settings
  const connected = await checkConnection();
  if (connected) {
    vscode.window.showInformationMessage(
      `AI Team: Connected to server at ${newUrl}. Configuration saved.`
    );
    runsProvider.refresh();
  } else {
    vscode.window.showWarningMessage(
      `AI Team: Configuration saved, but could not reach ${newUrl}. Make sure the server is running.`
    );
  }
}

// ── Command: Cancel Pipeline ──────────────────────────────────────────────────

function cmdCancelPipeline(): void {
  if (!activeAbortController) {
    vscode.window.showInformationMessage("AI Team: No pipeline is currently running.");
    return;
  }
  activeAbortController.abort();
  activeAbortController = null;
}

// ── Command: Show Run Details ─────────────────────────────────────────────────

async function cmdShowRunDetails(item?: RunTreeItem): Promise<void> {
  if (!item?.sessionId) {
    // No item provided — show quick pick
    await cmdShowHistory();
    return;
  }

  try {
    const session = await getSessionDetails(item.sessionId);
    showSessionWebview(session);
  } catch (err) {
    vscode.window.showErrorMessage(
      `AI Team: Could not fetch run details — ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// ── SSE event handler ─────────────────────────────────────────────────────────

function handleSSEEvent(
  event: SSEEvent,
  channel: vscode.OutputChannel,
  panel: vscode.WebviewPanel,
  progress: vscode.Progress<{ message?: string; increment?: number }>
): void {
  switch (event.type) {
    case "pipeline_start": {
      const model = event.data["model"] as string | undefined;
      const maxRounds = event.data["maxRounds"] as number | undefined;
      channel.appendLine(
        `[AI Team] Pipeline started — model: ${model ?? "unknown"}, max rounds: ${maxRounds ?? "?"}`
      );
      panel.webview.postMessage({ type: "pipeline_start", data: event.data });
      progress.report({ message: "Pipeline started..." });
      break;
    }

    case "agent_start": {
      const agentName = event.data["agentName"] as string | undefined;
      channel.appendLine(`\n── ${agentName ?? "Agent"} ──`);
      panel.webview.postMessage({ type: "agent_start", data: event.data });
      progress.report({ message: `${agentName ?? "Agent"} working...` });
      break;
    }

    case "agent_thinking": {
      const agentName = event.data["agentName"] as string | undefined;
      const thinking = event.data["thinking"] as string | undefined;
      if (thinking) {
        channel.appendLine(`[${agentName ?? "Agent"} thinking] ${thinking.slice(0, 200)}...`);
      }
      panel.webview.postMessage({ type: "agent_thinking", data: event.data });
      break;
    }

    case "agent_output": {
      const agentName = event.data["agentName"] as string | undefined;
      const content = event.data["content"] as string | undefined;
      if (content) {
        channel.appendLine(`[${agentName ?? "Agent"}]\n${content}`);
      }
      panel.webview.postMessage({ type: "agent_output", data: event.data });
      break;
    }

    case "agent_complete": {
      const agentName = event.data["agentName"] as string | undefined;
      const tokens = event.data["tokensUsed"] as number | undefined;
      const duration = event.data["duration"] as number | undefined;
      channel.appendLine(
        `[${agentName ?? "Agent"} done] ${tokens?.toLocaleString() ?? "?"} tokens, ${duration ? (duration / 1000).toFixed(1) + "s" : "?"}`
      );
      panel.webview.postMessage({ type: "agent_complete", data: event.data });
      break;
    }

    case "agent_error": {
      const agentName = event.data["agentName"] as string | undefined;
      const message = event.data["message"] as string | undefined;
      channel.appendLine(`[${agentName ?? "Agent"} ERROR] ${message ?? "Unknown error"}`);
      panel.webview.postMessage({ type: "agent_error", data: event.data });
      break;
    }

    case "round_start": {
      const round = event.data["round"] as number | undefined;
      const total = event.data["total"] as number | undefined;
      channel.appendLine(`\n${"─".repeat(50)}`);
      channel.appendLine(`Improvement Round ${round ?? "?"} / ${total ?? "?"}`);
      channel.appendLine(`${"─".repeat(50)}`);
      panel.webview.postMessage({ type: "round_start", data: event.data });
      break;
    }

    case "round_complete": {
      const round = event.data["round"] as number | undefined;
      const issues = event.data["totalIssues"] as number | undefined;
      channel.appendLine(
        `Round ${round ?? "?"} complete — ${issues ?? 0} issues found`
      );
      panel.webview.postMessage({ type: "round_complete", data: event.data });
      break;
    }

    case "issues_update": {
      const qa = event.data["qa"] as string[] | undefined;
      const security = event.data["security"] as string[] | undefined;
      const review = event.data["review"] as string[] | undefined;
      const total = ((qa?.length ?? 0) + (security?.length ?? 0) + (review?.length ?? 0));
      if (total > 0) {
        channel.appendLine(`Issues — QA: ${qa?.length ?? 0}, Security: ${security?.length ?? 0}, Review: ${review?.length ?? 0}`);
      }
      panel.webview.postMessage({ type: "issues_update", data: event.data });
      break;
    }

    case "token_update": {
      const total = event.data["totalTokens"] as number | undefined;
      channel.appendLine(`[Tokens] Total: ${total?.toLocaleString() ?? "?"}`);
      panel.webview.postMessage({ type: "token_update", data: event.data });
      break;
    }

    case "file_saved": {
      const fileName = event.data["fileName"] as string | undefined;
      channel.appendLine(`[Saved] ${fileName ?? "file"}`);
      panel.webview.postMessage({ type: "file_saved", data: event.data });
      break;
    }

    case "pipeline_complete": {
      const sessionId = event.data["sessionId"] as string | undefined;
      const totalTokens = event.data["totalTokens"] as number | undefined;
      const durationMs = event.data["durationMs"] as number | undefined;
      channel.appendLine(`\nPipeline complete!`);
      if (sessionId) {
        channel.appendLine(`Session: ${sessionId}`);
      }
      channel.appendLine(`Tokens: ${totalTokens?.toLocaleString() ?? "?"}`);
      if (durationMs) {
        channel.appendLine(`Duration: ${(durationMs / 1000).toFixed(1)}s`);
      }
      panel.webview.postMessage({ type: "pipeline_complete", data: event.data });
      break;
    }

    case "pipeline_error": {
      const message = event.data["message"] as string | undefined;
      channel.appendLine(`[Pipeline ERROR] ${message ?? "Unknown error"}`);
      panel.webview.postMessage({ type: "pipeline_error", data: event.data });
      break;
    }

    default:
      break;
  }
}

// ── Download ZIP helper ───────────────────────────────────────────────────────

async function downloadZip(sessionId: string): Promise<void> {
  const downloadUrl = getDownloadUrl(sessionId);

  // Check if user has a configured download path
  const configuredPath = vscode.workspace
    .getConfiguration("aiTeam")
    .get<string>("downloadPath");

  let savePath: vscode.Uri | undefined;

  if (configuredPath && fs.existsSync(configuredPath)) {
    savePath = vscode.Uri.file(
      path.join(configuredPath, `ai-project-${sessionId.slice(0, 8)}.zip`)
    );
  } else {
    savePath = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(`ai-project-${sessionId.slice(0, 8)}.zip`),
      filters: { "ZIP Archive": ["zip"] },
      title: "Save Generated Project",
    });
  }

  if (!savePath) {
    return; // User cancelled
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "AI Team: Downloading project ZIP...",
      cancellable: false,
    },
    async () => {
      try {
        const response = await fetch(downloadUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const buffer = await response.arrayBuffer();
        fs.writeFileSync(savePath!.fsPath, Buffer.from(buffer));
        vscode.window.showInformationMessage(
          `AI Team: Project saved to ${savePath!.fsPath}`,
          "Open Folder"
        ).then((action) => {
          if (action === "Open Folder") {
            vscode.commands.executeCommand(
              "revealFileInOS",
              savePath!
            );
          }
        });
      } catch (err) {
        vscode.window.showErrorMessage(
          `AI Team: Download failed — ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  );
}

// ── Webview: Run Output Panel ─────────────────────────────────────────────────

function createRunWebviewPanel(idea: string, column: vscode.ViewColumn): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    "aiTeamRunOutput",
    `AI Team: ${idea.slice(0, 40)}${idea.length > 40 ? "…" : ""}`,
    column,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  panel.webview.html = getRunWebviewHtml(idea);

  return panel;
}

function getRunWebviewHtml(idea: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI Software Team</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0d1117;
      --surface: #161b22;
      --border: #30363d;
      --text: #c9d1d9;
      --muted: #8b949e;
      --accent: #58a6ff;
      --success: #3fb950;
      --warning: #d29922;
      --error: #f85149;
      --purple: #bc8cff;
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      font-size: 13px;
      line-height: 1.6;
      padding: 16px;
      min-height: 100vh;
    }

    header {
      padding: 12px 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 16px;
    }

    header h1 {
      font-size: 15px;
      font-weight: 600;
      color: var(--accent);
      margin-bottom: 4px;
    }

    header .idea {
      color: var(--muted);
      font-size: 12px;
    }

    #stats {
      display: flex;
      gap: 16px;
      padding: 8px 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }

    .stat {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .stat-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
    }

    .stat-value {
      font-size: 16px;
      font-weight: 700;
      color: var(--text);
    }

    #status-bar {
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      margin-bottom: 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--muted);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    #status-bar.running { border-color: var(--accent); color: var(--accent); }
    #status-bar.completed { border-color: var(--success); color: var(--success); }
    #status-bar.error { border-color: var(--error); color: var(--error); }
    #status-bar.cancelled { border-color: var(--warning); color: var(--warning); }

    .spinner {
      width: 10px;
      height: 10px;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      display: inline-block;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    #rounds {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }

    .round-badge {
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--muted);
    }

    .round-badge.active { background: #1c2d3f; border-color: var(--accent); color: var(--accent); }
    .round-badge.done { background: #122820; border-color: var(--success); color: var(--success); }

    #output {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .agent-card {
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
      background: var(--surface);
    }

    .agent-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 14px;
      background: #1c2128;
      border-bottom: 1px solid var(--border);
      cursor: pointer;
      user-select: none;
    }

    .agent-name {
      font-weight: 700;
      font-size: 13px;
      color: var(--text);
    }

    .agent-status {
      font-size: 11px;
      font-weight: 600;
      color: var(--muted);
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .agent-status.thinking { color: var(--purple); }
    .agent-status.running { color: var(--accent); }
    .agent-status.completed { color: var(--success); }
    .agent-status.error { color: var(--error); }

    .agent-body {
      padding: 12px 14px;
      max-height: 300px;
      overflow-y: auto;
    }

    .agent-body.collapsed { display: none; }

    .agent-content {
      font-family: "JetBrains Mono", "Fira Code", "Courier New", monospace;
      font-size: 12px;
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--text);
    }

    .agent-meta {
      margin-top: 8px;
      font-size: 11px;
      color: var(--muted);
      display: flex;
      gap: 12px;
    }

    .download-btn {
      display: inline-block;
      margin-top: 16px;
      padding: 8px 18px;
      background: var(--accent);
      color: #0d1117;
      font-weight: 700;
      font-size: 13px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      text-decoration: none;
    }

    .download-btn:hover { opacity: 0.85; }

    #issues-summary {
      padding: 10px 14px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 12px;
      font-size: 12px;
      display: none;
    }

    #issues-summary h3 { margin-bottom: 6px; color: var(--warning); }

    #issues-summary ul {
      padding-left: 16px;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <header>
    <h1>AI Software Engineering Team</h1>
    <div class="idea" id="idea-text">${escapeHtml(idea)}</div>
  </header>

  <div id="stats">
    <div class="stat">
      <span class="stat-label">Tokens</span>
      <span class="stat-value" id="stat-tokens">0</span>
    </div>
    <div class="stat">
      <span class="stat-label">Round</span>
      <span class="stat-value" id="stat-round">—</span>
    </div>
    <div class="stat">
      <span class="stat-label">Issues</span>
      <span class="stat-value" id="stat-issues">0</span>
    </div>
    <div class="stat">
      <span class="stat-label">Status</span>
      <span class="stat-value" id="stat-status">Starting</span>
    </div>
  </div>

  <div id="status-bar" class="running">
    <span class="spinner"></span>
    <span id="status-text">Connecting to server...</span>
  </div>

  <div id="rounds"></div>

  <div id="issues-summary">
    <h3>Issues Found</h3>
    <ul id="issues-list"></ul>
  </div>

  <div id="output"></div>

  <script>
    const vscode = acquireVsCodeApi();
    const agents = {};
    let totalTokens = 0;
    let maxRounds = 3;
    let currentRound = 0;
    let totalIssues = 0;

    function escapeHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function setStatus(text, cls) {
      const bar = document.getElementById('status-bar');
      bar.className = cls;
      const spinner = cls === 'running'
        ? '<span class="spinner"></span>'
        : cls === 'completed' ? '✓'
        : cls === 'error' ? '✗'
        : '⊘';
      document.getElementById('status-text').innerHTML = spinner + ' ' + escapeHtml(text);
      document.getElementById('stat-status').textContent =
        cls.charAt(0).toUpperCase() + cls.slice(1);
    }

    function getOrCreateAgentCard(agentId, agentName) {
      if (agents[agentId]) return agents[agentId];

      const card = document.createElement('div');
      card.className = 'agent-card';
      card.id = 'agent-' + agentId;

      const header = document.createElement('div');
      header.className = 'agent-header';
      header.innerHTML =
        '<span class="agent-name">' + escapeHtml(agentName) + '</span>' +
        '<span class="agent-status running" id="status-' + agentId + '">' +
        '<span class="spinner"></span> Working</span>';

      const body = document.createElement('div');
      body.className = 'agent-body';
      body.id = 'body-' + agentId;

      const content = document.createElement('div');
      content.className = 'agent-content';
      content.id = 'content-' + agentId;

      const meta = document.createElement('div');
      meta.className = 'agent-meta';
      meta.id = 'meta-' + agentId;

      body.appendChild(content);
      body.appendChild(meta);
      card.appendChild(header);
      card.appendChild(body);

      header.addEventListener('click', () => {
        body.classList.toggle('collapsed');
      });

      document.getElementById('output').appendChild(card);
      agents[agentId] = { card, body, content, meta };
      return agents[agentId];
    }

    window.addEventListener('message', (event) => {
      const msg = event.data;

      switch (msg.type) {
        case 'pipeline_start': {
          maxRounds = msg.data.maxRounds || 3;
          setStatus('Pipeline running...', 'running');
          // Build round badges
          const roundsEl = document.getElementById('rounds');
          roundsEl.innerHTML = '';
          for (let i = 1; i <= maxRounds; i++) {
            const badge = document.createElement('div');
            badge.className = 'round-badge';
            badge.id = 'round-badge-' + i;
            badge.textContent = 'Round ' + i;
            roundsEl.appendChild(badge);
          }
          break;
        }

        case 'agent_start': {
          const { agentId, agentName } = msg.data;
          getOrCreateAgentCard(agentId, agentName);
          setStatus(agentName + ' is working...', 'running');
          const statusEl = document.getElementById('status-' + agentId);
          if (statusEl) {
            statusEl.className = 'agent-status running';
            statusEl.innerHTML = '<span class="spinner"></span> Working';
          }
          break;
        }

        case 'agent_thinking': {
          const { agentId, agentName } = msg.data;
          const statusEl = document.getElementById('status-' + agentId);
          if (statusEl) {
            statusEl.className = 'agent-status thinking';
            statusEl.innerHTML = '<span class="spinner"></span> Thinking';
          }
          break;
        }

        case 'agent_output': {
          const { agentId, agentName, content } = msg.data;
          const agent = getOrCreateAgentCard(agentId, agentName);
          if (agent && content) {
            agent.content.textContent = content.slice(0, 3000) +
              (content.length > 3000 ? '\\n... (truncated)' : '');
          }
          break;
        }

        case 'agent_complete': {
          const { agentId, tokensUsed, duration } = msg.data;
          const statusEl = document.getElementById('status-' + agentId);
          if (statusEl) {
            statusEl.className = 'agent-status completed';
            statusEl.textContent = '✓ Done';
          }
          const metaEl = document.getElementById('meta-' + agentId);
          if (metaEl && tokensUsed) {
            metaEl.textContent =
              (tokensUsed || 0).toLocaleString() + ' tokens' +
              (duration ? ' · ' + (duration / 1000).toFixed(1) + 's' : '');
          }
          // Collapse after completion
          const body = document.getElementById('body-' + agentId);
          if (body) body.classList.add('collapsed');
          break;
        }

        case 'agent_error': {
          const { agentId } = msg.data;
          const statusEl = document.getElementById('status-' + agentId);
          if (statusEl) {
            statusEl.className = 'agent-status error';
            statusEl.textContent = '✗ Error';
          }
          break;
        }

        case 'round_start': {
          const { round, total } = msg.data;
          currentRound = round;
          document.getElementById('stat-round').textContent = round + ' / ' + (total || maxRounds);
          const badge = document.getElementById('round-badge-' + round);
          if (badge) badge.className = 'round-badge active';
          // Clear previous agent cards for clean round display
          document.getElementById('output').innerHTML = '';
          Object.keys(agents).forEach((k) => delete agents[k]);
          break;
        }

        case 'round_complete': {
          const { round, totalIssues: issues } = msg.data;
          totalIssues = issues || 0;
          document.getElementById('stat-issues').textContent = totalIssues;
          const badge = document.getElementById('round-badge-' + round);
          if (badge) badge.className = 'round-badge done';
          break;
        }

        case 'issues_update': {
          const { qa, security, review } = msg.data;
          const all = [...(qa || []), ...(security || []), ...(review || [])];
          totalIssues = all.length;
          document.getElementById('stat-issues').textContent = totalIssues;
          if (all.length > 0) {
            const summary = document.getElementById('issues-summary');
            summary.style.display = 'block';
            const list = document.getElementById('issues-list');
            list.innerHTML = all.slice(0, 10).map((i) =>
              '<li>' + escapeHtml(i) + '</li>'
            ).join('') + (all.length > 10 ? '<li>... and ' + (all.length - 10) + ' more</li>' : '');
          }
          break;
        }

        case 'token_update': {
          const { totalTokens: t } = msg.data;
          if (typeof t === 'number') {
            totalTokens = t;
            document.getElementById('stat-tokens').textContent = totalTokens.toLocaleString();
          }
          break;
        }

        case 'file_saved': {
          // No-op in webview, handled in output channel
          break;
        }

        case 'pipeline_complete': {
          const { sessionId, totalTokens: t, durationMs } = msg.data;
          if (typeof t === 'number') {
            totalTokens = t;
            document.getElementById('stat-tokens').textContent = totalTokens.toLocaleString();
          }
          document.getElementById('stat-round').textContent = currentRound + ' / ' + maxRounds;
          setStatus('Pipeline completed successfully!', 'completed');

          if (sessionId) {
            const btn = document.createElement('a');
            btn.className = 'download-btn';
            btn.textContent = 'Download Generated Project (ZIP)';
            btn.href = '#';
            btn.addEventListener('click', (e) => {
              e.preventDefault();
              vscode.postMessage({ command: 'downloadZip', sessionId });
            });
            document.getElementById('output').appendChild(btn);
          }
          break;
        }

        case 'pipeline_error': {
          const { message } = msg.data;
          setStatus('Error: ' + (message || 'Unknown error'), 'error');
          break;
        }

        case 'cancelled': {
          setStatus('Pipeline cancelled', 'cancelled');
          break;
        }

        case 'error': {
          setStatus('Error: ' + (msg.message || 'Unknown error'), 'error');
          break;
        }
      }
    });
  <\/script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Webview: Session Details ──────────────────────────────────────────────────

function showSessionWebview(session: SessionRecord): void {
  const panel = vscode.window.createWebviewPanel(
    "aiTeamSessionDetail",
    `Run: ${session.sessionId.slice(0, 8)} — ${session.projectIdea.slice(0, 40)}`,
    vscode.ViewColumn.One,
    { enableScripts: false }
  );

  const statusColor =
    session.status === "completed"
      ? "#3fb950"
      : session.status === "error"
      ? "#f85149"
      : "#58a6ff";

  const duration = session.durationMs
    ? `${(session.durationMs / 1000).toFixed(1)}s`
    : "N/A";

  panel.webview.html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <style>
    body {
      background: #0d1117;
      color: #c9d1d9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      padding: 24px;
      line-height: 1.7;
    }
    h1 { color: #58a6ff; font-size: 18px; margin-bottom: 8px; }
    .label { color: #8b949e; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
    .value { font-size: 15px; font-weight: 600; margin-bottom: 16px; }
    .status { color: ${statusColor}; }
    .idea { font-style: italic; color: #c9d1d9; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
    .mono { font-family: monospace; font-size: 12px; color: #8b949e; }
  </style>
</head>
<body>
  <h1>Pipeline Run Details</h1>
  <div class="grid">
    <div>
      <div class="label">Session ID</div>
      <div class="value mono">${escapeHtml(session.sessionId)}</div>
    </div>
    <div>
      <div class="label">Status</div>
      <div class="value status">${escapeHtml(session.status.toUpperCase())}</div>
    </div>
    <div>
      <div class="label">Project Idea</div>
      <div class="value idea">${escapeHtml(session.projectIdea)}</div>
    </div>
    <div>
      <div class="label">Tokens Used</div>
      <div class="value">${session.totalTokens.toLocaleString()}</div>
    </div>
    <div>
      <div class="label">Improvement Rounds</div>
      <div class="value">${session.roundCount}</div>
    </div>
    <div>
      <div class="label">Final Issues</div>
      <div class="value">${session.finalIssues}</div>
    </div>
    <div>
      <div class="label">Duration</div>
      <div class="value">${escapeHtml(duration)}</div>
    </div>
    <div>
      <div class="label">Started At</div>
      <div class="value">${escapeHtml(new Date(session.startedAt).toLocaleString())}</div>
    </div>
    ${session.completedAt
      ? `<div>
      <div class="label">Completed At</div>
      <div class="value">${escapeHtml(new Date(session.completedAt).toLocaleString())}</div>
    </div>`
      : ""
    }
  </div>
</body>
</html>`;
}

// ── Tree Data Provider ────────────────────────────────────────────────────────

class RunsTreeDataProvider implements vscode.TreeDataProvider<RunTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<RunTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private sessions: SessionRecord[] = [];
  private loading = false;
  private running = false;

  refresh(): void {
    this.loadSessions();
  }

  setRunning(running: boolean): void {
    this.running = running;
    this._onDidChangeTreeData.fire();
  }

  private async loadSessions(): Promise<void> {
    this.loading = true;
    this._onDidChangeTreeData.fire();

    try {
      this.sessions = await getHistory();
    } catch {
      this.sessions = [];
    }

    this.loading = false;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: RunTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: RunTreeItem): RunTreeItem[] {
    if (element) {
      return [];
    }

    if (this.loading) {
      const loadingItem = new RunTreeItem("Loading...", "", "running");
      loadingItem.description = "";
      return [loadingItem];
    }

    if (this.running) {
      const runningItem = new RunTreeItem("Pipeline running...", "", "running");
      runningItem.description = "";
      return [runningItem, ...this.sessions.map((s) => new RunTreeItem(s.projectIdea, s.sessionId, s.status))];
    }

    if (this.sessions.length === 0) {
      const emptyItem = new vscode.TreeItem("No runs yet. Click ▷ to start.", vscode.TreeItemCollapsibleState.None) as RunTreeItem;
      return [emptyItem as RunTreeItem];
    }

    return this.sessions.map((s) => new RunTreeItem(s.projectIdea, s.sessionId, s.status));
  }
}

class RunTreeItem extends vscode.TreeItem {
  sessionId: string;

  constructor(
    label: string,
    sessionId: string,
    status: "running" | "completed" | "error" | string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.sessionId = sessionId;

    const iconMap: Record<string, vscode.ThemeIcon> = {
      completed: new vscode.ThemeIcon("pass", new vscode.ThemeColor("testing.iconPassed")),
      error: new vscode.ThemeIcon("error", new vscode.ThemeColor("testing.iconFailed")),
      running: new vscode.ThemeIcon("sync~spin"),
    };

    this.iconPath = iconMap[status] ?? new vscode.ThemeIcon("circle-outline");
    this.description = sessionId ? sessionId.slice(0, 8) : undefined;
    this.contextValue = "run";

    if (sessionId) {
      this.tooltip = `Session: ${sessionId}\nStatus: ${status}`;
      this.command = {
        command: "ai-team.showRunDetails",
        title: "Show Run Details",
        arguments: [this],
      };
    }
  }
}
