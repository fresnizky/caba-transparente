/**
 * Exchange rates of the BCRA, to convert awards in dollars and euros to pesos:
 *   bun run scrape bcra-cotizaciones
 *
 * Asks the Estadísticas Cambiarias API (api.bcra.gob.ar/estadisticascambiarias/v1.0) one year at a time for each
 * currency, from 2014 (the first year of Buenos Aires Compras). Closed years are read from data/raw and not asked
 * again; the current year is downloaded on every run. Writes the monthly average of the daily rate ("tipo de
 * cotización", pesos per unit) to data/processed/bcra-cotizaciones/cotizaciones_mensuales.csv.
 */

import { join } from "node:path";

import { fetchAndArchive, fetchOrReuse, latestEntry, ROOT, type Row, readRaw, sleep, writeProcessed, writeProcessedMeta } from "@ct/core";

export const SOURCE = "bcra-cotizaciones";
const API = "https://api.bcra.gob.ar/estadisticascambiarias/v1.0/Cotizaciones";
const CURRENCIES = ["USD", "EUR"] as const;
const START_YEAR = 2014;
const OUTPUT = "cotizaciones_mensuales.csv";

interface ApiResponse {
  results: { fecha: string; detalle: { codigoMoneda: string; tipoCotizacion: number }[] }[];
}

export interface MonthlyRate {
  periodo: string;
  moneda: string;
  promedio: number;
  dias: number;
}

/** Monthly average of the daily rates of one currency. A day listed twice counts once. */
export function monthlyRates(responses: ApiResponse[], currency: string): MonthlyRate[] {
  const daily = new Map<string, number>();
  for (const r of responses)
    for (const day of r.results) {
      const rate = day.detalle.find((d) => d.codigoMoneda === currency)?.tipoCotizacion;
      if (rate && rate > 0) daily.set(day.fecha, rate);
    }
  const months = new Map<string, number[]>();
  for (const [fecha, rate] of daily) {
    const list = months.get(fecha.slice(0, 7)) ?? [];
    list.push(rate);
    months.set(fecha.slice(0, 7), list);
  }
  return [...months]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodo, rates]) => ({
      periodo,
      moneda: currency,
      promedio: Math.round((rates.reduce((s, r) => s + r, 0) / rates.length) * 1e4) / 1e4,
      dias: rates.length,
    }));
}

/** One year of one currency; for the current year it ends today (the API rejects future dates). */
function url(currency: string, year: number): string {
  const today = new Date().toISOString().slice(0, 10);
  const end = `${year}-12-31` < today ? `${year}-12-31` : today;
  return `${API}/${currency}?fechadesde=${year}-01-01&fechahasta=${end}&limit=1000`;
}

export async function run(): Promise<void> {
  const currentYear = new Date().getFullYear();
  const rows: MonthlyRate[] = [];
  const originals = [];
  for (const currency of CURRENCIES) {
    const responses: ApiResponse[] = [];
    for (let year = START_YEAR; year <= currentYear; year++) {
      const filename = `cotizaciones-${currency}-${year}.json`;
      let bytes: Buffer;
      if (year < currentYear) bytes = await fetchOrReuse(SOURCE, url(currency, year), filename);
      else {
        await fetchAndArchive(SOURCE, url(currency, year), filename);
        await sleep(1000);
        const entry = await latestEntry(SOURCE, filename);
        if (!entry) throw new Error(`No hay ${filename} en data/raw`);
        bytes = await readRaw(join(ROOT, entry.path));
      }
      const response = JSON.parse(bytes.toString("utf8")) as ApiResponse;
      if (!Array.isArray(response.results)) throw new Error(`${filename}: respuesta inesperada del BCRA`);
      responses.push(response);
      const entry = await latestEntry(SOURCE, filename);
      if (entry) originals.push({ path: entry.path, url: entry.url, sha256: entry.sha256 });
    }
    const monthly = monthlyRates(responses, currency);
    rows.push(...monthly);
    console.log(`${currency}: ${monthly.length} meses, ${monthly[0]?.periodo} a ${monthly.at(-1)?.periodo}`);
  }

  await writeProcessed(SOURCE, OUTPUT, rows as unknown as Row[], ["periodo", "moneda", "promedio", "dias"]);
  await writeProcessedMeta(SOURCE, OUTPUT, {
    titulo: "BCRA: cotizaciones mensuales del dólar y el euro",
    descripcion: "Promedio mensual de la cotización diaria en pesos del dólar y el euro, de la API de Estadísticas Cambiarias del BCRA.",
    fuente: "https://www.bcra.gob.ar/apis-banco-central/",
    licencia: "Datos públicos del BCRA: se usan citando la fuente",
    originales: originals,
    columnas: {
      periodo: "Mes (AAAA-MM).",
      moneda: "USD o EUR.",
      promedio: "Promedio de la cotización diaria del mes («tipoCotizacion»), en pesos por unidad.",
      dias: "Cantidad de días con cotización en el mes.",
    },
    notas: [
      "Para el dólar no es exactamente la Comunicación A 3500: difiere en centavos. Se usa esta serie porque trae el dólar y el euro de la misma fuente.",
      "La web convierte cada adjudicación en dólares o euros con el promedio del mes de su fecha.",
    ],
  });
}
