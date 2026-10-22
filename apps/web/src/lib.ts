/** Data loading and formatting shared by the pages. */

import { notFound } from "@tanstack/react-router";

export { agencyName } from "./names.ts";

const cache = new Map<string, Promise<unknown>>();

/** Fetches a file from public/data once per visit. A missing file is a 404 page, not an error. */
export function loadData<T>(path: string): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined;
  if (!p) {
    p = fetch(`/data/${path}`).then((r) => {
      // Vite answers unknown paths with index.html: anything that is not JSON is a missing file.
      if (!r.ok || !r.headers.get("content-type")?.includes("json")) throw notFound();
      return r.json() as Promise<T>;
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p;
}

const ar = (n: number, digits = 0) => n.toLocaleString("es-AR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const int = (n: number) => ar(n);

/** "1 adjudicación", "12 adjudicaciones". */
export const count = (n: number, one: string, many: string) => `${ar(n)} ${n === 1 ? one : many}`;

export function percent(share: number): string {
  if (share > 0 && share < 0.001) return "< 0,1 %";
  return `${ar(share * 100, share > 0 && share < 0.01 ? 1 : 0)} %`;
}

/** Pesos in words, the way the press writes them: "$ 2,2 billones", "$ 436 mil millones", "$ 12,3 millones". */
export function pesos(n: number): string {
  const abs = Math.abs(n);
  const short = (v: number) => ar(v, v < 10 ? 1 : 0);
  if (abs >= 1e12) return `$ ${short(n / 1e12)} billones`;
  if (abs >= 1e9) return `$ ${short(n / 1e9)} mil millones`;
  if (abs >= 1e6) return `$ ${short(n / 1e6)} millones`;
  return `$ ${ar(n)}`;
}

export function money(n: number | null, currency: string | null): string {
  if (n === null) return "Sin monto";
  if (!currency || currency === "ARS") return pesos(n);
  const symbol = currency === "USD" ? "US$" : currency === "EUR" ? "€" : currency;
  return `${symbol} ${ar(n)}`;
}

/** 2026-10-19 or 2026-10-19T03:17:34Z → 19/10/2026. */
export const date = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "Sin fecha");

export function bytes(n: number): string {
  if (n >= 1e9) return `${ar(n / 1e9, 1)} GB`;
  if (n >= 1e6) return `${ar(n / 1e6, n < 1e7 ? 1 : 0)} MB`;
  return `${ar(Math.max(1, n / 1e3))} KB`;
}

const PROCEDURES: Record<string, string> = {
  "LICITACION PUBLICA": "Licitación pública",
  "LICITACION PRIVADA": "Licitación privada",
  "CONTRATACION DIRECTA": "Contratación directa",
  "CONTRATACION MENOR": "Contratación menor",
  "CONCURSO PUBLICO": "Concurso público",
};

export const procedure = (p: string | null) => (p ? (PROCEDURES[p] ?? p) : "Sin dato");

const STATUSES: Record<string, string> = {
  complete: "Terminado",
  active: "En curso",
  cancelled: "Dejado sin efecto",
  unsuccessful: "Desierto o fracasado",
};

export const status = (s: string | null) => (s ? (STATUSES[s] ?? s) : "Sin dato");

export const HIDDEN_TITLE = "Título oculto: nombra a un paciente";

/** Accent-insensitive search key. */
export const searchKey = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
