/**
 * Consumer price index (IPC) of INDEC, to show amounts in constant pesos:
 *   bun run scrape indec-ipc
 *
 * Downloads serie_ipc_divisiones.csv (INDEC, ";"-separated, Latin-1) and keeps the general level of every region,
 * one row per month, in data/processed/indec-ipc/ipc_mensual.csv. The series starts in December 2016 (base
 * dic-2016 = 100): there is no INDEC series before that, and none is spliced in from other sources.
 */

import { join } from "node:path";
import { fetchAndArchive, latestEntry, parseArNumber, ROOT, type Row, readRaw, writeProcessed, writeProcessedMeta } from "@ct/core";

export const SOURCE = "indec-ipc";
const URL = "https://www.indec.gob.ar/ftp/cuadros/economia/serie_ipc_divisiones.csv";
const FILENAME = "serie_ipc_divisiones.csv";
const OUTPUT = "ipc_mensual.csv";

export interface IpcRow {
  periodo: string;
  region: string;
  indice: number;
  variacion_mensual: number | null;
}

const HEADER = ["Codigo", "Descripcion", "Clasificador", "Periodo", "Indice_IPC", "v_m_IPC", "v_i_a_IPC", "Region"];

/** General level (code 0) of every region. Fails if INDEC changes the columns. */
export function parseIpc(text: string): IpcRow[] {
  const [head = "", ...lines] = text.split(/\r?\n/);
  const columns = head.split(";").map((c) => c.trim());
  if (HEADER.some((c, i) => columns[i] !== c)) throw new Error(`${FILENAME}: cambiaron las columnas (${columns.join(";")})`);
  const rows: IpcRow[] = [];
  for (const line of lines) {
    const c = line.split(";");
    if (c[0]?.trim() !== "0") continue;
    const period = c[3]?.trim() ?? "";
    if (!/^\d{6}$/.test(period)) throw new Error(`${FILENAME}: período inválido «${period}»`);
    const monthly = c[5]?.trim() ?? "";
    rows.push({
      periodo: `${period.slice(0, 4)}-${period.slice(4)}`,
      region: c[7]?.trim() ?? "",
      indice: parseArNumber(c[4] ?? ""),
      variacion_mensual: monthly === "" || monthly === "NA" ? null : parseArNumber(monthly),
    });
  }
  return rows.sort((a, b) => a.region.localeCompare(b.region) || a.periodo.localeCompare(b.periodo));
}

export async function run(): Promise<void> {
  const path = await fetchAndArchive(SOURCE, URL, FILENAME);
  console.log(path ? `${FILENAME}: nueva versión` : `${FILENAME}: sin cambios`);
  const entry = await latestEntry(SOURCE, FILENAME);
  if (!entry) throw new Error(`No hay ${FILENAME} en data/raw`);

  const rows = parseIpc(new TextDecoder("latin1").decode(await readRaw(join(ROOT, entry.path))));
  await writeProcessed(SOURCE, OUTPUT, rows as unknown as Row[], ["periodo", "region", "indice", "variacion_mensual"]);
  await writeProcessedMeta(SOURCE, OUTPUT, {
    titulo: "IPC de INDEC: nivel general por región",
    descripcion: "Índice de precios al consumidor, nivel general, por mes y región, de serie_ipc_divisiones.csv.",
    fuente: "https://www.indec.gob.ar/indec/web/Nivel4-Tema-3-5-31",
    licencia: "Datos públicos de INDEC: se usan citando la fuente",
    originales: [{ path: entry.path, url: entry.url, sha256: entry.sha256 }],
    columnas: {
      periodo: "Mes (AAAA-MM).",
      region: "Región del IPC: Nacional, GBA, Pampeana, Noreste, Noroeste, Cuyo o Patagonia.",
      indice: "Nivel general, base diciembre de 2016 = 100.",
      variacion_mensual: "Variación porcentual respecto del mes anterior, según INDEC. Vacía en diciembre de 2016.",
    },
    notas: [
      "La serie empieza en diciembre de 2016. No se empalma con series anteriores ni de otras fuentes.",
      "La web usa la región GBA (la Ciudad y los partidos del conurbano) para expresar montos en pesos constantes.",
    ],
  });
  const periods = rows.map((r) => r.periodo);
  console.log(`${OUTPUT}: ${rows.length} filas, ${periods[0]} a ${periods.at(-1)}`);
}
