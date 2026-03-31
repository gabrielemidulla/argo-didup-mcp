import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { assertValidCronExpression } from "./cron-util.ts";
import type { AutomationRepository } from "./repository.ts";

const cronHelp =
  "Espressione cron a 5 campi: minuto ora giorno_mese mese giorno_settimana. Fuso orario: Europe/Rome (stesso del bot). Esempi: \"0 20 * * *\" ogni giorno 20:00; \"0 15 * * 1-5\" lun-ven 15:00; \"30 7 * * *\" ogni giorno 7:30.";

const automationIdSchema = z.string().uuid();

function invalidAutomationIdResponse(): string {
  return JSON.stringify({
    ok: false,
    error:
      "Identificativo automazione non valido: usa l'UUID restituito da automation_list o automation_create.",
  });
}

export function createAutomationTools(
  repo: AutomationRepository,
  timezone: string,
  onMutate: () => Promise<void>,
): DynamicStructuredTool[] {
  const create = new DynamicStructuredTool({
    name: "automation_create",
    description: `Crea un'automazione ricorrente: salva un prompt che verrà eseguito dall'assistente alla pianificazione indicata (cron). Usa quando l'utente chiede promemoria ricorrenti (orario, compiti serali, ecc.). ${cronHelp}`,
    schema: z.object({
      prompt: z
        .string()
        .min(1)
        .describe(
          "Istruzione completa per il modello a ogni esecuzione (italiano), incluso cosa recuperare da Argo e come rispondere su Telegram: solo HTML (<b>, <i>, <a>), mai Markdown (** o #).",
        ),
      cron_expression: z
        .string()
        .min(1)
        .describe(
          `Espressione cron 5 campi. ${cronHelp}`,
        ),
    }),
    func: async ({ prompt, cron_expression }) => {
      assertValidCronExpression(cron_expression, timezone);
      const id = await repo.create(prompt.trim(), cron_expression.trim());
      await onMutate();
      return JSON.stringify({
        ok: true,
        id,
        message:
          "Automazione creata e pianificata. Non menzionare l'UUID all'utente nelle risposte su Telegram.",
      });
    },
  });

  const list = new DynamicStructuredTool({
    name: "automation_list",
    description:
      "Elenca tutte le automazioni (id UUID, prompt, cron, abilitata). Usa quando l'utente chiede di vedere le automazioni o i promemoria pianificati. L'id serve solo per update/delete: non mostrarlo mai all'utente in chat.",
    schema: z.object({}),
    func: async () => {
      const rows = await repo.listAll();
      return JSON.stringify(
        rows.map((r) => ({
          id: r.id,
          prompt: r.prompt,
          cron_expression: r.cron_expression,
          enabled: r.enabled,
        })),
      );
    },
  });

  const update = new DynamicStructuredTool({
    name: "automation_update",
    description:
      "Modifica un'automazione esistente per UUID (prompt, cron e/o abilitazione). Almeno un campo da aggiornare.",
    schema: z.object({
      id: automationIdSchema.describe(
        "UUID restituito da automation_list o automation_create (non mostrarlo all'utente).",
      ),
      prompt: z.string().min(1).optional().describe("Nuovo testo istruzioni"),
      cron_expression: z
        .string()
        .min(1)
        .optional()
        .describe("Nuova espressione cron 5 campi"),
      enabled: z
        .boolean()
        .optional()
        .describe("true = attiva, false = disattiva senza cancellare"),
    }),
    func: async ({ id, prompt, cron_expression, enabled }) => {
      const parsed = automationIdSchema.safeParse(id);
      if (!parsed.success) return invalidAutomationIdResponse();
      if (
        prompt === undefined &&
        cron_expression === undefined &&
        enabled === undefined
      ) {
        return JSON.stringify({
          ok: false,
          error: "Specifica almeno uno tra prompt, cron_expression, enabled.",
        });
      }
      if (cron_expression !== undefined) {
        assertValidCronExpression(cron_expression, timezone);
      }
      const ok = await repo.update(parsed.data, {
        prompt: prompt?.trim(),
        cron_expression: cron_expression?.trim(),
        enabled,
      });
      await onMutate();
      if (!ok) {
        return JSON.stringify({
          ok: false,
          error: "Nessuna automazione con quell'identificativo.",
        });
      }
      return JSON.stringify({
        ok: true,
        message:
          "Automazione aggiornata. Non menzionare UUID o identificativi tecnici all'utente.",
      });
    },
  });

  const del = new DynamicStructuredTool({
    name: "automation_delete",
    description:
      "Elimina definitivamente un'automazione per UUID (da automation_list o automation_create).",
    schema: z.object({
      id: automationIdSchema.describe(
        "UUID da automation_list o automation_create (non mostrarlo all'utente).",
      ),
    }),
    func: async ({ id }) => {
      const parsed = automationIdSchema.safeParse(id);
      if (!parsed.success) return invalidAutomationIdResponse();
      const ok = await repo.delete(parsed.data);
      await onMutate();
      if (!ok) {
        return JSON.stringify({
          ok: false,
          error: "Nessuna automazione con quell'identificativo.",
        });
      }
      return JSON.stringify({
        ok: true,
        message:
          "Automazione eliminata. Non menzionare UUID o identificativi tecnici all'utente.",
      });
    },
  });

  return [create, list, update, del];
}
