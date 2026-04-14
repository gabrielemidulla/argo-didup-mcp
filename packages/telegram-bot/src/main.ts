/**
 * Telegram bot (polling): LangChain ReAct + OpenRouter + MCP HTTP (Argo).
 * Start MCP first: `bun run --cwd packages/argo-mcp serve` (local: no AUTH_TOKEN).
 * Then: `bun run telegram` or `bun run --cwd packages/telegram-bot start`.
 */
import { Bot } from "grammy";
import { run } from "@grammyjs/runner";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { ChatOpenRouter } from "@langchain/openrouter";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import type { BaseMessage } from "@langchain/core/messages";
import type { DynamicStructuredTool } from "@langchain/core/tools";
import userMemoryTools from "./user-memory-tools.ts";
import {
  closeMysqlPool,
  getDb,
  initMysqlPool,
  mysqlConfigFromEnv,
} from "./automations/db.ts";
import { createAutomationTools } from "./automations/agent-tools.ts";
import { AutomationScheduler } from "./automations/scheduler.ts";
import { AutomationRepository } from "./automations/repository.ts";
import { createRunScheduledAutomation } from "./automations/run-scheduled.ts";
import { loadBotEnv } from "./config/env.ts";
import logger from "./logging.ts";
import { USER_MESSAGE_TIMEZONE } from "./agent/message-context.ts";
import {
  automationInstructionsBlock,
  buildReactAgentSystemPrompt,
} from "./agent/react-prompt.ts";
import {
  createInvokeAgentWithUserMemory,
  lastAiText,
} from "./agent/invoke-user-memory.ts";
import { registerTelegramHandlers } from "./bot/handlers.ts";
import { createLeggiCircolarePdfTool } from "./tools/leggi-circolare-pdf.ts";
import {
  sanitizeDynamicToolForGemini,
  wrapToolsWithTelegramProgress,
} from "./tools/langchain-wrap.ts";

const env = loadBotEnv();
const {
  telegramToken: token,
  allowedChatId,
  openrouterApiKey,
  aiModelName,
  mcpUrl,
  port,
} = env;

const openRouterAttribution = {
  siteUrl: "https://github.com/gabrielemidulla/argo-didup-mcp",
  siteName: "argo-didup-mcp",
} as const;

logger.log("bootstrap", {
  mcpUrl,
  port,
  allowedChatId,
  aiModelName,
  telegramTokenPresent: Boolean(token && token.length > 0),
  openrouterApiKeyPresent: Boolean(
    openrouterApiKey && openrouterApiKey.length > 0,
  ),
});

const mysqlCfg = mysqlConfigFromEnv();
let automationRepo: AutomationRepository | null = null;
if (mysqlCfg) {
  try {
    await initMysqlPool(mysqlCfg);
    automationRepo = new AutomationRepository(getDb());
    logger.log("mysql:ready", {
      host: mysqlCfg.host,
      port: mysqlCfg.port,
      database: mysqlCfg.database,
    });
  } catch (e) {
    logger.error("mysql:init-failed", e instanceof Error ? e.message : e);
    throw e;
  }
} else {
  logger.warn(
    "mysql:skipped",
    "Variabili MYSQL_HOST, MYSQL_DATABASE, MYSQL_USER mancanti: automazioni disabilitate",
  );
}

const schedulerRef: { current: AutomationScheduler | null } = { current: null };
const automationTools = automationRepo
  ? createAutomationTools(
      automationRepo,
      USER_MESSAGE_TIMEZONE,
      async () => {
        await schedulerRef.current?.reload();
      },
    )
  : [];

const userMemoryToolList = userMemoryTools.createTools();

const mcpClient = new MultiServerMCPClient({
  argo: {
    transport: "http",
    url: mcpUrl,
    headers: {},
  },
});

const llm = new ChatOpenRouter(aiModelName, {
  apiKey: openrouterApiKey,
  ...openRouterAttribution,
});

const automationTitleLlm = new ChatOpenRouter(aiModelName, {
  apiKey: openrouterApiKey,
  maxTokens: 512,
  temperature: 0.25,
  ...openRouterAttribution,
});

const leggiCircolarePdfTool = createLeggiCircolarePdfTool(llm);
logger.log("mcp:getTools…");
const mcpTools = (await mcpClient.getTools()) as DynamicStructuredTool[];
logger.log("mcp:getTools:ok", {
  mcpToolCount: mcpTools.length,
  names: mcpTools.map((t) => t.name),
});
const tools = wrapToolsWithTelegramProgress(
  [
    ...mcpTools,
    leggiCircolarePdfTool,
    ...automationTools,
    ...userMemoryToolList,
  ].map(sanitizeDynamicToolForGemini),
);
logger.log("agent:tools:ready", {
  totalTools: tools.length,
  automationToolCount: automationTools.length,
  userMemoryToolCount: userMemoryToolList.length,
  names: tools.map((t) => t.name),
});

const allowedInlineToolNames = new Set(tools.map((t) => t.name));

const automationInstructions = automationRepo
  ? automationInstructionsBlock()
  : "";

const agent = createReactAgent({
  llm,
  tools,
  prompt: buildReactAgentSystemPrompt(automationInstructions),
});

logger.log("agent:createReactAgent:ok", { model: aiModelName });

const invokeAgentWithUserMemory = createInvokeAgentWithUserMemory(agent);

const history = new Map<number, BaseMessage[]>();

const bot = new Bot(token);

const runScheduledAutomation = createRunScheduledAutomation({
  bot,
  allowedChatId,
  automationTitleLlm,
  invokeAgentWithUserMemory,
  lastAiText,
});

if (automationRepo) {
  schedulerRef.current = new AutomationScheduler(
    USER_MESSAGE_TIMEZONE,
    automationRepo,
    async (row) => {
      await runScheduledAutomation(row);
    },
  );
  await schedulerRef.current.start();
  logger.log("automation-scheduler:started");
}

registerTelegramHandlers({
  bot,
  allowedChatId,
  allowedInlineToolNames,
  tools,
  history,
  invokeAgentWithUserMemory,
  lastAiText,
});

const webhook = await bot.api.getWebhookInfo();
logger.log("telegram:webhook:info", {
  url: webhook.url || "(nessuno)",
  pendingUpdateCount: webhook.pending_update_count,
});
if (webhook.url) {
  logger.log("telegram:webhook:deleting");
}
await bot.api.deleteWebhook({ drop_pending_updates: false });
logger.log("telegram:webhook:deleted");

let shuttingDown = false;
const runnerHandle = run(bot);

async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.log("shutdown:start", { signal });
  schedulerRef.current?.stop();
  schedulerRef.current = null;
  logger.log("shutdown:automation-scheduler-stopped");
  await mcpClient.close().catch((e) =>
    logger.error("shutdown:mcp-close", e),
  );
  logger.log("shutdown:mcp-closed");
  await closeMysqlPool().catch((e) =>
    logger.error("shutdown:mysql-close", e),
  );
  logger.log("shutdown:mysql-closed");
  await runnerHandle.stop();
  logger.log("shutdown:runner-stopped");
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

logger.log("runner:started", {
  allowedChatId,
  mcpUrl,
  note: "In ascolto aggiornamenti Telegram (grammY runner)",
});

const untilStopped = runnerHandle.task();
if (untilStopped) await untilStopped;
