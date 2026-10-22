/** Streaming readers for the processed CSVs (they do not all fit in memory as text). */

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { parseCsvStream } from "@ct/core";

/** Rows keyed by column name. Rows with a different number of fields than the header are skipped. */
export async function* readRows(path: string): AsyncGenerator<Record<string, string>> {
  const rows = parseCsvStream(Bun.file(path).stream());
  const first = await rows.next();
  const header = first.done ? [] : first.value;
  for await (const row of rows) {
    if (row.length !== header.length) continue;
    yield Object.fromEntries(header.map((h, i) => [h, row[i]!]));
  }
}

/** CSVs directly in dir, sorted by name (one per year). */
export const csvFiles = (dir: string) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(".csv"))
        .sort()
        .map((f) => join(dir, f))
    : [];
