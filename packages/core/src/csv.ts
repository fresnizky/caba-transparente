import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { PROCESSED_DIR } from "./paths.ts";

type Cell = string | number | boolean | null | undefined;
export type Row = Record<string, Cell>;

function escapeCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** Serializes rows to CSV. Columns come from `columns` or from the first row. */
export function toCsv(rows: Row[], columns?: string[]): string {
  const cols = columns ?? Object.keys(rows[0] ?? {});
  const lines = [cols.join(",")];
  for (const row of rows) lines.push(cols.map((c) => escapeCell(row[c])).join(","));
  return `${lines.join("\n")}\n`;
}

/** Writes a CSV to data/processed/<source>/<file>. Returns the path. */
export async function writeProcessed(source: string, filename: string, rows: Row[], columns?: string[]): Promise<string> {
  const path = join(PROCESSED_DIR, source, filename);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, toCsv(rows, columns));
  return path;
}

/** Minimal CSV parser (RFC 4180): quotes, commas and newlines inside fields. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const QUOTE = 34;
const COMMA = 44;
const LF = 10;
const CR = 13;

/**
 * Streaming version of parseCsv, for files that do not fit in memory: yields one record at a time. Takes text or
 * UTF-8 bytes (a multibyte character may be split between chunks).
 */
export async function* parseCsvStream(chunks: AsyncIterable<string | Uint8Array>): AsyncGenerator<string[]> {
  const decoder = new TextDecoder();
  let row: string[] = [];
  let field = "";
  let quoted = false;
  // A closing quote was the last thing seen: the next character says whether it was an escaped quote ("").
  let afterQuote = false;
  let skipLf = false;
  for await (const chunk of chunks) {
    const s = typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    // Start of the text of the current field not yet copied to `field`.
    let start = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (skipLf) {
        skipLf = false;
        if (c === LF) {
          start = i + 1;
          continue;
        }
      }
      if (quoted) {
        if (c === QUOTE) {
          field += s.slice(start, i);
          quoted = false;
          afterQuote = true;
          start = i + 1;
        }
        continue;
      }
      if (afterQuote) {
        afterQuote = false;
        if (c === QUOTE) {
          field += '"';
          quoted = true;
          start = i + 1;
          continue;
        }
      }
      if (c === QUOTE) {
        field += s.slice(start, i);
        quoted = true;
        start = i + 1;
      } else if (c === COMMA) {
        row.push(field + s.slice(start, i));
        field = "";
        start = i + 1;
      } else if (c === LF || c === CR) {
        row.push(field + s.slice(start, i));
        yield row;
        row = [];
        field = "";
        start = i + 1;
        skipLf = c === CR;
      }
    }
    field += s.slice(start);
  }
  field += decoder.decode();
  if (field || row.length) {
    row.push(field);
    yield row;
  }
}

/** Description of a processed CSV, written next to it as <file>.meta.json. Keys in Spanish: it is published. */
export interface ProcessedMeta {
  titulo: string;
  descripcion: string;
  /** Official page of the source. */
  fuente: string;
  licencia: string;
  /** Raw files it was built from, as in manifest.jsonl. */
  originales: { path: string; url: string; sha256: string }[];
  /** What each column holds, in order. */
  columnas: Record<string, string>;
  notas?: string[];
}

/**
 * Writes `rows` as one CSV per year of their `fecha` (`<name>/<year>.csv`, or `<name>/sin-fecha.csv`), each with its
 * meta.json, so no file gets too big to handle. Columns are the keys of `meta.columnas`. Returns the rows per year.
 */
export async function writeProcessedByYear(source: string, name: string, rows: Row[], meta: ProcessedMeta): Promise<Map<string, number>> {
  const byYear = new Map<string, Row[]>();
  for (const row of rows) {
    const year = String(row.fecha ?? "").slice(0, 4) || "sin-fecha";
    const list = byYear.get(year);
    if (list) list.push(row);
    else byYear.set(year, [row]);
  }
  const counts = new Map<string, number>();
  for (const [year, yearRows] of [...byYear].sort()) {
    const filename = `${name}/${year}.csv`;
    await writeProcessed(source, filename, yearRows, Object.keys(meta.columnas));
    await writeProcessedMeta(source, filename, {
      titulo: `${meta.titulo} (${year})`,
      descripcion: meta.descripcion,
      fuente: meta.fuente,
      licencia: meta.licencia,
      originales: meta.originales.map(({ path, url, sha256 }) => ({ path, url, sha256 })),
      columnas: meta.columnas,
      notas: meta.notas,
    });
    counts.set(year, yearRows.length);
  }
  return counts;
}

/** Writes data/processed/<source>/<file>.meta.json. Returns the path. */
export async function writeProcessedMeta(source: string, filename: string, meta: ProcessedMeta): Promise<string> {
  const path = join(PROCESSED_DIR, source, `${filename}.meta.json`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(meta, null, 2)}\n`);
  return path;
}

/** Reads a CSV from data/processed/<source>/<file> as rows keyed by column name. Empty if missing. */
export async function readProcessed(source: string, filename: string): Promise<Row[]> {
  const path = join(PROCESSED_DIR, source, filename);
  if (!existsSync(path)) return [];
  const [header = [], ...rows] = parseCsv(await readFile(path, "utf8"));
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}
