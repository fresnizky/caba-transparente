/**
 * Dollars and euros to pesos with the BCRA rate (data/processed/bcra-cotizaciones/cotizaciones_mensuales.csv): the
 * monthly average of the month of each award. An amount whose month has no rate is not converted.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseCsv } from "@ct/core";

import type { Exchange } from "../src/types.ts";

export interface Converter extends Exchange {
  /** Nominal pesos of an amount in another currency, or null if there is no rate for its month. */
  toPesos: (amount: number, currency: string, fecha: string | null) => number | null;
}

export function buildConverter(rows: { periodo: string; moneda: string; promedio: number }[]): Converter | null {
  const rates = new Map(rows.filter((r) => r.promedio > 0).map((r) => [`${r.moneda}|${r.periodo}`, r.promedio]));
  if (!rates.size) return null;
  return {
    fuente: "BCRA, Estadísticas Cambiarias",
    monedas: [...new Set(rows.map((r) => r.moneda))].sort(),
    toPesos: (amount, currency, fecha) => {
      const rate = fecha ? rates.get(`${currency}|${fecha.slice(0, 7)}`) : undefined;
      return rate ? amount * rate : null;
    },
  };
}

export function readConverter(dir: string): Converter | null {
  const path = join(dir, "cotizaciones_mensuales.csv");
  if (!existsSync(path)) return null;
  const [header = [], ...rows] = parseCsv(readFileSync(path, "utf8"));
  const col = (name: string) => header.indexOf(name);
  return buildConverter(
    rows
      .filter((r) => r.length === header.length)
      .map((r) => ({ periodo: r[col("periodo")]!, moneda: r[col("moneda")]!, promedio: Number(r[col("promedio")]) })),
  );
}
