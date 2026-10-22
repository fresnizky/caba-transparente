/**
 * Constant pesos with INDEC's IPC (data/processed/indec-ipc/ipc_mensual.csv, region GBA). The series starts in
 * December 2016 and nothing is spliced in before it: amounts from months the index does not cover have no value in
 * constant pesos and are left out, and so are whole years with any month missing (2016 only has December).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { parseCsv } from "@ct/core";

import type { ConstantPesos } from "../src/types.ts";

export const REGION = "GBA";

export interface Deflator extends ConstantPesos {
  /** Amount in pesos of the reference month, or null if the index does not cover its month. */
  real: (amount: number, fecha: string | null) => number | null;
}

export function buildDeflator(rows: { periodo: string; region: string; indice: number }[], region = REGION): Deflator | null {
  const index = new Map(rows.filter((r) => r.region === region && r.indice > 0).map((r) => [r.periodo, r.indice]));
  const months = [...index.keys()].sort();
  const last = months.at(-1);
  if (!last) return null;
  const reference = index.get(last)!;
  // First year with its twelve months in the index.
  const firstYear = Number(months[0]!.slice(0, 4));
  const desde = months[0]!.endsWith("-01") ? firstYear : firstYear + 1;
  return {
    indice: "IPC de INDEC",
    region,
    referencia: last,
    desde,
    real: (amount, fecha) => {
      if (!fecha || Number(fecha.slice(0, 4)) < desde) return null;
      const value = index.get(fecha.slice(0, 7));
      return value ? (amount * reference) / value : null;
    },
  };
}

export function readDeflator(dir: string): Deflator | null {
  const path = join(dir, "ipc_mensual.csv");
  if (!existsSync(path)) return null;
  const [header = [], ...rows] = parseCsv(readFileSync(path, "utf8"));
  const col = (name: string) => header.indexOf(name);
  return buildDeflator(
    rows
      .filter((r) => r.length === header.length)
      .map((r) => ({ periodo: r[col("periodo")]!, region: r[col("region")]!, indice: Number(r[col("indice")]) })),
  );
}
