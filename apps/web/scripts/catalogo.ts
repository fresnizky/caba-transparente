/**
 * Catalog for /fuentes and /datos: sources.yaml plus what manifest.jsonl says was downloaded, and every processed CSV
 * with its <file>.meta.json, linked to its public copy in R2 (D-05).
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { type ManifestEntry, type ProcessedMeta, ROOT } from "@ct/core";
import { parse as parseYaml } from "yaml";

import type { Catalog, DatasetFile, DatasetInfo, SourceInfo } from "../src/types.ts";
import type { DataDirs } from "./data-dirs.ts";

export const ARCHIVE_URL = "https://archivo.caba-transparente.com.ar";

interface SourceEntry {
  id: string;
  nombre: string;
  organismo: string;
  url: string;
  formato: string;
  frecuencia: string;
  estado: string;
  datos_personales?: string;
}

/** Entries of data/raw/<id>/manifest.jsonl, given that folder. */
export function readManifest(rawDir: string): ManifestEntry[] {
  const path = join(rawDir, "manifest.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ManifestEntry);
}

/** Every CSV under dir, recursively, as paths relative to it. */
function csvFiles(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return csvFiles(path, base);
      return name.endsWith(".csv") ? [relative(base, path)] : [];
    });
}

/** Lines minus the header, without parsing: fields with line breaks would add some, and none of ours have them. */
function countRows(path: string): number {
  const text = readFileSync(path, "utf8");
  let lines = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) lines++;
  return Math.max(0, lines - 1);
}

/** "Buenos Aires Compras: procesos de compra (2025)" → "Buenos Aires Compras: procesos de compra". */
const datasetTitle = (title: string) => title.replace(/\s*\([^)]*\)$/, "");

/** Whether a public file answers in R2. One request per source; offline counts as not published. */
async function inArchive(url: string): Promise<boolean> {
  try {
    return (await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5_000) })).ok;
  } catch {
    return false;
  }
}

export async function buildCatalog(dirs: DataDirs): Promise<Catalog> {
  const entries = (parseYaml(readFileSync(join(ROOT, "sources.yaml"), "utf8")) as { fuentes: SourceEntry[] }).fuentes;

  const datasets: DatasetInfo[] = [];
  for (const source of entries) {
    const dir = dirs.processed(source.id);
    const groups = new Map<string, DatasetInfo>();
    for (const file of csvFiles(dir)) {
      const path = join(dir, file);
      const metaPath = `${path}.meta.json`;
      const meta = existsSync(metaPath) ? (JSON.parse(readFileSync(metaPath, "utf8")) as ProcessedMeta) : null;
      const parts = file.split("/");
      const nombre = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
      let dataset = groups.get(nombre);
      if (!dataset) {
        dataset = {
          fuente: source.id,
          nombre,
          titulo: meta ? datasetTitle(meta.titulo) : file,
          descripcion: meta?.descripcion ?? "",
          oficial: meta?.fuente ?? source.url,
          licencia: meta?.licencia ?? "",
          columnas: meta?.columnas ?? {},
          notas: meta?.notas ?? [],
          publicado: false,
          archivos: [],
        };
        groups.set(nombre, dataset);
      }
      const archivo: DatasetFile = {
        parte: parts.at(-1)!.replace(/\.csv$/, ""),
        filas: countRows(path),
        bytes: statSync(path).size,
        url: `${ARCHIVE_URL}/data/processed/${source.id}/${file}`,
      };
      dataset.archivos.push(archivo);
    }
    // Newest part first: that is what people look for.
    for (const d of groups.values()) d.archivos.sort((a, b) => b.parte.localeCompare(a.parte));
    const first = [...groups.values()][0]?.archivos[0];
    const published = first ? await inArchive(first.url) : false;
    for (const d of groups.values()) d.publicado = published;
    datasets.push(...groups.values());
  }

  const fuentes: SourceInfo[] = entries.map((s) => {
    const manifest = readManifest(dirs.raw(s.id));
    // The manifest keeps every version of every file: the size is that of the latest version of each.
    const latest = new Map<string, ManifestEntry>();
    for (const m of manifest) latest.set(m.filename, m);
    return {
      id: s.id,
      nombre: s.nombre,
      organismo: s.organismo,
      url: s.url,
      formato: s.formato,
      frecuencia: s.frecuencia,
      estado: s.estado,
      datosPersonales: s.datos_personales ?? null,
      archivos: latest.size,
      bytes: [...latest.values()].reduce((sum, m) => sum + m.bytes, 0),
      ultimaDescarga:
        manifest
          .map((m) => m.fetched_at)
          .sort()
          .at(-1) ?? null,
      datasets: datasets.filter((d) => d.fuente === s.id).length,
    };
  });

  return { generadoEl: new Date().toISOString(), fuentes, datasets };
}
