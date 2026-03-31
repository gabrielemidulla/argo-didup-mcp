export type ParsedDdMmYyyy = { ok: true; t: number } | { ok: false };

/** Data calendario DD/MM/YYYY (Europe); mezzanotte locale, timestamp in ms. */
export function parseDdMmYyyy(raw: string): ParsedDdMmYyyy {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return { ok: false };
  const dd = Number(m[1]);
  const mm = Number(m[2]) - 1;
  const yyyy = Number(m[3]);
  const d = new Date(yyyy, mm, dd);
  if (
    d.getFullYear() !== yyyy ||
    d.getMonth() !== mm ||
    d.getDate() !== dd
  ) {
    return { ok: false };
  }
  d.setHours(0, 0, 0, 0);
  return { ok: true, t: d.getTime() };
}
