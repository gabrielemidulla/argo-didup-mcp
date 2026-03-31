import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const mcpServerEnv = createEnv({
  server: {
    CODICE_SCUOLA: z.string().optional(),
    USERNAME: z.string().optional(),
    PASSWORD: z.string().optional(),
    AUTH_TOKEN: z.string().optional(),
    PORT: z.string().optional().default("3000"),
    MCP_HOST: z.string().optional(),
    MCP_IDLE_TIMEOUT: z.string().optional(),
    PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
  },
  runtimeEnv: Bun.env,
  emptyStringAsUndefined: true,
});
