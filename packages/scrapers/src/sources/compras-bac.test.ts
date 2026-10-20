import { describe, expect, test } from "bun:test";

import {
  type AwardSummary,
  addAwardRow,
  addTenderRow,
  type ProcessSummary,
  processRow,
  supplierFields,
  titleFields,
} from "./compras-bac.ts";

const tenderRow = (over: Partial<Parameters<typeof addTenderRow>[2]> = {}) => ({
  ocid: "ocds-bulbcf-101-0001-LPU26-1",
  date: "2026-03-02T10:00:00-03:00",
  id: "101-0001-LPU26",
  title: "Compra de prueba ",
  description: "Rubro de prueba",
  status: "complete",
  entityId: "CABA-UE-101 ",
  entityName: "Unidad de prueba",
  amount: "1000.0",
  currency: "ARS",
  method: "open",
  methodDetails: "LICITACION PUBLICA",
  category: "goods",
  additionalCategory: "",
  periodEnd: "2026-03-20T11:00:00-03:00",
  documentUrl: "https://www.buenosairescompras.gob.ar/PLIEGO/x",
  ...over,
});

const awardRow = (over: Partial<Parameters<typeof addAwardRow>[1]> = {}) => ({
  ocid: "ocds-bulbcf-101-0001-LPU26-1",
  id: "101-0001-LPU26",
  title: "Compra de prueba",
  description: "Rubro de prueba",
  status: "active",
  date: "2026-04-01T00:00:00-03:00",
  amount: "12000000.0",
  currency: "ARS",
  contractStart: "2026-04-05T00:00:00-03:00",
  contractEnd: "2027-04-04T23:59:00-03:00",
  contractDays: "365",
  documentUrl: "https://www.buenosairescompras.gob.ar/PLIEGO/y",
  supplierName: "EMPRESA DE PRUEBA S.A. ",
  supplierId: "30-54168237-2",
  ...over,
});

describe("supplierFields", () => {
  test("keeps name and normalized CUIT of legal entities", () => {
    expect(supplierFields("EMPRESA  DE PRUEBA S.A. ", "30-54168237-2")).toEqual({
      proveedor_tipo: "juridica",
      proveedor_cuit: "30541682372",
      proveedor_nombre: "EMPRESA DE PRUEBA S.A.",
    });
  });

  test("drops name and CUIT of individuals and of ids that are not a CUIT", () => {
    expect(supplierFields("Persona de Prueba", "27-00000000-0")).toEqual({
      proveedor_tipo: "humana",
      proveedor_cuit: null,
      proveedor_nombre: null,
    });
    expect(supplierFields("Proveedor sin CUIT", "")).toEqual({ proveedor_tipo: "sin_cuit", proveedor_cuit: null, proveedor_nombre: null });
  });
});

describe("titleFields", () => {
  test("hides titles that name a patient", () => {
    for (const title of [
      "PROTESIS DE CADERA PTE: PRUEBA MARIA HCNº 100000",
      "Prótesis traumatológica pte. Ejemplo Juan",
      "Provisión de Insumos para el Paciente EJEMPLO, ANA DNI12345678",
      "ADQUISICION CPAP AYUDA MEDICA PACIENTEPRUEBA JUAN",
      "Provision Marcapasos (Pac Ejemplo Rosa)",
      "ARPÓN DE DOBLE SUTURA. PCTE: PRUEBA, ARIEL",
      "AYUDA MÉDICA - EJEMPLO PEDRO - SILLA DE RUEDAS",
      "AYUDA MEDICA PAC. PRUEBA, LUIS H.C. N° 100.000 (PET)",
      "Cardiología. Ay Méd EJEMPLO ANA. Adq marcapasos. Ped 78",
      "Adq. Parche de Teflon, Ay Med PRUEBA JUAN CCV",
      "A.M. ALQ. CONCENTRADOR OXIGENO EJEMPLO ROSA",
      "A.Medica- Prueba Claudia.Div.Ortopedia y Traumatologia",
      "OCLUSOR DE FORAMEN OVAL PERMEABLE (EJEMPLO C. 12345678)",
    ]) {
      expect(titleFields(title)).toEqual({ titulo: null, titulo_oculto: true });
    }
  });

  test("keeps titles without markers, including look-alike words", () => {
    for (const title of [
      "ADQUISICION DE LUPA ASFERICAS, PLAN PACES",
      "Adquisición de material bibliográfico // EX-2025-10000001-GCABA-DGPTE",
      "Serv. Hemodiálisis para beneficiarios del Prog. Incluir Salud",
      "ADQUISICIÓN DE LECTORES PROYECTO HISTORIA CLÍNICA ELECTRÓNICA",
      "Servicio de packaging y capacitación",
      "MAYOR MEDIDA DE CAÑERÍAS",
      "Adquisición de material de pintureria y ferreteria - EX. 10000002",
      "SERVICIO DE REPARACION INTEGRAL PLETISMOGRAFO N.º INV. 10000003",
    ]) {
      expect(titleFields(` ${title} `)).toEqual({ titulo: title, titulo_oculto: false });
    }
  });
});

describe("processes", () => {
  test("one row per process, each lot's estimate counted once", () => {
    const processes = new Map<string, ProcessSummary>();
    const lots = new Map();
    // Lot 1 has two item rows; lot 2 has one, with another category.
    addTenderRow(processes, lots, tenderRow());
    addTenderRow(processes, lots, tenderRow());
    addTenderRow(processes, lots, tenderRow({ ocid: "ocds-bulbcf-101-0001-LPU26-2", amount: "500.5", category: "services" }));

    expect(processes.size).toBe(1);
    const row = processRow(processes.get("101-0001-LPU26")!);
    expect(row).toMatchObject({
      proceso_id: "101-0001-LPU26",
      fecha: "2026-03-02",
      titulo: "Compra de prueba",
      unidad_ejecutora_id: "CABA-UE-101",
      lotes: 2,
      monto_estimado: 1500.5,
      categorias: "goods; services",
    });
    expect(lots.get("ocds-bulbcf-101-0001-LPU26-2")).toEqual({ processId: "101-0001-LPU26", amount: 500.5 });
  });

  test("the estimate is empty when a lot has no amount", () => {
    const processes = new Map<string, ProcessSummary>();
    addTenderRow(processes, new Map(), tenderRow());
    addTenderRow(processes, new Map(), tenderRow({ ocid: "ocds-bulbcf-101-0001-LPU26-2", amount: "" }));
    expect(processRow(processes.get("101-0001-LPU26")!).monto_estimado).toBeNull();
  });
});

describe("awards", () => {
  test("folds the item rows of an award and counts the ones that disagree", () => {
    const awards = new Map<string, AwardSummary>();
    addAwardRow(awards, awardRow());
    addAwardRow(awards, awardRow());
    addAwardRow(awards, awardRow({ amount: "1.0" }));

    expect(awards.size).toBe(1);
    const award = [...awards.values()][0]!;
    expect(award.items).toBe(3);
    expect(award.conflicts).toBe(1);
    expect(award.row).toMatchObject({
      fecha: "2026-04-01",
      monto: 12000000,
      contrato_dias: 365,
      contrato_fin: "2027-04-04",
      proveedor_cuit: "30541682372",
      proveedor_nombre: "EMPRESA DE PRUEBA S.A.",
    });
  });
});
