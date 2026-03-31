import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { serverEnv } from "./config/env.ts";

/** Testo usato nel blocco iniettato (e per ripulire history legacy con vecchia SystemMessage). */
export const USER_MEMORY_SYSTEM_TAG =
  "Memoria persistente (preferenze utente):";

/**
 * Delimitatori per iniettare la memoria nell’ultimo HumanMessage: così non si aggiunge una seconda
 * SystemMessage (LangGraph prepone già il prompt di sistema; Gemini accetta una sola in cima).
 */
export const USER_MEMORY_MESSAGE_START = "<<<TELEGRAM_USER_MEMORY>>>";
export const USER_MEMORY_MESSAGE_END = "<<<END_TELEGRAM_USER_MEMORY>>>";

const MAX_MEMORY_BYTES = 24 * 1024;

const defaultMemoryPath = () =>
  resolve(import.meta.dirname, "..", "MEMORY.md");

function filePath(): string {
  const fromEnv = serverEnv.TELEGRAM_MEMORY_PATH?.trim();
  if (fromEnv && fromEnv.length > 0) {
    return resolve(fromEnv);
  }
  return defaultMemoryPath();
}

function buildSystemMessage(memoryMarkdown: string): string {
  const body = memoryMarkdown.trim();
  return `${USER_MEMORY_SYSTEM_TAG} Applica sempre quanto segue, salvo che l'utente chieda esplicitamente il contrario in questo turno.\n\n${body}`;
}

/** Blocco da prefissare al messaggio utente dell’ultimo turno (non usare come SystemMessage con Gemini). */
function buildInjectionBlock(memoryMarkdown: string): string {
  const inner = buildSystemMessage(memoryMarkdown);
  return `${USER_MEMORY_MESSAGE_START}\n${inner}\n${USER_MEMORY_MESSAGE_END}\n\n`;
}

/** Legge MEMORY.md; stringa vuota se assente o vuoto. Tronca se supera il limite. */
async function read(): Promise<string> {
  const path = filePath();
  try {
    const buf = await readFile(path);
    if (buf.length > MAX_MEMORY_BYTES) {
      return buf.subarray(0, MAX_MEMORY_BYTES).toString("utf8") + "\n\n…(troncato)";
    }
    return buf.toString("utf8");
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return "";
    throw e;
  }
}

function utf8ByteLength(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

async function writeReplace(content: string): Promise<void> {
  const t = content.trim();
  if (utf8ByteLength(t) > MAX_MEMORY_BYTES) {
    throw new Error(
      `Contenuto troppo lungo (max ${MAX_MEMORY_BYTES} byte UTF-8).`,
    );
  }
  const path = filePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, t ? `${t}\n` : "", "utf8");
}

async function append(content: string): Promise<void> {
  const add = content.trim();
  if (!add) {
    throw new Error("Niente da aggiungere (content vuoto).");
  }
  const path = filePath();
  let current = "";
  try {
    const buf = await readFile(path);
    if (buf.length > MAX_MEMORY_BYTES) {
      throw new Error(
        `File memoria già al limite (${MAX_MEMORY_BYTES} byte). Usa replace o riduci.`,
      );
    }
    current = buf.toString("utf8");
  } catch (e) {
    if (e instanceof Error && e.message.includes("limite")) throw e;
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") throw e;
  }
  const sep = current.trim().length > 0 ? "\n\n" : "";
  const next = `${current.trimEnd()}${sep}${add}\n`;
  if (utf8ByteLength(next) > MAX_MEMORY_BYTES) {
    throw new Error(
      `Append supererebbe il limite di ${MAX_MEMORY_BYTES} byte UTF-8. Riduci o usa replace.`,
    );
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, next, "utf8");
}

async function clear(): Promise<void> {
  const path = filePath();
  try {
    await unlink(path);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") throw e;
  }
}

export default {
  filePath,
  buildSystemMessage,
  buildInjectionBlock,
  read,
  writeReplace,
  append,
  clear,
};
