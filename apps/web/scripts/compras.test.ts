import { describe, expect, test } from "bun:test";

import { agencyName } from "../src/names.ts";
import type { Origin } from "../src/types.ts";
import { buildConverter } from "./cambio.ts";
import { type Award, buildCompras, coverage, type Process, toAward, toProcess } from "./compras.ts";
import { buildDeflator } from "./inflacion.ts";
import { buildSenales } from "./senales.ts";

const origin: Origin = { nombre: "BAC", url: "https://example.org", descargado: null, datos: null };

const process = (p: Partial<Process> & { id: string }): Process => ({
  fecha: "2025-03-01",
  titulo: "Compra",
  oculto: false,
  estado: "complete",
  procedimiento: "LICITACION PUBLICA",
  organismoId: "1",
  organismo: "MINISTERIO DE SALUD",
  moneda: "ARS",
  estimado: 1_000_000,
  url: null,
  ...p,
});

const award = (a: Partial<Award> & { ocid: string; procesoId: string }): Award => ({
  fecha: "2025-04-01",
  titulo: "Compra",
  oculto: false,
  monto: 1_000_000,
  moneda: "ARS",
  proveedorTipo: "juridica",
  cuit: "30111111118",
  proveedor: "EMPRESA S.A.",
  organismoId: "1",
  organismo: "MINISTERIO DE SALUD",
  procedimiento: "LICITACION PUBLICA",
  url: null,
  ...a,
});

describe("toProcess and toAward", () => {
  const processes = new Map([
    ["P-1", toProcess({ proceso_id: "P-1", moneda: "ARS", unidad_ejecutora_id: "CABA-UE-401", monto_estimado: "" })],
  ]);

  test("the agency id keeps only the number and an empty estimate is null", () => {
    expect(processes.get("P-1")).toMatchObject({ organismoId: "401", estimado: null });
  });

  test("an award with no currency takes the one of its process", () => {
    expect(toAward({ ocid: "o-1", proceso_id: "P-1", moneda: "", monto: "10" }, processes).moneda).toBe("ARS");
    expect(toAward({ ocid: "o-2", proceso_id: "P-1", moneda: "USD", monto: "10" }, processes).moneda).toBe("USD");
  });

  test("an individual never carries CUIT or name, even if the row had them", () => {
    const a = toAward(
      { ocid: "o-3", proceso_id: "P-1", proveedor_tipo: "humana", proveedor_cuit: "20123456786", proveedor_nombre: "X" },
      processes,
    );
    expect(a).toMatchObject({ proveedorTipo: "humana", cuit: null, proveedor: null });
  });
});

describe("buildCompras", () => {
  const processes = [
    process({ id: "P-1" }),
    process({ id: "P-2", procedimiento: "CONTRATACION DIRECTA" }),
    process({ id: "P-3", moneda: "USD" }),
  ];
  const awards = [
    award({ ocid: "o-1", procesoId: "P-1", monto: 3_000_000 }),
    award({ ocid: "o-2", procesoId: "P-2", monto: 1_000_000, procedimiento: "CONTRATACION DIRECTA" }),
    award({ ocid: "o-3", procesoId: "P-3", monto: 500, moneda: "USD" }),
    award({ ocid: "o-4", procesoId: "P-1", monto: 2_000_000, proveedorTipo: "humana", cuit: null, proveedor: null }),
  ];
  const pages = buildCompras(processes, awards, origin);

  test("peso totals do not add other currencies, which are kept apart", () => {
    expect(pages.summary.totales.montoArs).toBe(6_000_000);
    expect(pages.summary.totales.otrasMonedas).toEqual({ USD: 500 });
  });

  test("individuals are only a total: no supplier page and no row in an agency", () => {
    expect(pages.suppliers.map((s) => s.cuit)).toEqual(["30111111118"]);
    expect(pages.summary.personasHumanas).toMatchObject({ adjudicaciones: 1, montoArs: 2_000_000, montoReal: null });
    const agency = pages.agencyDetails[0]!;
    expect(agency.proveedores.map((p) => p.cuit)).toEqual(["30111111118"]);
    expect(agency.personasHumanas.montoArs).toBe(2_000_000);
  });

  test("direct contracting is measured by amount", () => {
    expect(pages.agencies[0]!.directaMonto).toBeCloseTo(1 / 6);
  });

  test("the current year is not complete until mid December", () => {
    expect(coverage(processes, awards)).toMatchObject({ hasta: "2025-04-01", ultimoAnioCompleto: 2024 });
    expect(coverage([process({ id: "P-9", fecha: "2025-12-30" })], []).ultimoAnioCompleto).toBe(2025);
  });
});

describe("buildSenales", () => {
  const big = (i: number, cuit: string, monto: number) =>
    award({ ocid: `c-${i}`, procesoId: `C-${i}`, organismoId: "2", organismo: "ENTE", cuit, proveedor: cuit, monto });
  const processes = [
    process({ id: "P-1", estimado: 1_000_000 }),
    process({ id: "P-2", estimado: 500 }),
    process({ id: "P-3", estado: "unsuccessful" }),
    ...[1, 2, 3].map((i) => process({ id: `C-${i}`, organismoId: "2", organismo: "ENTE", estimado: 0 })),
  ];
  const awards = [
    award({ ocid: "o-1", procesoId: "P-1", monto: 2_500_000 }),
    award({ ocid: "o-2", procesoId: "P-2", monto: 200_000 }),
    big(1, "30000000001", 900_000_000),
    big(2, "30000000002", 50_000_000),
    big(3, "30000000003", 50_000_000),
  ];
  const signals = Object.fromEntries(buildSenales(processes, awards, origin).senales.map((s) => [s.id, s]));

  test("awarded at least twice the estimate", () => {
    expect(signals["adjudicado-sobre-estimado"]!.totalCasos).toBe(1);
  });

  test("symbolic estimate", () => {
    expect(signals["estimado-simbolico"]!.totalCasos).toBe(1);
  });

  test("concentration names the agency and its company, above the minimum amount", () => {
    const c = signals.concentracion!;
    expect(c.totalCasos).toBe(1);
    expect(c.casos[0]).toMatchObject({ titulo: "Ente", organismoId: "2" });
  });

  test("unsuccessful processes", () => {
    expect(signals.fracasadas!.cifra).toBe("1 de cada 6");
  });
});

test("agencyName only fixes names written in capitals", () => {
  expect(agencyName("DIR. GRAL. DE COMPRAS Y CONTRATACIONES")).toBe("Dir. Gral. de Compras y Contrataciones");
  expect(agencyName("MINISTERIO DE EDUCACIÓN")).toBe("Ministerio de Educación");
  expect(agencyName("UPE Eco Parque")).toBe("UPE Eco Parque");
});

describe("constant pesos", () => {
  const ipc = [
    { periodo: "2016-12", region: "GBA", indice: 100 },
    ...Array.from({ length: 12 }, (_, i) => ({ periodo: `2017-${String(i + 1).padStart(2, "0")}`, region: "GBA", indice: 100 + i })),
    { periodo: "2018-01", region: "GBA", indice: 200 },
    { periodo: "2018-01", region: "Nacional", indice: 999 },
  ];
  const deflator = buildDeflator(ipc)!;

  test("uses the last month of the region as reference and starts with the first full year", () => {
    expect(deflator).toMatchObject({ indice: "IPC de INDEC", region: "GBA", referencia: "2018-01", desde: 2017 });
    expect(deflator.real(1_000, "2017-01-15")).toBe(2_000);
    expect(deflator.real(1_000, "2018-01-02")).toBe(1_000);
  });

  test("months the index does not cover have no value, December 2016 included", () => {
    expect(deflator.real(1_000, "2016-12-20")).toBeNull();
    expect(deflator.real(1_000, "2015-06-01")).toBeNull();
    expect(deflator.real(1_000, "2018-05-01")).toBeNull();
  });

  test("uncovered years stay out of constant pesos instead of counting as zero", () => {
    const processes = [process({ id: "P-1", fecha: "2016-03-01" }), process({ id: "P-2", fecha: "2017-01-10" })];
    const awards = [
      award({ ocid: "o-1", procesoId: "P-1", fecha: "2016-03-01", monto: 5_000 }),
      award({ ocid: "o-2", procesoId: "P-2", fecha: "2017-01-10", monto: 1_000 }),
      award({ ocid: "o-3", procesoId: "P-2", fecha: "2017-01-10", monto: 7, moneda: "USD" }),
    ];
    const { summary } = buildCompras(processes, awards, origin, deflator);
    expect(summary.constantes).toMatchObject({ referencia: "2018-01", desde: 2017 });
    expect(summary.porAnio.map((y) => [y.anio, y.montoArs, y.montoReal])).toEqual([
      [2016, 5_000, null],
      [2017, 1_000, 2_000],
    ]);
    expect(summary.totales).toMatchObject({ montoArs: 6_000, montoReal: 2_000 });
  });
});

describe("other currencies in the yearly rows", () => {
  const converter = buildConverter([
    { periodo: "2017-01", moneda: "USD", promedio: 16 },
    { periodo: "2017-01", moneda: "EUR", promedio: 17 },
  ])!;
  const deflator = buildDeflator(
    Array.from({ length: 12 }, (_, i) => ({
      periodo: `2017-${String(i + 1).padStart(2, "0")}`,
      region: "GBA",
      indice: i === 0 ? 100 : 200,
    })),
  )!;
  const processes = [process({ id: "P-1", fecha: "2017-01-10", moneda: "USD" })];
  const awards = [
    award({ ocid: "o-1", procesoId: "P-1", fecha: "2017-01-10", monto: 10, moneda: "USD" }),
    award({ ocid: "o-2", procesoId: "P-1", fecha: "2017-01-10", monto: 10, moneda: "EUR" }),
    award({ ocid: "o-3", procesoId: "P-1", fecha: "2017-05-10", monto: 10, moneda: "USD" }),
    award({ ocid: "o-4", procesoId: "P-1", fecha: "2017-01-10", monto: 100, moneda: "ARS" }),
  ];

  test("converts with the rate of the month, apart from the peso amounts, and skips months without a rate", () => {
    const { summary } = buildCompras(processes, awards, origin, deflator, converter);
    const y = summary.porAnio[0]!;
    expect(y).toMatchObject({ anio: 2017, montoArs: 100, otras: { montoArs: 330, montoReal: 660 } });
    expect(y.otras?.porMoneda).toEqual({
      USD: { monto: 10, montoArs: 160, montoReal: 320 },
      EUR: { monto: 10, montoArs: 170, montoReal: 340 },
    });
    expect(summary.cambio).toEqual({ fuente: "BCRA, Estadísticas Cambiarias", monedas: ["EUR", "USD"] });
    expect(summary.totales.otrasMonedas).toEqual({ USD: 20, EUR: 10 });
  });

  test("without rates there is nothing converted", () => {
    expect(buildCompras(processes, awards, origin).summary.porAnio[0]!.otras).toBeNull();
  });
});
