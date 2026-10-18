/**
 * Checks whether the City's sites answer from where this runs (a laptop in Argentina, a GitHub Actions runner):
 *   bun run probar-acceso [--json <path>]
 *
 * One small request per site, in sequence and with a pause, so it never looks like a burst. Big files are asked
 * with a Range header (first KB only). Each result says the HTTP status, time, content type and whether the body
 * looks like a firewall page instead of the expected content.
 *
 * With GITHUB_STEP_SUMMARY set (GitHub Actions), the table is also written to the job summary. Always exits 0:
 * it is a diagnostic, not a gate. Background in docs/relevamiento-fuentes.md.
 */

import { writeFile } from "node:fs/promises";

import { sleep, USER_AGENT } from "@ct/core";

type Expect = "json" | "html" | "pdf" | "csv";

interface Target {
  id: string;
  name: string;
  url: string;
  expect: Expect;
  /** Only ask for the first bytes (big files). */
  range?: boolean;
}

const TARGETS: Target[] = [
  {
    id: "ckan-api",
    name: "Datos abiertos: API CKAN",
    url: "https://data.buenosaires.gob.ar/api/3/action/package_show?id=buenos-aires-compras",
    expect: "json",
  },
  { id: "ckan-web", name: "Datos abiertos: sitio", url: "https://data.buenosaires.gob.ar/dataset/buenos-aires-compras", expect: "html" },
  {
    id: "cdn-datasets",
    name: "Datos abiertos: CDN de archivos",
    url: "https://cdn.buenosaires.gob.ar/datosabiertos/datasets/ministerio-de-economia-y-finanzas/buenos-aires-compras/award.csv",
    expect: "csv",
    range: true,
  },
  {
    id: "boletin-api",
    name: "Boletín Oficial: API",
    url: "https://api-restboletinoficial.buenosaires.gob.ar/obtenerBoletin/0/false",
    expect: "json",
  },
  {
    id: "boletin-pdf",
    name: "Boletín Oficial: documentos",
    url: "https://documentosboletinoficial.buenosaires.gob.ar/publico/ck_PE-DEC-AJG-AJG-358-26-7475.pdf",
    expect: "pdf",
    range: true,
  },
  { id: "boletin-web", name: "Boletín Oficial: sitio", url: "https://boletinoficial.buenosaires.gob.ar/", expect: "html" },
  { id: "bac-web", name: "Buenos Aires Compras", url: "https://www.buenosairescompras.gob.ar/", expect: "html" },
  { id: "gcba-web", name: "buenosaires.gob.ar", url: "https://buenosaires.gob.ar/", expect: "html" },
  { id: "legislatura-web", name: "Legislatura", url: "https://www.legislatura.gob.ar/", expect: "html" },
  { id: "legislatura-parlamentaria", name: "Legislatura: parlamentaria", url: "https://parlamentaria.legislatura.gob.ar/", expect: "html" },
  { id: "estadistica-web", name: "Estadística de la Ciudad", url: "https://www.estadisticaciudad.gob.ar/", expect: "html" },
  {
    id: "registro-sociedades",
    name: "Registro Nacional de Sociedades (Nación)",
    url: "https://datos.jus.gob.ar/api/3/action/package_show?id=registro-nacional-de-sociedades",
    expect: "json",
  },
  {
    id: "archive-org",
    name: "archive.org",
    url: "https://archive.org/services/search/v1/scrape?q=identifier%3Anasa&fields=identifier",
    expect: "json",
  },
];

// Pages that firewalls or bot checks answer with, instead of the content.
const BLOCK_SIGNS: [RegExp, string][] = [
  [/Request Rejected/i, "firewall (Request Rejected)"],
  [/Access Denied/i, "firewall (Access Denied)"],
  [/Just a moment|cf-chl|challenge-platform/i, "desafío antibots"],
  [/captcha/i, "captcha"],
];

const PAUSE_MS = 3000;
const TIMEOUT_MS = 30_000;

interface Result {
  id: string;
  name: string;
  url: string;
  ok: boolean;
  status: number | null;
  ms: number;
  contentType: string;
  note: string;
}

function looksRight(expect: Expect, contentType: string, head: string): boolean {
  if (expect === "json") return /json/i.test(contentType) || /^\s*[[{]/.test(head);
  if (expect === "pdf") return /pdf/i.test(contentType) || head.startsWith("%PDF");
  if (expect === "csv") return !/<html/i.test(head);
  return /<html|<!doctype html/i.test(head);
}

async function probe(target: Target): Promise<Result> {
  const started = performance.now();
  const base = { id: target.id, name: target.name, url: target.url };
  try {
    const headers: Record<string, string> = { "User-Agent": USER_AGENT };
    if (target.range) headers.Range = "bytes=0-1023";
    const resp = await fetch(target.url, { headers, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = await resp.text();
    const ms = Math.round(performance.now() - started);
    const contentType = resp.headers.get("content-type") ?? "";
    const block = BLOCK_SIGNS.find(([re]) => re.test(body.slice(0, 5000)))?.[1];
    const right = looksRight(target.expect, contentType, body.slice(0, 500));
    const ok = resp.ok && !block && right;
    const note =
      block ?? (resp.ok && !right ? `respuesta inesperada (se esperaba ${target.expect})` : resp.ok ? "" : `HTTP ${resp.status}`);
    return { ...base, ok, status: resp.status, ms, contentType, note };
  } catch (err) {
    const ms = Math.round(performance.now() - started);
    const e = err as Error & { cause?: { code?: string } };
    const note = e.name === "TimeoutError" ? `sin respuesta en ${TIMEOUT_MS / 1000} s` : (e.cause?.code ?? e.message);
    return { ...base, ok: false, status: null, ms, contentType: "", note };
  }
}

/** Public IP and network this runs from, to tell a laptop from a cloud runner. Best effort. */
async function origin(): Promise<string> {
  try {
    const resp = await fetch("https://ipinfo.io/json", { signal: AbortSignal.timeout(10_000) });
    const info = (await resp.json()) as { ip?: string; country?: string; org?: string };
    return `${info.ip ?? "?"} · ${info.country ?? "?"} · ${info.org ?? "?"}`;
  } catch {
    return "desconocido";
  }
}

function markdown(where: string, results: Result[]): string {
  const rows = results.map(
    (r) => `| ${r.ok ? "✅" : "❌"} | ${r.name} | ${r.status ?? "—"} | ${r.ms} ms | ${r.note || "ok"} | [link](${r.url}) |`,
  );
  const failed = results.filter((r) => !r.ok).length;
  return [
    `### Acceso a los sitios de la Ciudad`,
    "",
    `Desde: ${where} · ${new Date().toISOString()}`,
    "",
    `${results.length - failed} de ${results.length} responden bien.`,
    "",
    "| | Sitio | HTTP | Tiempo | Nota | URL |",
    "|---|---|---|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}

export async function run(args: string[]): Promise<void> {
  const jsonPath = args[args.indexOf("--json") + 1];
  const where = await origin();
  console.log(`Desde: ${where}`);
  const results: Result[] = [];
  for (const target of TARGETS) {
    const result = await probe(target);
    results.push(result);
    console.log(
      `${result.ok ? "ok   " : "FALLA"} ${result.id.padEnd(26)} ${String(result.status ?? "—").padEnd(4)} ${result.ms} ms ${result.note}`,
    );
    await sleep(PAUSE_MS);
  }
  const report = markdown(where, results);
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, report, { flag: "a" });
  if (args.includes("--json") && jsonPath)
    await writeFile(jsonPath, JSON.stringify({ where, at: new Date().toISOString(), results }, null, 2));
}

if (import.meta.main) await run(process.argv.slice(2));
