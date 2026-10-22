/**
 * Official Bulletin for the site: the index of each edition (sections, acts and their links), from
 * data/processed/boletin-oficial/{boletines,normas}/<year>.csv. Only what the API index publishes: the summaries the
 * collector hid stay hidden, and nothing comes from the text of the PDFs (D-04).
 */

import { join } from "node:path";

import type { BulletinDetail, BulletinIndex, BulletinNorm, Origin } from "../src/types.ts";
import { csvFiles, readRows } from "./csv.ts";

const text = (s: string | undefined) => (s ? s : null);

/** Order of the sections in the printed bulletin; unknown ones go last. */
const SECTIONS = [
  "Poder Legislativo",
  "Poder Ejecutivo",
  "Poder Judicial",
  "Organos de Control",
  "Licitaciones",
  "Trimestrales",
  "Comunicados y Avisos",
  "Edictos Oficiales",
  "Edictos Particulares",
];
const sectionRank = (s: string) => (SECTIONS.includes(s) ? SECTIONS.indexOf(s) : SECTIONS.length);

export function toNorm(r: Record<string, string>): BulletinNorm {
  const oculto = r.sumario_oculto === "true";
  return {
    id: r.id_norma!,
    seccion: r.seccion || "Sin sección",
    tipo: r.tipo ?? "",
    organismo: text(r.organismo),
    nombre: r.nombre ?? "",
    // Defensive: the processed CSV already leaves hidden summaries empty.
    sumario: oculto ? null : text(r.sumario),
    oculto,
    anexos: Number(r.anexos) || 0,
    url: text(r.url_norma),
  };
}

export async function buildBoletin(dir: string, origin: Origin): Promise<{ index: BulletinIndex; details: BulletinDetail[] }> {
  // The API lists some acts twice in the same edition (under two groupings): one row per act.
  const byBulletin = new Map<number, Map<string, BulletinNorm>>();
  for (const file of csvFiles(join(dir, "normas"))) {
    for await (const r of readRows(file)) {
      const numero = Number(r.boletin_numero);
      let norms = byBulletin.get(numero);
      if (!norms) byBulletin.set(numero, (norms = new Map()));
      const norm = toNorm(r);
      if (!norms.has(norm.id)) norms.set(norm.id, norm);
    }
  }

  const details: BulletinDetail[] = [];
  for (const file of csvFiles(join(dir, "boletines"))) {
    for await (const b of readRows(file)) {
      const numero = Number(b.numero);
      const items = [...(byBulletin.get(numero)?.values() ?? [])].sort((a, b) => sectionRank(a.seccion) - sectionRank(b.seccion));
      const sections = new Map<string, number>();
      for (const n of items) sections.set(n.seccion, (sections.get(n.seccion) ?? 0) + 1);
      details.push({
        origen: origin,
        numero,
        fecha: b.fecha!,
        normas: items.length,
        anexos: items.reduce((sum, n) => sum + n.anexos, 0),
        secciones: [...sections].map(([seccion, normas]) => ({ seccion, normas })),
        url: text(b.url_boletin),
        urlSeparata: text(b.url_separata),
        items,
      });
    }
  }
  details.sort((a, b) => b.numero - a.numero);
  return {
    index: { origen: origin, boletines: details.map(({ origen: _, items: __, ...summary }) => summary) },
    details,
  };
}
