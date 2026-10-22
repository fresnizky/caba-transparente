import { expect, test } from "bun:test";

import { monthlyRates } from "./bcra-cotizaciones.ts";

const day = (fecha: string, codigoMoneda: string, tipoCotizacion: number) => ({ fecha, detalle: [{ codigoMoneda, tipoCotizacion }] });

test("averages each month and counts a repeated day once", () => {
  const rates = monthlyRates(
    [
      { results: [day("2025-01-02", "USD", 1000), day("2025-01-03", "USD", 1010), day("2025-01-03", "USD", 1010)] },
      { results: [day("2025-02-03", "USD", 1100), day("2025-02-03", "EUR", 1200), day("2025-02-04", "USD", 0)] },
    ],
    "USD",
  );
  expect(rates).toEqual([
    { periodo: "2025-01", moneda: "USD", promedio: 1005, dias: 2 },
    { periodo: "2025-02", moneda: "USD", promedio: 1100, dias: 1 },
  ]);
});
