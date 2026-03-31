import { InvalidArgumentError } from "commander";

export function parseBoolArg(v: string): boolean | undefined {
  const s = v.trim().toLowerCase();
  if (s === "true" || s === "1" || s === "si" || s === "sì" || s === "yes")
    return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return undefined;
}

export function parsePositiveIntOption(value: string, label: string): number {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n)) {
    throw new InvalidArgumentError(`${label} deve essere un numero intero`);
  }
  return n;
}
