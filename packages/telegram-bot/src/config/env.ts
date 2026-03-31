import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const serverEnv = createEnv({
  server: {
    TELEGRAM_BOT_TOKEN: z.string().min(1),
    TELEGRAM_CHAT_ID: z
      .string()
      .min(1)
      .transform((raw) => {
        const n = Number(raw.trim());
        if (!Number.isFinite(n)) {
          throw new Error(
            "TELEGRAM_CHAT_ID deve essere un numero (es. il tuo user id Telegram)",
          );
        }
        return n;
      }),
    GOOGLE_API_KEY: z.string().min(1),
    PORT: z.string().optional().default("3000"),
    MCP_URL: z.string().min(1).optional(),
    MYSQL_HOST: z.string().optional(),
    MYSQL_PORT: z.string().optional(),
    MYSQL_USER: z.string().optional(),
    MYSQL_PASSWORD: z.string().optional(),
    MYSQL_DATABASE: z.string().optional(),
    TELEGRAM_MEMORY_PATH: z.string().optional(),
  },
  runtimeEnv: Bun.env,
  emptyStringAsUndefined: true,
});

export type BotEnv = {
  telegramToken: string;
  allowedChatId: number;
  googleApiKey: string;
  port: string;
  mcpUrl: string;
};

export function loadBotEnv(): BotEnv {
  const port = serverEnv.PORT;
  return {
    telegramToken: serverEnv.TELEGRAM_BOT_TOKEN,
    allowedChatId: serverEnv.TELEGRAM_CHAT_ID,
    googleApiKey: serverEnv.GOOGLE_API_KEY,
    port,
    mcpUrl: serverEnv.MCP_URL ?? `http://localhost:${port}/mcp`,
  };
}
