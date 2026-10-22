/**
 * Buenos Aires Compras for the site: reads data/processed/compras-bac/{procesos,adjudicaciones}/<year>.csv into compact
 * records and folds them into the summary, one file per agency and one per supplier.
 *
 * Rules (AGENTS.md, D-04):
 * - Peso totals only add ARS; other currencies are kept apart and never converted.
 * - An award with no currency takes the one of its process (BAC leaves it empty in ~15 % of the awards).
 * - Individuals (CUIT 20, 23, 24, 27) only appear as a total: no list, no page, no name.
 * - Every amount also goes in constant pesos (`montoReal`), only for the months the IPC covers (inflacion.ts).
 */

import { join } from "node:path";

import type {
  AgencyDetail,
  AgencySummary,
  AgencySupplier,
  Amount,
  AwardItem,
  ComprasSummary,
  IndividualsTotal,
  Origin,
  OtherCurrencies,
  ProcedureRow,
  ProcessItem,
  SupplierDetail,
  SupplierSummary,
  YearRow,
} from "../src/types.ts";
import { csvFiles, readRows } from "./csv.ts";
import type { Deflator } from "./inflacion.ts";

export interface Process {
  id: string;
  fecha: string | null;
  titulo: string | null;
  oculto: boolean;
  estado: string | null;
  procedimiento: string | null;
  organismoId: string | null;
  organismo: string | null;
  moneda: string | null;
  estimado: number | null;
  url: string | null;
}

export interface Award {
  ocid: string;
  procesoId: string | null;
  fecha: string | null;
  titulo: string | null;
  oculto: boolean;
  monto: number | null;
  moneda: string | null;
  proveedorTipo: string;
  cuit: string | null;
  proveedor: string | null;
  organismoId: string | null;
  organismo: string | null;
  procedimiento: string | null;
  url: string | null;
}

export const DIRECT = "CONTRATACION DIRECTA";

const text = (s: string | undefined) => (s ? s : null);
const num = (s: string | undefined) => (s === undefined || s.trim() === "" ? null : Number(s));
/** `CABA-UE-10002` → `10002`: the number is what the site uses in its routes. */
export const agencyId = (s: string | undefined) => (s ? s.replace(/^CABA-UE-/, "") : null);
const year = (fecha: string | null) => (fecha ? Number(fecha.slice(0, 4)) : null);

export function toProcess(r: Record<string, string>): Process {
  return {
    id: r.proceso_id!,
    fecha: text(r.fecha),
    titulo: text(r.titulo),
    oculto: r.titulo_oculto === "true",
    estado: text(r.estado),
    procedimiento: text(r.procedimiento),
    organismoId: agencyId(r.unidad_ejecutora_id),
    organismo: text(r.unidad_ejecutora),
    moneda: text(r.moneda),
    estimado: num(r.monto_estimado),
    url: text(r.url_pliego),
  };
}

export function toAward(r: Record<string, string>, processes: Map<string, Process>): Award {
  const process = r.proceso_id ? processes.get(r.proceso_id) : undefined;
  return {
    ocid: r.ocid!,
    procesoId: text(r.proceso_id),
    fecha: text(r.fecha),
    titulo: text(r.titulo),
    oculto: r.titulo_oculto === "true",
    monto: num(r.monto),
    moneda: text(r.moneda) ?? process?.moneda ?? null,
    proveedorTipo: r.proveedor_tipo || "sin_cuit",
    // Defensive: the processed CSV already leaves them empty for individuals.
    cuit: r.proveedor_tipo === "juridica" ? text(r.proveedor_cuit) : null,
    proveedor: r.proveedor_tipo === "juridica" ? text(r.proveedor_nombre) : null,
    organismoId: agencyId(r.unidad_ejecutora_id),
    organismo: text(r.unidad_ejecutora),
    procedimiento: text(r.procedimiento),
    url: text(r.url_documento),
  };
}

export async function readCompras(dir: string): Promise<{ processes: Process[]; awards: Award[] }> {
  const byId = new Map<string, Process>();
  for (const file of csvFiles(join(dir, "procesos"))) for await (const r of readRows(file)) byId.set(r.proceso_id!, toProcess(r));
  const awards: Award[] = [];
  for (const file of csvFiles(join(dir, "adjudicaciones"))) for await (const r of readRows(file)) awards.push(toAward(r, byId));
  return { processes: [...byId.values()], awards };
}

// --- Folding ---------------------------------------------------------------------------------------------------

const isArs = (a: Award) => a.moneda === "ARS";
const pesos = (a: Award) => (isArs(a) ? (a.monto ?? 0) : 0);

/** Sums in nominal and constant pesos. Without an index, constant pesos are null everywhere. */
class Money {
  constructor(private readonly deflator: Deflator | null) {}

  /** Constant pesos of one award, or null if it is not in pesos or the index does not cover its month. */
  real(a: Award): number | null {
    return this.deflator && isArs(a) && a.monto !== null ? this.deflator.real(a.monto, a.fecha) : null;
  }

  sum(awards: Award[]): Amount {
    let montoArs = 0;
    let montoReal = 0;
    for (const a of awards) {
      montoArs += pesos(a);
      montoReal += this.real(a) ?? 0;
    }
    return { montoArs, montoReal: this.deflator ? montoReal : null };
  }

  /** Whether a whole year has a value in constant pesos. */
  covers(year: number): boolean {
    return this.deflator !== null && year >= this.deflator.desde;
  }
}

/** Share of `part` in `total`, for nominal and constant pesos. */
const share = (part: Amount, total: Amount) => ({
  nominal: total.montoArs ? part.montoArs / total.montoArs : 0,
  real: part.montoReal !== null && total.montoReal ? part.montoReal / total.montoReal : null,
});

function addOther(acc: OtherCurrencies, a: Award) {
  if (isArs(a) || !a.moneda || !a.monto) return;
  acc[a.moneda] = (acc[a.moneda] ?? 0) + a.monto;
}

function byYear(money: Money, processes: Process[], awards: Award[]): YearRow[] {
  const rows = new Map<number, YearRow>();
  const row = (anio: number) => {
    let r = rows.get(anio);
    if (!r) rows.set(anio, (r = { anio, procesos: 0, adjudicaciones: 0, montoArs: 0, montoReal: money.covers(anio) ? 0 : null }));
    return r;
  };
  for (const p of processes) {
    const y = year(p.fecha);
    if (y) row(y).procesos++;
  }
  for (const a of awards) {
    const y = year(a.fecha);
    if (!y) continue;
    const r = row(y);
    r.adjudicaciones++;
    r.montoArs += pesos(a);
    if (r.montoReal !== null) r.montoReal += money.real(a) ?? 0;
  }
  return [...rows.values()].sort((a, b) => a.anio - b.anio);
}

function byProcedure(money: Money, processes: Process[], awards: Award[]): ProcedureRow[] {
  const counts = new Map<string, number>();
  for (const p of processes) counts.set(p.procedimiento ?? "Sin dato", (counts.get(p.procedimiento ?? "Sin dato") ?? 0) + 1);
  const byName = groupBy(awards, (a) => a.procedimiento ?? "Sin dato");
  return [...new Set([...counts.keys(), ...byName.keys()])]
    .map((procedimiento) => {
      const list = byName.get(procedimiento) ?? [];
      return { procedimiento, procesos: counts.get(procedimiento) ?? 0, adjudicaciones: list.length, ...money.sum(list) };
    })
    .sort((a, b) => b.montoArs - a.montoArs || b.procesos - a.procesos);
}

function individuals(money: Money, awards: Award[]): IndividualsTotal {
  const humans = awards.filter((a) => a.proveedorTipo === "humana");
  return { adjudicaciones: humans.length, ...money.sum(humans) };
}

function groupBy<T>(items: T[], key: (item: T) => string | null): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    if (k === null) continue;
    const list = groups.get(k);
    if (list) list.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

function span(items: { fecha: string | null }[]): { desde: number | null; hasta: number | null } {
  let desde: number | null = null;
  let hasta: number | null = null;
  for (const i of items) {
    const y = year(i.fecha);
    if (y === null) continue;
    if (desde === null || y < desde) desde = y;
    if (hasta === null || y > hasta) hasta = y;
  }
  return { desde, hasta };
}

const byDateDesc = <T extends { fecha: string | null }>(a: T, b: T) => (b.fecha ?? "").localeCompare(a.fecha ?? "");
const byNominal = (a: Amount, b: Amount) => b.montoArs - a.montoArs;
const byReal = (a: Amount, b: Amount) => (b.montoReal ?? 0) - (a.montoReal ?? 0) || byNominal(a, b);

/** The first `n` by nominal amount and by constant pesos: the two orders differ, and pages show one or the other. */
function tops<T extends Amount>(items: T[], n: number): [T[], T[]] {
  return [[...items].sort(byNominal).slice(0, n), [...items].sort(byReal).slice(0, n)];
}

function processItem(p: Process, awarded: Map<string, number>): ProcessItem {
  return {
    id: p.id,
    fecha: p.fecha,
    titulo: p.oculto ? null : p.titulo,
    oculto: p.oculto,
    procedimiento: p.procedimiento,
    estado: p.estado,
    estimado: p.estimado,
    moneda: p.moneda,
    adjudicado: awarded.get(p.id) ?? null,
    url: p.url,
  };
}

function awardItem(a: Award): AwardItem {
  return {
    ocid: a.ocid,
    procesoId: a.procesoId,
    fecha: a.fecha,
    titulo: a.oculto ? null : a.titulo,
    oculto: a.oculto,
    monto: a.monto,
    moneda: a.moneda,
    organismoId: a.organismoId,
    organismo: a.organismo,
    procedimiento: a.procedimiento,
    url: a.url,
  };
}

/** Amount awarded per process, in the process currency (only awards in that same currency). */
export function awardedByProcess(processes: Process[], awards: Award[]): Map<string, number> {
  const currency = new Map(processes.map((p) => [p.id, p.moneda]));
  const totals = new Map<string, number>();
  for (const a of awards) {
    if (!a.procesoId || a.monto === null || a.moneda !== currency.get(a.procesoId)) continue;
    totals.set(a.procesoId, (totals.get(a.procesoId) ?? 0) + a.monto);
  }
  return totals;
}

function agencySummary(money: Money, id: string, processes: Process[], awards: Award[]): AgencySummary {
  const total = money.sum(awards);
  const direct = share(money.sum(awards.filter((a) => a.procedimiento === DIRECT)), total);
  const latest = [...processes].sort(byDateDesc)[0];
  return {
    id,
    nombre: latest?.organismo ?? awards[0]?.organismo ?? `Unidad ejecutora ${id}`,
    ...total,
    procesos: processes.length,
    adjudicaciones: awards.length,
    directaMonto: direct.nominal,
    directaReal: direct.real,
    ...span([...processes, ...awards]),
  };
}

function supplierSummary(money: Money, cuit: string, awards: Award[]): SupplierSummary {
  const latest = [...awards].sort(byDateDesc)[0];
  return {
    cuit,
    nombre: latest?.proveedor ?? cuit,
    ...money.sum(awards),
    adjudicaciones: awards.length,
    organismos: new Set(awards.map((a) => a.organismoId)).size,
    ...span(awards),
  };
}

/** First and last date in the data, and the last year with all its months (the current one is still open). */
export function coverage(
  processes: Process[],
  awards: Award[],
): { desde: string | null; hasta: string | null; ultimoAnioCompleto: number | null } {
  let desde: string | null = null;
  let hasta: string | null = null;
  for (const { fecha } of [...processes, ...awards]) {
    if (!fecha) continue;
    if (desde === null || fecha < desde) desde = fecha;
    if (hasta === null || fecha > hasta) hasta = fecha;
  }
  const last = hasta ? Number(hasta.slice(0, 4)) : null;
  // The last year only counts as complete if the data reaches its last days.
  const ultimoAnioCompleto = last === null ? null : hasta!.slice(5) >= "12-15" ? last : last - 1;
  return { desde, hasta, ultimoAnioCompleto };
}

const RECENT = 40;
const TOP_SUPPLIERS = 25;

export interface ComprasPages {
  summary: ComprasSummary;
  agencies: AgencySummary[];
  agencyDetails: AgencyDetail[];
  suppliers: SupplierSummary[];
  supplierDetails: SupplierDetail[];
}

export function buildCompras(processes: Process[], awards: Award[], origin: Origin, deflator: Deflator | null = null): ComprasPages {
  const money = new Money(deflator);
  const constantes = deflator && {
    indice: deflator.indice,
    region: deflator.region,
    referencia: deflator.referencia,
    desde: deflator.desde,
  };
  const awarded = awardedByProcess(processes, awards);
  const processesByAgency = groupBy(processes, (p) => p.organismoId);
  const awardsByAgency = groupBy(awards, (a) => a.organismoId);
  const companies = awards.filter((a) => a.proveedorTipo === "juridica" && a.cuit);
  const awardsBySupplier = groupBy(companies, (a) => a.cuit);
  const { desde, hasta, ultimoAnioCompleto } = coverage(processes, awards);

  const agencyDetails: AgencyDetail[] = [...new Set([...processesByAgency.keys(), ...awardsByAgency.keys()])].map((id) => {
    const ps = processesByAgency.get(id) ?? [];
    const as = awardsByAgency.get(id) ?? [];
    const otrasMonedas: OtherCurrencies = {};
    for (const a of as) addOther(otrasMonedas, a);
    const estados: Record<string, number> = {};
    for (const p of ps) estados[p.estado ?? "sin_dato"] = (estados[p.estado ?? "sin_dato"] ?? 0) + 1;
    const suppliers: AgencySupplier[] = [...groupBy(as, (a) => (a.proveedorTipo === "juridica" ? a.cuit : null))].map(([cuit, list]) => {
      const { nombre, montoArs, montoReal, adjudicaciones } = supplierSummary(money, cuit, list);
      return { cuit, nombre, montoArs, montoReal, adjudicaciones };
    });
    const [proveedores, proveedoresReal] = tops(suppliers, TOP_SUPPLIERS);
    return {
      ...agencySummary(money, id, ps, as),
      origen: origin,
      constantes,
      ultimoAnioCompleto,
      otrasMonedas,
      porAnio: byYear(money, ps, as),
      porProcedimiento: byProcedure(money, ps, as),
      estados,
      proveedores,
      proveedoresReal,
      personasHumanas: individuals(money, as),
      recientes: [...ps]
        .sort(byDateDesc)
        .slice(0, RECENT)
        .map((p) => processItem(p, awarded)),
    };
  });

  const supplierDetails: SupplierDetail[] = [...awardsBySupplier].map(([cuit, as]) => {
    const otrasMonedas: OtherCurrencies = {};
    for (const a of as) addOther(otrasMonedas, a);
    return {
      ...supplierSummary(money, cuit, as),
      origen: origin,
      constantes,
      ultimoAnioCompleto,
      otrasMonedas,
      porAnio: byYear(money, [], as),
      porProcedimiento: byProcedure(money, [], as),
      porOrganismo: [...groupBy(as, (a) => a.organismoId)]
        .map(([id, list]) => ({ id, nombre: list[0]?.organismo ?? id, ...money.sum(list), adjudicaciones: list.length }))
        .sort(byNominal),
      recientes: [...as].sort(byDateDesc).slice(0, RECENT).map(awardItem),
    };
  });

  const agencies: AgencySummary[] = agencyDetails
    .map(({ id, nombre, montoArs, montoReal, procesos, adjudicaciones, directaMonto, directaReal, desde, hasta }) => ({
      id,
      nombre,
      montoArs,
      montoReal,
      procesos,
      adjudicaciones,
      directaMonto,
      directaReal,
      desde,
      hasta,
    }))
    .sort(byNominal);
  const suppliers: SupplierSummary[] = supplierDetails
    .map(({ cuit, nombre, montoArs, montoReal, adjudicaciones, organismos, desde, hasta }) => ({
      cuit,
      nombre,
      montoArs,
      montoReal,
      adjudicaciones,
      organismos,
      desde,
      hasta,
    }))
    .sort(byNominal);

  const otrasMonedas: OtherCurrencies = {};
  for (const a of awards) addOther(otrasMonedas, a);
  const [topOrganismos, topOrganismosReal] = tops(agencies, 10);
  const [topProveedores, topProveedoresReal] = tops(suppliers, 10);

  return {
    summary: {
      origen: origin,
      constantes,
      totales: {
        procesos: processes.length,
        adjudicaciones: awards.length,
        ...money.sum(awards),
        otrasMonedas,
        organismos: agencies.length,
        proveedores: suppliers.length,
        desde,
        hasta,
      },
      ultimoAnioCompleto,
      porAnio: byYear(money, processes, awards),
      porProcedimiento: byProcedure(money, processes, awards),
      personasHumanas: individuals(money, awards),
      topOrganismos,
      topOrganismosReal,
      topProveedores,
      topProveedoresReal,
    },
    agencies,
    agencyDetails,
    suppliers,
    supplierDetails,
  };
}
