import { SEARCH_LOCALE } from "./locale.ts";

/** Query con parole separate da spazio: tutte devono comparire in haystack (già lower-case). */
export function tokensMatch(
  haystackLower: string,
  query: string | undefined,
): boolean {
  if (!query?.trim()) return true;
  const tokens = query
    .trim()
    .toLocaleLowerCase(SEARCH_LOCALE)
    .split(/\s+/)
    .filter((t) => t.length > 0);
  return tokens.every((t) => haystackLower.includes(t));
}
