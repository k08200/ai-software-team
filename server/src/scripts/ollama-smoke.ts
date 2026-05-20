import { randomUUID } from "crypto";

process.env.LLM_PROVIDER ??= "ollama";
process.env.OLLAMA_BASE_URL ??= "http://127.0.0.1:11434";
process.env.OLLAMA_MODEL ??= "qwen2.5-coder:14b";
process.env.PIPELINE_PROFILE ??= "smoke";
process.env.SMOKE_MAX_TOKENS ??= "768";
process.env.DEMO_MODE ??= "false";
process.env.JWT_SECRET ??= "local-smoke";

async function main(): Promise<void> {
  const profile = process.env.PIPELINE_PROFILE ?? "smoke";
  const idea = process.argv.slice(2).join(" ").trim() || "간단한 메모 앱 만들어줘";
  const sessionId = `ollama-${profile}-${randomUUID()}`;
  const { PipelineOrchestrator } = await import("../pipeline/orchestrator.js");
  const orchestrator = new PipelineOrchestrator();

  console.log(`[ollama-smoke] provider=${process.env.LLM_PROVIDER}`);
  console.log(`[ollama-smoke] model=${process.env.OLLAMA_MODEL}`);
  console.log(`[ollama-smoke] profile=${profile}`);
  console.log(`[ollama-smoke] session=${sessionId}`);

  let outputChunks = 0;

  await orchestrator.run(idea, sessionId, undefined, (event) => {
    if (event.type === "agent_start") {
      outputChunks = 0;
      process.stdout.write(`[agent:start] ${event.data.agentName}`);
    } else if (event.type === "agent_output") {
      outputChunks++;
      if (outputChunks % 24 === 0) process.stdout.write(".");
    } else if (event.type === "agent_complete") {
      console.log(`\n[agent:complete] ${event.data.agentName} (${event.data.duration}ms)`);
    } else if (event.type === "round_complete" && event.data.skipped) {
      console.log(`[round:skipped] ${event.data.reason}`);
    } else if (event.type === "pipeline_complete") {
      console.log(`[pipeline:complete] ${event.data.zipPath}`);
    } else if (event.type === "pipeline_error") {
      console.error(`[pipeline:error] ${event.data.message}`);
    }
  });
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
