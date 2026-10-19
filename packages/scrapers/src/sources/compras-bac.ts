/**
 * Buenos Aires Compras (BAC), published in OCDS on the open data portal:
 *   bun run scrape compras-bac [--solo-descarga | --solo-procesar]
 *
 * 1. Asks CKAN for the dataset once (the portal firewall blocks bursts) and archives the answer.
 * 2. Streams every file of the dataset from the CDN to data/raw/compras-bac/, in sequence and with a pause. Each
 *    request carries the ETag and Last-Modified of the last download, so an unchanged file is not downloaded again.
 * 3. Normalizes the latest award.csv and tender.csv into data/processed/compras-bac/.
 *
 * Background in docs/relevamiento-fuentes.md.
 */

import { join } from "node:path";

import {
  archive,
  collapseSpaces,
  detach,
  get,
  latestEntry,
  type ManifestEntry,
  normalizeCuit,
  parseCsvStream,
  personKind,
  ROOT,
  type Row,
  readRawStream,
  sleep,
  streamAndArchive,
  writeProcessed,
  writeProcessedMeta,
} from "@ct/core";

export const SOURCE = "compras-bac";
const DATASET = "buenos-aires-compras";
const CATALOG_URL = `https://data.buenosaires.gob.ar/api/3/action/package_show?id=${DATASET}`;

interface CkanResource {
  name: string;
  url: string;
}

// Files the normalization reads go first: bac.csv (2.6 GB, everything together) is the slowest and least needed.
const PRIORITY = ["award.csv", "tender.csv"];
const priority = (filename: string) => (PRIORITY.includes(filename) ? PRIORITY.indexOf(filename) : PRIORITY.length);

async function download(): Promise<void> {
  const resp = await get(CATALOG_URL);
  const catalog = new Uint8Array(await resp.arrayBuffer());
  await archive(SOURCE, "catalogo.json", catalog, { url: CATALOG_URL });
  const { result } = JSON.parse(new TextDecoder().decode(catalog)) as { result: { resources: CkanResource[] } };

  const files = result.resources
    .map((r) => ({ url: r.url, filename: new URL(r.url).pathname.split("/").at(-1) ?? "" }))
    .filter((f) => f.filename)
    .sort((a, b) => priority(a.filename) - priority(b.filename));

  // A file that fails does not stop the run: the rest are downloaded and the failures reported at the end.
  const failed: string[] = [];
  for (const { url, filename } of files) {
    const started = Date.now();
    try {
      const path = await streamAndArchive(SOURCE, url, filename);
      const seconds = Math.round((Date.now() - started) / 1000);
      console.log(`${filename}: ${path ? `nueva versión (${seconds} s)` : "sin cambios"}`);
    } catch (err) {
      console.error(`${filename}: falló (${err instanceof Error ? err.message : err})`);
      failed.push(filename);
    }
    await sleep(10_000);
  }
  if (failed.length) throw new Error(`No se pudieron descargar: ${failed.join(", ")}`);
}

// --- Normalization ---------------------------------------------------------------------------------------------
//
// BAC flattens OCDS one row per item: the same award (and the same tender) repeats on every item row. Each `ocid`
// is one lot of a procurement process (`tender/id`), with at most one award and one supplier.

const DATASET_URL = `https://data.buenosaires.gob.ar/dataset/${DATASET}`;
const LICENSE = "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/deed.es)";

const TENDER_COLUMNS = {
  ocid: "ocid",
  date: "date",
  id: "tender/id",
  title: "tender/title",
  description: "tender/description",
  status: "tender/status",
  entityId: "tender/procuringEntity/id",
  entityName: "tender/procuringEntity/name",
  amount: "tender/value/amount",
  currency: "tender/value/currency",
  method: "tender/procurementMethod",
  methodDetails: "tender/procurementMethodDetails",
  category: "tender/mainProcurementCategory",
  additionalCategory: "tender/additionalProcurementCategories",
  periodEnd: "tender/tenderPeriod/endDate",
  documentUrl: "tender/documents/0/url",
} as const;

const AWARD_COLUMNS = {
  ocid: "ocid",
  id: "awards/0/id",
  title: "awards/0/title",
  description: "awards/0/description",
  status: "awards/0/status",
  date: "awards/0/date",
  amount: "awards/0/value/amount",
  currency: "awards/0/value/currency",
  contractStart: "awards/0/contractPeriod/startDate",
  contractEnd: "awards/0/contractPeriod/endDate",
  contractDays: "awards/0/contractPeriod/durationInDays",
  documentUrl: "awards/0/documents/0/url",
  supplierName: "awards/0/suppliers/0/name",
  supplierId: "awards/0/suppliers/0/id",
} as const;

type Picked<C> = Record<keyof C, string>;

/** Reads a raw CSV as records with only `columns`, renamed. Fails if the file lost one of them (format change). */
async function* readColumns<C extends Record<string, string>>(path: string, columns: C): AsyncGenerator<Picked<C>> {
  const rows = parseCsvStream(readRawStream(path));
  const first = await rows.next();
  const header = first.done ? [] : first.value;
  const index = Object.entries(columns).map(([key, name]) => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`${path}: falta la columna ${name}`);
    return [key, i] as const;
  });
  for await (const row of rows) {
    if (row.length === 1 && row[0] === "") continue;
    yield Object.fromEntries(index.map(([key, i]) => [key, detach(row[i] ?? "")])) as Picked<C>;
  }
}

const clean = (s: string) => collapseSpaces(s) || null;
const day = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null);
const amount = (s: string) => (s.trim() === "" ? null : Number(s));

/**
 * Supplier name and CUIT, only for legal entities. Individuals (CUIT 20, 23, 24, 27) and ids that are not a CUIT
 * are published without name or CUIT: their CUIT carries the DNI and they are not profiled (AGENTS.md, D-04).
 */
export function supplierFields(name: string, id: string): Row {
  const cuit = normalizeCuit(id);
  const kind = cuit ? personKind(cuit) : null;
  if (kind !== "juridica") return { proveedor_tipo: kind ?? "sin_cuit", proveedor_cuit: null, proveedor_nombre: null };
  return { proveedor_tipo: kind, proveedor_cuit: cuit, proveedor_nombre: clean(name) };
}

interface Lot {
  processId: string;
  amount: number | null;
}

export interface ProcessSummary {
  row: Row;
  lots: Map<string, Lot>;
  categories: Set<string>;
}

/** Folds the item rows of tender.csv into one summary per process, keeping each lot's estimate once. */
export function addTenderRow(processes: Map<string, ProcessSummary>, lots: Map<string, Lot>, t: Picked<typeof TENDER_COLUMNS>): void {
  let p = processes.get(t.id);
  if (!p) {
    p = {
      row: {
        proceso_id: t.id,
        fecha: day(t.date),
        titulo: clean(t.title),
        estado: clean(t.status),
        procedimiento: clean(t.methodDetails),
        metodo: clean(t.method),
        unidad_ejecutora_id: clean(t.entityId),
        unidad_ejecutora: clean(t.entityName),
        moneda: clean(t.currency),
        fin_presentacion_ofertas: day(t.periodEnd),
        url_pliego: clean(t.documentUrl),
      },
      lots: new Map(),
      categories: new Set(),
    };
    processes.set(t.id, p);
  }
  if (!p.lots.has(t.ocid)) {
    const lot = { processId: t.id, amount: amount(t.amount) };
    p.lots.set(t.ocid, lot);
    lots.set(t.ocid, lot);
  }
  for (const c of [t.category, t.additionalCategory]) if (clean(c)) p.categories.add(clean(c)!);
}

export function processRow(p: ProcessSummary): Row {
  const amounts = [...p.lots.values()].map((l) => l.amount);
  const total = amounts.every((a) => a !== null) ? amounts.reduce((sum, a) => sum + a!, 0) : null;
  return { ...p.row, categorias: [...p.categories].sort().join("; ") || null, lotes: p.lots.size, monto_estimado: total };
}

const PROCESS_COLUMNS = {
  proceso_id: "Número de proceso en BAC (`tender/id`): unidad ejecutora, número, año y tipo de procedimiento.",
  fecha: "Fecha de publicación del proceso (AAAA-MM-DD).",
  titulo: "Título del proceso.",
  estado: "Estado OCDS del proceso: complete, active, cancelled, unsuccessful.",
  procedimiento: "Tipo de procedimiento según BAC (licitación pública, contratación directa, contratación menor…).",
  metodo: "Método OCDS: open, selective, limited, direct.",
  unidad_ejecutora_id: "Código de la unidad ejecutora que compra (`CABA-UE-<número>`).",
  unidad_ejecutora: "Nombre de la unidad ejecutora.",
  moneda: "Moneda del monto estimado (ARS, USD, EUR).",
  fin_presentacion_ofertas: "Fecha de cierre de presentación de ofertas (AAAA-MM-DD).",
  categorias: "Categorías OCDS principal y adicionales de los lotes, separadas por «; ».",
  lotes: "Cantidad de lotes (`ocid`) del proceso.",
  monto_estimado:
    "Suma de los montos estimados de los lotes, en la moneda indicada y en valores nominales. BAC publica 0 en muchos procesos (por ejemplo concesiones); se deja como viene. Vacío si algún lote no trae monto.",
  url_pliego: "Pliego en buenosairescompras.gob.ar.",
};

const AWARD_OUTPUT_COLUMNS = {
  ocid: "Identificador OCDS del lote adjudicado.",
  proceso_id: "Número de proceso en BAC; une con `procesos`.",
  fecha: "Fecha de la adjudicación (AAAA-MM-DD).",
  titulo: "Título de la adjudicación.",
  rubro: "Rubro según BAC.",
  estado: "Estado OCDS de la adjudicación.",
  monto: "Monto adjudicado, en la moneda indicada y en valores nominales.",
  moneda: "Moneda del monto (ARS, USD, EUR).",
  contrato_inicio: "Inicio del período de contrato (AAAA-MM-DD).",
  contrato_fin: "Fin del período de contrato (AAAA-MM-DD).",
  contrato_dias: "Duración del contrato en días, según BAC.",
  items: "Cantidad de ítems adjudicados.",
  proveedor_tipo: "juridica, humana (CUIT 20, 23, 24 o 27) o sin_cuit.",
  proveedor_cuit: "CUIT del proveedor, 11 dígitos. Solo para personas jurídicas.",
  proveedor_nombre: "Razón social del proveedor. Solo para personas jurídicas.",
  unidad_ejecutora_id: "Código de la unidad ejecutora que compra.",
  unidad_ejecutora: "Nombre de la unidad ejecutora.",
  procedimiento: "Tipo de procedimiento según BAC.",
  url_documento: "Documento de la adjudicación en buenosairescompras.gob.ar.",
};

export interface AwardSummary {
  row: Row;
  items: number;
  /** Amount and supplier as published: every item row of the award should repeat them. */
  check: string;
  /** Item rows whose amount or supplier differ from the first one. */
  conflicts: number;
}

/** Folds the item rows of award.csv into one row per awarded lot. */
export function addAwardRow(awards: Map<string, AwardSummary>, a: Picked<typeof AWARD_COLUMNS>): void {
  const key = `${a.ocid}\n${a.id}`;
  const check = `${a.amount}\n${a.supplierId}`;
  const prev = awards.get(key);
  if (prev) {
    prev.items++;
    if (prev.check !== check) prev.conflicts++;
    return;
  }
  awards.set(key, {
    row: {
      ocid: a.ocid,
      fecha: day(a.date),
      titulo: clean(a.title),
      rubro: clean(a.description),
      estado: clean(a.status),
      monto: amount(a.amount),
      moneda: clean(a.currency),
      contrato_inicio: day(a.contractStart),
      contrato_fin: day(a.contractEnd),
      contrato_dias: amount(a.contractDays),
      ...supplierFields(a.supplierName, a.supplierId),
      url_documento: clean(a.documentUrl),
    },
    items: 1,
    check,
    conflicts: 0,
  });
}

const byDateAndId = (key: string) => (a: Row, b: Row) =>
  String(a.fecha ?? "").localeCompare(String(b.fecha ?? "")) || String(a[key]).localeCompare(String(b[key]));

/** One CSV per year (by `fecha`), so no file gets near GitHub's 100 MB limit. */
async function writeByYear(
  name: string,
  rows: Row[],
  columns: Record<string, string>,
  meta: { titulo: string; descripcion: string; originales: ManifestEntry[]; notas: string[] },
): Promise<Map<string, number>> {
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
    await writeProcessed(SOURCE, filename, yearRows, Object.keys(columns));
    await writeProcessedMeta(SOURCE, filename, {
      titulo: `${meta.titulo} (${year})`,
      descripcion: meta.descripcion,
      fuente: DATASET_URL,
      licencia: LICENSE,
      originales: meta.originales.map(({ path, url, sha256 }) => ({ path, url, sha256 })),
      columnas: columns,
      notas: meta.notas,
    });
    counts.set(year, yearRows.length);
  }
  return counts;
}

async function processAll(): Promise<void> {
  const tender = await latestEntry(SOURCE, "tender.csv");
  const award = await latestEntry(SOURCE, "award.csv");
  if (!tender || !award) {
    console.log("Faltan tender.csv o award.csv en data/raw: no se normaliza.");
    return;
  }

  const processes = new Map<string, ProcessSummary>();
  const lots = new Map<string, Lot>();
  for await (const t of readColumns(join(ROOT, tender.path), TENDER_COLUMNS)) addTenderRow(processes, lots, t);

  const awards = new Map<string, AwardSummary>();
  for await (const a of readColumns(join(ROOT, award.path), AWARD_COLUMNS)) addAwardRow(awards, a);

  const processRows = [...processes.values()].map(processRow).sort(byDateAndId("proceso_id"));
  let orphans = 0;
  const conflicts = [...awards.values()].reduce((n, a) => n + a.conflicts, 0);
  const awardRows = [...awards.values()]
    .map(({ row, items }) => {
      const lot = lots.get(String(row.ocid));
      const process = lot ? processes.get(lot.processId)?.row : undefined;
      if (!process) orphans++;
      return {
        ...row,
        proceso_id: lot?.processId ?? null,
        items,
        unidad_ejecutora_id: process?.unidad_ejecutora_id ?? null,
        unidad_ejecutora: process?.unidad_ejecutora ?? null,
        procedimiento: process?.procedimiento ?? null,
      };
    })
    .sort(byDateAndId("ocid"));

  const notes = [
    "BAC publica una fila por ítem; acá hay una fila por proceso o por lote adjudicado.",
    "Montos nominales en la moneda de cada fila: no se convierten ni se ajustan por inflación.",
  ];
  const processCounts = await writeByYear("procesos", processRows, PROCESS_COLUMNS, {
    titulo: "Buenos Aires Compras: procesos de compra",
    descripcion: "Un proceso de compra por fila (licitaciones, contrataciones directas y menores), de tender.csv.",
    originales: [tender],
    notas: notes,
  });
  const awardCounts = await writeByYear("adjudicaciones", awardRows, AWARD_OUTPUT_COLUMNS, {
    titulo: "Buenos Aires Compras: adjudicaciones",
    descripcion: "Un lote adjudicado por fila, con su proveedor, de award.csv y tender.csv.",
    originales: [award, tender],
    notas: [...notes, "De los proveedores que son personas humanas no se publican nombre ni CUIT (D-04 en docs/decisiones.md)."],
  });

  console.log(`procesos: ${processRows.length} (${[...processCounts].map(([y, n]) => `${y}: ${n}`).join(", ")})`);
  console.log(`adjudicaciones: ${awardRows.length} (${[...awardCounts].map(([y, n]) => `${y}: ${n}`).join(", ")})`);
  if (orphans) console.log(`adjudicaciones sin proceso en tender.csv: ${orphans}`);
  if (conflicts) console.log(`filas de ítems con monto o proveedor distinto al del resto de su adjudicación: ${conflicts}`);
}

export async function run(args: string[]): Promise<void> {
  // If a download fails, what is already archived is still normalized; the error comes out at the end.
  let downloadError: unknown;
  if (!args.includes("--solo-procesar")) await download().catch((err) => (downloadError = err));
  if (!args.includes("--solo-descarga")) await processAll();
  if (downloadError) throw downloadError;
}
