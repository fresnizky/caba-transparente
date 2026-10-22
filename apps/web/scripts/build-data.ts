/**
 * Prepares the site data before Vite serves or builds it. Reads sources.yaml, data/raw/<id>/manifest.jsonl,
 * data/processed/<id>/ and data/curado/, and writes JSON to public/data:
 *   catalogo.json                    sources and processed datasets (/fuentes, /datos)
 *   no-publicado.json                what should be public and is not (/no-publicado)
 *   compras/resumen.json             Buenos Aires Compras overview (/, /compras)
 *   compras/organismos.json          every agency (/organismos)
 *   compras/organismos/<id>.json     one agency (/organismos/<id>)
 *   compras/proveedores.json         every company; individuals are not listed (/proveedores)
 *   compras/proveedores/<cuit>.json  one company (/proveedores/<cuit>)
 *   senales.json                     signals (/senales)
 *   boletin/indice.json              Official Bulletin editions (/boletin)
 *   boletin/<numero>.json            one edition with its acts (/boletin/<numero>)
 *
 * The processed data is not in git (D-04, D-05). Each source is read from the first folder of CT_DATA_DIR that has
 * it, and then from data/ in this checkout (data-dirs.ts). A source with no processed data leaves its pages empty.
 * Amounts in constant pesos need data/processed/indec-ipc (`bun run scrape indec-ipc`), and dollars and euros in the
 * yearly chart need data/processed/bcra-cotizaciones (`bun run scrape bcra-cotizaciones`); without them they are null.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ROOT } from "@ct/core";
import { parse as parseYaml } from "yaml";

import type { NotPublished, Origin } from "../src/types.ts";
import { buildBoletin } from "./boletin.ts";
import { readConverter } from "./cambio.ts";
import { ARCHIVE_URL, buildCatalog, readManifest } from "./catalogo.ts";
import { buildCompras, readCompras } from "./compras.ts";
import { dataDirs } from "./data-dirs.ts";
import { readDeflator } from "./inflacion.ts";
import { buildSenales } from "./senales.ts";

const dirs = dataDirs();
// Written to a temporary folder that replaces public/data in one step, so the dev server never serves half of it.
const TARGET = join(import.meta.dir, "..", "public", "data");
const OUT = `${TARGET}.tmp-${process.pid}`;

const started = Date.now();
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const write = (path: string, data: unknown) => {
  mkdirSync(join(OUT, path, ".."), { recursive: true });
  writeFileSync(join(OUT, path), JSON.stringify(data));
};

const catalog = await buildCatalog(dirs);
/** Link to a source's processed data in R2, only once it is there. */
const dataUrl = (id: string) =>
  catalog.datasets.some((d) => d.fuente === id && d.publicado) ? `${ARCHIVE_URL}/data/processed/${id}/` : null;
write("catalogo.json", catalog);

const notPublished = parseYaml(readFileSync(join(ROOT, "data", "curado", "no-publicado.yaml"), "utf8")) as NotPublished[];
const incomplete = notPublished.filter((i) => !i.id || !i.titulo || !i.descripcion || !i.evidencia || !i.organismo);
if (incomplete.length) throw new Error(`no-publicado.yaml: faltan campos en ${incomplete.map((i) => i.id ?? i.titulo).join(", ")}`);
write("no-publicado.json", notPublished);

const comprasDir = dirs.processed("compras-bac");
const deflator = readDeflator(dirs.processed("indec-ipc"));
const converter = readConverter(dirs.processed("bcra-cotizaciones"));
let summary = "sin datos de compras-bac";
if (existsSync(comprasDir)) {
  const { processes, awards } = await readCompras(comprasDir);
  const award = readManifest(dirs.raw("compras-bac"))
    .filter((m) => m.filename === "award.csv")
    .at(-1);
  const origin: Origin = {
    nombre: "Buenos Aires Compras (datos abiertos)",
    url: "https://data.buenosaires.gob.ar/dataset/buenos-aires-compras",
    descargado: award?.fetched_at ?? null,
    datos: dataUrl("compras-bac"),
  };
  const pages = buildCompras(processes, awards, origin, deflator, converter);
  write("compras/resumen.json", pages.summary);
  write("compras/organismos.json", pages.agencies);
  for (const a of pages.agencyDetails) write(`compras/organismos/${a.id}.json`, a);
  write("compras/proveedores.json", pages.suppliers);
  for (const s of pages.supplierDetails) write(`compras/proveedores/${s.cuit}.json`, s);
  write("senales.json", buildSenales(processes, awards, origin));
  summary = `${processes.length} procesos, ${awards.length} adjudicaciones, ${pages.agencies.length} organismos, ${pages.suppliers.length} empresas`;
  summary += deflator ? `, pesos de ${deflator.referencia} desde ${deflator.desde}` : ", sin IPC (solo pesos nominales)";
  summary += converter ? `, ${converter.monedas.join(" y ")} convertidos` : ", sin cotizaciones (otras monedas aparte)";
} else {
  console.warn(`No está ${comprasDir}: las páginas de compras quedan vacías (ver CT_DATA_DIR en este archivo).`);
}

const boletinDir = dirs.processed("boletin-oficial");
if (existsSync(boletinDir)) {
  const last = readManifest(dirs.raw("boletin-oficial")).at(-1);
  const { index, details } = await buildBoletin(boletinDir, {
    nombre: "Boletín Oficial de la Ciudad (API)",
    url: "https://boletinoficial.buenosaires.gob.ar",
    descargado: last?.fetched_at ?? null,
    datos: dataUrl("boletin-oficial"),
  });
  write("boletin/indice.json", index);
  for (const d of details) write(`boletin/${d.numero}.json`, d);
  summary += `; ${details.length} boletines`;
}

const old = `${TARGET}.old-${process.pid}`;
if (existsSync(TARGET)) renameSync(TARGET, old);
renameSync(OUT, TARGET);
rmSync(old, { recursive: true, force: true });
console.log(`Datos listos en ${Math.round((Date.now() - started) / 1000)} s: ${catalog.datasets.length} datasets; ${summary}.`);
