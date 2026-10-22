/**
 * Boletín Oficial de la Ciudad, from its REST API:
 *   bun run scrape boletin-oficial [--hasta=AAAA-MM-DD] [--desde-numero=N] [--solo-descarga | --solo-procesar]
 *
 * 1. Walks the bulletins by number, from the latest (or --desde-numero) back to the first one published on or after
 *    --hasta (default: January 1st of the current year), as D-07 asks. By number and not by date: a date with no
 *    bulletin (a Sunday) silently returns the latest one.
 * 2. For each bulletin archives the API index (`obtenerBoletin/<n>/true`), the full PDF, the separata and every
 *    annex. Published files do not change, so what is already in data/raw is not asked for again.
 * 3. Logs each bulletin in data/raw/boletin-oficial/cobertura.jsonl (complete, incomplete with what failed, or not
 *    found), so a run can be cut and resumed, and one file that fails does not stop it.
 * 4. Normalizes the indexes into data/processed/boletin-oficial/: bulletins, norms and annexes, one CSV per year.
 *
 * The PDFs are kept and published as published, with the DNI and CUIL some acts carry (D-04). The processed data
 * does not extract anything from the PDF text, and hides the summaries of edicts, which name private citizens.
 * Background in docs/relevamiento-fuentes.md.
 */

import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  archive,
  collapseSpaces,
  get,
  latestEntry,
  latestRaw,
  type ManifestEntry,
  RAW_DIR,
  ROOT,
  type Row,
  readManifest,
  readRaw,
  sleep,
  writeProcessedByYear,
} from "@ct/core";

export const SOURCE = "boletin-oficial";
const API = "https://api-restboletinoficial.buenosaires.gob.ar";
const SITE = "https://boletinoficial.buenosaires.gob.ar";
const LICENSE = "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/deed.es)";
const COVERAGE = join(RAW_DIR, SOURCE, "cobertura.jsonl");
const PAUSE_MS = 2000;
// Bulletin numbers are consecutive; this many missing in a row means the walk went past the first one.
const MAX_MISSING_IN_A_ROW = 20;

interface Annex {
  filenet_firmado: string;
  nombre_anexo: string | null;
}

interface Norm {
  nombre: string;
  sumario: string | null;
  id_norma: number;
  id_sdin: string | null;
  url_norma: string;
  anexos: Annex[];
}

interface BulletinHeader {
  fecha_publicacion: string;
  numero: number;
  url_boletin: string | null;
  separata: { nombre: string | null; url: string }[] | null;
}

export interface BulletinIndex {
  boletin: BulletinHeader;
  normas: { normas: unknown };
}

export interface CoverageRecord {
  numero: number;
  fecha: string | null;
  estado: "completo" | "incompleto" | "no_existe";
  archivos: number;
  fallidos?: { url: string; error: string }[];
  revisado: string;
}

// --- Index ---------------------------------------------------------------------------------------------------------

export interface PlacedNorm extends Norm {
  seccion: string;
  tipo: string;
  organismo: string;
}

/** The API groups norms by section (power), type and issuing body: flattens that tree, keeping where each one was. */
export function flattenNorms(tree: unknown, path: string[] = []): PlacedNorm[] {
  if (Array.isArray(tree)) {
    const [seccion = "", tipo = "", ...organismo] = path;
    return (tree as Norm[]).map((n) => ({ ...n, seccion, tipo, organismo: organismo.join(" / ") }));
  }
  if (tree && typeof tree === "object") return Object.entries(tree).flatMap(([key, value]) => flattenNorms(value, [...path, key]));
  return [];
}

/** "20/10/2026" → "2026-10-20". */
export function isoDate(ddmmyyyy: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(ddmmyyyy.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** "Resolución N° 643/LCABA/26" → number 643, issuer LCABA, year 2026. A decree may have only the number. */
export function parseNormName(name: string): { numero: string | null; sigla: string | null; anio: number | null } {
  const m = /N[°º]\s*([\d.]+)(?:\/(.+)\/(\d{2,4}))?\s*$/.exec(name);
  if (!m) return { numero: null, sigla: null, anio: null };
  let year = m[3] ? Number(m[3]) : null;
  if (year !== null && year < 100) year += year <= new Date().getFullYear() % 100 ? 2000 : 1900;
  return { numero: m[1]?.replaceAll(".", "") ?? null, sigla: m[2] ?? null, anio: year };
}

// Edicts notify, summon or summon the relatives of private citizens, by name, in the summary itself.
const EDICT_SECTIONS = new Set(["Edictos Oficiales", "Edictos Particulares"]);
// Safety net for any other summary: a DNI or a CUIL of a person.
const ID_NUMBER = /\b(D\.?\s?N\.?\s?I|CUIL)\b|\b2[0347]-?\d{8}-?\d\b|\b\d{1,2}\.\d{3}\.\d{3}\b/i;
// A court case cited by its caption names its parties ("autos caratulados: <APELLIDO>, <Nombre> s/ sucesión").
const CASE_CAPTION = /caratulad[oa]s?\b/i;

/**
 * Summary to publish: hidden for edicts, for any summary with an identity number and for court cases cited by their
 * caption. Flagged so it is not read as missing.
 */
export function summaryFields(seccion: string, sumario: string | null): { sumario: string | null; sumario_oculto: boolean } {
  const text = sumario ? collapseSpaces(sumario) : "";
  const hidden = EDICT_SECTIONS.has(seccion) || ID_NUMBER.test(text) || CASE_CAPTION.test(text);
  return { sumario: hidden || !text ? null : text, sumario_oculto: hidden };
}

const lastSegment = (url: string) => new URL(url).pathname.split("/").filter(Boolean).at(-1) ?? "";

/** Raw filenames of the files of bulletin `n`, with their official URL. */
export function bulletinFiles(n: number, index: BulletinIndex): { filename: string; url: string }[] {
  const files: { filename: string; url: string }[] = [];
  if (index.boletin.url_boletin) files.push({ filename: `boletin-${n}.pdf`, url: index.boletin.url_boletin });
  const separatas = index.boletin.separata ?? [];
  separatas.forEach((s, i) => {
    files.push({ filename: `boletin-${n}-separata${separatas.length > 1 ? `-${i + 1}` : ""}.pdf`, url: s.url });
  });
  for (const norm of flattenNorms(index.normas.normas)) {
    for (const annex of norm.anexos)
      files.push({ filename: `boletin-${n}-anexo-${lastSegment(annex.filenet_firmado)}.pdf`, url: annex.filenet_firmado });
  }
  return files;
}

// --- Download ------------------------------------------------------------------------------------------------------

async function readCoverage(): Promise<Map<number, CoverageRecord>> {
  const latest = new Map<number, CoverageRecord>();
  if (!existsSync(COVERAGE)) return latest;
  for (const line of (await readFile(COVERAGE, "utf8")).split("\n")) {
    if (!line) continue;
    const record = JSON.parse(line) as CoverageRecord;
    latest.set(record.numero, record);
  }
  return latest;
}

async function logCoverage(record: CoverageRecord): Promise<void> {
  await mkdir(join(RAW_DIR, SOURCE), { recursive: true });
  await appendFile(COVERAGE, `${JSON.stringify(record)}\n`);
}

const now = () => `${new Date().toISOString().slice(0, 19)}Z`;

/** Index of bulletin `n`, from data/raw or from the API. Null if the API has no bulletin with that number. */
async function bulletinIndex(n: number): Promise<BulletinIndex | null> {
  const filename = `boletin-${n}.json`;
  const prev = await latestRaw(SOURCE, filename);
  if (prev && existsSync(prev)) return JSON.parse((await readRaw(prev)).toString("utf8")) as BulletinIndex;

  const url = `${API}/obtenerBoletin/${n}/true`;
  const bytes = new Uint8Array(await (await get(url)).arrayBuffer());
  await sleep(PAUSE_MS);
  let index: BulletinIndex;
  try {
    index = JSON.parse(new TextDecoder().decode(bytes)) as BulletinIndex;
  } catch {
    return null;
  }
  // A number the API does not know may come back as the latest bulletin, or empty.
  if (index?.boletin?.numero !== n) return null;
  await archive(SOURCE, filename, bytes, { url });
  return index;
}

/** Archives one file unless it is already in data/raw. Fails if a PDF does not come back as a PDF. */
async function saveFile(filename: string, url: string): Promise<void> {
  if (await latestEntry(SOURCE, filename)) return;
  const resp = await get(url);
  const bytes = new Uint8Array(await resp.arrayBuffer());
  await sleep(PAUSE_MS);
  if (filename.endsWith(".pdf") && new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
    throw new Error(`no es un PDF (${resp.headers.get("content-type") ?? "sin tipo"}, ${bytes.length} bytes)`);
  }
  await archive(SOURCE, filename, bytes, { url });
}

async function latestNumber(): Promise<number> {
  const resp = await get(`${API}/obtenerBoletin/0/false`);
  const header = (await resp.json()) as BulletinHeader;
  if (!Number.isInteger(header.numero)) throw new Error("La API no devolvió el número del último boletín");
  return header.numero;
}

async function download(args: string[]): Promise<void> {
  const option = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  const until = option("hasta") ?? `${new Date().getFullYear()}-01-01`;
  const start = Number(option("desde-numero")) || (await latestNumber());
  const coverage = await readCoverage();
  console.log(`Boletines desde el ${start} hacia atrás, hasta el ${until}`);

  let missing = 0;
  for (let n = start; n > 0 && missing < MAX_MISSING_IN_A_ROW; n--) {
    const done = coverage.get(n);
    if (done?.estado === "completo" && done.fecha) {
      if (done.fecha < until) break;
      continue;
    }

    let index: BulletinIndex | null;
    try {
      index = await bulletinIndex(n);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      console.error(`${n}: no se pudo pedir el índice (${error})`);
      await logCoverage({
        numero: n,
        fecha: null,
        estado: "incompleto",
        archivos: 0,
        fallidos: [{ url: `${API}/obtenerBoletin/${n}/true`, error }],
        revisado: now(),
      });
      continue;
    }
    if (!index) {
      missing++;
      await logCoverage({ numero: n, fecha: null, estado: "no_existe", archivos: 0, revisado: now() });
      console.log(`${n}: no existe`);
      continue;
    }
    missing = 0;
    const fecha = isoDate(index.boletin.fecha_publicacion);
    if (fecha && fecha < until) break;

    const files = bulletinFiles(n, index);
    const fallidos: { url: string; error: string }[] = [];
    for (const { filename, url } of files) {
      try {
        await saveFile(filename, url);
      } catch (err) {
        fallidos.push({ url, error: err instanceof Error ? err.message : String(err) });
      }
    }
    const estado = fallidos.length ? "incompleto" : "completo";
    await logCoverage({
      numero: n,
      fecha,
      estado,
      archivos: files.length - fallidos.length,
      ...(fallidos.length ? { fallidos } : {}),
      revisado: now(),
    });
    console.log(
      `${n} (${fecha}): ${files.length - fallidos.length} de ${files.length} archivos${fallidos.length ? `, ${fallidos.length} fallaron` : ""}`,
    );
  }
}

// --- Normalization -------------------------------------------------------------------------------------------------

const BULLETIN_COLUMNS = {
  numero: "Número del boletín.",
  fecha: "Fecha de publicación (AAAA-MM-DD).",
  normas: "Cantidad de normas y avisos publicados.",
  anexos: "Cantidad de anexos de esas normas.",
  url_boletin: "PDF de la edición completa en el sitio oficial.",
  url_separata: "PDF de la separata en el sitio oficial (varias, separadas por «; »).",
  copia_boletin: "Ruta de nuestra copia del PDF completo, en https://archivo.caba-transparente.com.ar/<ruta>.",
  copia_separata: "Ruta de nuestra copia de la separata.",
};

const NORM_COLUMNS = {
  boletin_numero: "Número del boletín donde se publicó; une con `boletines`.",
  fecha: "Fecha de publicación del boletín (AAAA-MM-DD).",
  seccion:
    "Sección del boletín: Poder Ejecutivo, Poder Legislativo, Poder Judicial, Órganos de Control, Comunicados y Avisos, Licitaciones, Edictos…",
  tipo: "Tipo de norma o aviso: Resolución, Disposición, Decreto, Llamado a Concurso…",
  organismo: "Organismo que la emite, como lo agrupa el boletín.",
  nombre: "Nombre de la norma, por ejemplo «Resolución N° 643/LCABA/26».",
  numero: "Número de la norma.",
  sigla: "Sigla del organismo emisor en el nombre de la norma.",
  anio: "Año de la norma, según su nombre.",
  sumario: "Resumen oficial del acto. Vacío si se ocultó (ver `sumario_oculto`).",
  sumario_oculto:
    "true si el sumario se ocultó: siempre en los edictos (nombran a particulares y a sus familiares), en cualquier sumario con un DNI o CUIL y en los que citan la carátula de una causa judicial (nombra a las partes). El sumario está en el original.",
  id_norma: "Identificador de la norma en la API del boletín.",
  id_sdin: "Identificador en el Servicio de Información Normativa, si lo tiene.",
  anexos: "Cantidad de anexos; une con `anexos` por `id_norma`.",
  url_norma: "PDF de la norma en el sitio oficial.",
};

const ANNEX_COLUMNS = {
  boletin_numero: "Número del boletín.",
  fecha: "Fecha de publicación del boletín (AAAA-MM-DD).",
  id_norma: "Norma a la que pertenece; une con `normas`.",
  norma: "Nombre de esa norma.",
  nombre_anexo: "Nombre del archivo del anexo.",
  url: "PDF del anexo en el sitio oficial.",
  bytes: "Tamaño del PDF. Vacío si no se pudo archivar.",
  copia: "Ruta de nuestra copia, en https://archivo.caba-transparente.com.ar/<ruta>. Vacío si no se pudo archivar.",
};

/** Rows of one bulletin: the bulletin, its norms and their annexes. `archived` gives the manifest entry of a raw file. */
export function bulletinRows(
  index: BulletinIndex,
  archived: (filename: string) => ManifestEntry | undefined,
): { bulletin: Row; norms: Row[]; annexes: Row[] } {
  const n = index.boletin.numero;
  const fecha = isoDate(index.boletin.fecha_publicacion);
  const placed = flattenNorms(index.normas.normas);
  const separatas = index.boletin.separata ?? [];
  const norms = placed.map((norm) => ({
    boletin_numero: n,
    fecha,
    seccion: norm.seccion,
    tipo: norm.tipo,
    organismo: norm.organismo,
    nombre: collapseSpaces(norm.nombre),
    ...parseNormName(norm.nombre),
    ...summaryFields(norm.seccion, norm.sumario),
    id_norma: norm.id_norma,
    id_sdin: norm.id_sdin || null,
    anexos: norm.anexos.length,
    url_norma: norm.url_norma,
  }));
  const annexes = placed.flatMap((norm) =>
    norm.anexos.map((annex) => {
      const entry = archived(`boletin-${n}-anexo-${lastSegment(annex.filenet_firmado)}.pdf`);
      return {
        boletin_numero: n,
        fecha,
        id_norma: norm.id_norma,
        norma: collapseSpaces(norm.nombre),
        nombre_anexo: annex.nombre_anexo,
        url: annex.filenet_firmado,
        bytes: entry?.bytes ?? null,
        copia: entry?.path ?? null,
      };
    }),
  );
  const separataFile = `boletin-${n}-separata${separatas.length > 1 ? "-1" : ""}.pdf`;
  const bulletin = {
    numero: n,
    fecha,
    normas: norms.length,
    anexos: annexes.length,
    url_boletin: index.boletin.url_boletin,
    url_separata: separatas.map((s) => s.url).join("; ") || null,
    copia_boletin: archived(`boletin-${n}.pdf`)?.path ?? null,
    copia_separata: archived(separataFile)?.path ?? null,
  };
  return { bulletin, norms, annexes };
}

async function processAll(): Promise<void> {
  const latest = new Map<string, ManifestEntry>();
  for (const entry of await readManifest(SOURCE)) latest.set(entry.filename, entry);
  // Only bulletins the download went through: the index of the one before the range is fetched just to stop.
  const coverage = await readCoverage();
  const indexes = [...latest.values()].filter((e) => {
    const n = /^boletin-(\d+)\.json$/.exec(e.filename)?.[1];
    const record = n ? coverage.get(Number(n)) : undefined;
    return record && record.estado !== "no_existe";
  });
  if (!indexes.length) {
    console.log("No hay boletines descargados en data/raw: no se normaliza.");
    return;
  }

  const bulletins: Row[] = [];
  const norms: Row[] = [];
  const annexes: Row[] = [];
  for (const entry of indexes) {
    const index = JSON.parse((await readRaw(join(ROOT, entry.path))).toString("utf8")) as BulletinIndex;
    const rows = bulletinRows(index, (filename) => latest.get(filename));
    bulletins.push(rows.bulletin);
    norms.push(...rows.norms);
    annexes.push(...rows.annexes);
  }
  bulletins.sort((a, b) => Number(a.numero) - Number(b.numero));
  norms.sort((a, b) => Number(a.boletin_numero) - Number(b.boletin_numero) || Number(a.id_norma) - Number(b.id_norma));
  annexes.sort((a, b) => Number(a.boletin_numero) - Number(b.boletin_numero) || Number(a.id_norma) - Number(b.id_norma));

  const common = { fuente: SITE, licencia: LICENSE, originales: indexes };
  const notes = [
    "Sale del índice que publica la API del boletín (obtenerBoletin/<número>/true), no del texto de los PDF.",
    "Los PDF se archivan tal cual se publicaron: algunos actos traen DNI o CUIL (D-04 en docs/decisiones.md).",
  ];
  const counts = await writeProcessedByYear(SOURCE, "boletines", bulletins, {
    titulo: "Boletín Oficial de la Ciudad: ediciones",
    descripcion: "Una edición del Boletín Oficial por fila, con enlaces al PDF oficial y a nuestra copia.",
    columnas: BULLETIN_COLUMNS,
    notas: notes,
    ...common,
  });
  await writeProcessedByYear(SOURCE, "normas", norms, {
    titulo: "Boletín Oficial de la Ciudad: normas y avisos",
    descripcion: "Una norma o aviso publicado por fila, con su sección, tipo, organismo y sumario.",
    columnas: NORM_COLUMNS,
    notas: [...notes, "El sumario de los edictos no se publica: nombra a particulares y a sus familiares."],
    ...common,
  });
  await writeProcessedByYear(SOURCE, "anexos", annexes, {
    titulo: "Boletín Oficial de la Ciudad: anexos",
    descripcion: "Un anexo de una norma por fila, con enlaces al PDF oficial y a nuestra copia.",
    columnas: ANNEX_COLUMNS,
    notas: notes,
    ...common,
  });
  console.log(`boletines: ${bulletins.length} (${[...counts].map(([y, c]) => `${y}: ${c}`).join(", ")})`);
  console.log(`normas: ${norms.length}, ocultos: ${norms.filter((r) => r.sumario_oculto).length}`);
  console.log(`anexos: ${annexes.length}, sin copia: ${annexes.filter((r) => !r.copia).length}`);
}

export async function run(args: string[]): Promise<void> {
  if (!args.includes("--solo-procesar")) await download(args);
  if (!args.includes("--solo-descarga")) await processAll();
}
