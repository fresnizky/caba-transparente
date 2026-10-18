/**
 * Small helpers every scraper needs. Before writing a helper inside a scraper, look here first.
 */

/** Pause between requests, so we do not overload the servers. */
export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Collapses runs of spaces, tabs and newlines into one space and trims the ends. */
export const collapseSpaces = (s: string) => s.replace(/\s+/g, " ").trim();

/** The value as is if the cell is already a finite number; null otherwise. For spreadsheet cells. */
export const finiteNumber = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Number written in Argentine format: dot for thousands and comma for decimals ("1.234,56" → 1234.56). */
export const parseArNumber = (s: string) => Number(s.replaceAll(".", "").replace(",", "."));

/** CUIT/CUIL as 11 digits ("30-54168237-2" → "30541682372"), or null if it does not have 11 digits. */
export function normalizeCuit(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length === 11 ? digits : null;
}

/** Legal entities (30, 33, 34) versus individuals (20, 23, 24, 27), by CUIT prefix. Individuals are never profiled. */
export function personKind(cuit: string): "juridica" | "humana" | null {
  if (/^(30|33|34)/.test(cuit)) return "juridica";
  if (/^(20|23|24|27)/.test(cuit)) return "humana";
  return null;
}
