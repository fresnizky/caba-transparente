/**
 * Signals: patterns in Buenos Aires Compras that deserve an explanation. They are questions, not accusations: each
 * one says how it was calculated, lists its cases and carries what could explain it without anything wrong.
 *
 * "Only one offer" (Mendoza has it) cannot be calculated: BAC's open data does not say how many offers each process got.
 */

import { agencyName } from "../src/names.ts";
import type { Origin, Signal, SignalCase, SignalsTopic } from "../src/types.ts";
import { type Award, awardedByProcess, DIRECT, type Process } from "./compras.ts";

const CASES = 15;
/** Below this estimate a process is too small to compare against its award. */
const REAL_ESTIMATE = 100_000;
const SYMBOLIC_ESTIMATE = 1_000;
/** Agencies that bought less than this (nominal pesos) are left out of concentration. */
const CONCENTRATION_MIN = 500_000_000;
const FAILED_MIN_PROCESSES = 100;

const int = (n: number) => Math.round(n).toLocaleString("es-AR");
const millions = (n: number) => `$ ${int(n / 1e6)} millones`;
const percent = (n: number) => `${Math.round(n * 100)} %`;
const date = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "sin fecha");

export function buildSenales(processes: Process[], awards: Award[], origin: Origin): SignalsTopic {
  const awarded = awardedByProcess(processes, awards);
  const ars = processes.filter((p) => p.moneda === "ARS");
  const years = processes.map((p) => p.fecha?.slice(0, 4)).filter((y): y is string => !!y);
  const period = years.length ? `${years.reduce((a, b) => (a < b ? a : b))} a ${years.reduce((a, b) => (a > b ? a : b))}` : "";
  const source = `Buenos Aires Compras (datos abiertos, formato OCDS), ${period}. Montos nominales: no están ajustados por inflación.`;

  const processCase = (p: Process, extra?: string): SignalCase => ({
    titulo: p.oculto ? "Título oculto: nombra a un paciente" : (p.titulo ?? "Sin título"),
    detalle: [p.organismo && agencyName(p.organismo), date(p.fecha), extra].filter(Boolean).join(" · "),
    organismoId: p.organismoId ?? undefined,
    url: p.url,
    monto: awarded.get(p.id),
  });

  const signals: Signal[] = [];

  // 1. Direct contracting, by amount.
  const pesos = awards.filter((a) => a.moneda === "ARS");
  const total = pesos.reduce((sum, a) => sum + (a.monto ?? 0), 0);
  const direct = pesos.filter((a) => a.procedimiento === DIRECT);
  const directAmount = direct.reduce((sum, a) => sum + (a.monto ?? 0), 0);
  const directProcesses = ars.filter((p) => p.procedimiento === DIRECT && awarded.has(p.id));
  signals.push({
    id: "contratacion-directa",
    tema: "Cuánta competencia hay",
    cifra: percent(total ? directAmount / total : 0),
    titulo: "de la plata adjudicada fue por contratación directa",
    descripcion:
      "En una contratación directa el organismo elige a quién comprarle sin una convocatoria abierta. La ley la permite en casos puntuales (urgencia, proveedor único, entre otros), así que cada una debería poder explicar por qué no se licitó.",
    metodo: `Suma de lo adjudicado en pesos con procedimiento «Contratación directa», sobre el total adjudicado en pesos. ${source}`,
    matiz: `Son ${int(directProcesses.length)} de ${int(ars.length)} procesos en pesos. No se cuentan las contrataciones menores, el trámite simplificado para montos chicos, que BAC registra como un procedimiento aparte.`,
    totalCasos: directProcesses.length,
    casos: directProcesses
      .sort((a, b) => awarded.get(b.id)! - awarded.get(a.id)!)
      .slice(0, CASES)
      .map((p) => processCase(p)),
  });

  // 2. Awarded at least twice the estimate.
  const overruns = ars
    .filter((p) => (p.estimado ?? 0) >= REAL_ESTIMATE && (awarded.get(p.id) ?? 0) >= 2 * p.estimado!)
    .map((p) => ({ p, excess: awarded.get(p.id)! - p.estimado! }))
    .sort((a, b) => b.excess - a.excess);
  signals.push({
    id: "adjudicado-sobre-estimado",
    tema: "Cuánto se paga",
    cifra: int(overruns.length),
    titulo: "compras se adjudicaron por más del doble de lo estimado",
    descripcion:
      "Antes de comprar, el organismo calcula cuánto va a costar. Si termina pagando el doble o más, o el cálculo estaba mal hecho o el precio subió: las dos cosas merecen una explicación.",
    metodo: `Procesos en pesos con monto estimado de al menos $ ${int(REAL_ESTIMATE)} cuya suma adjudicada es al menos el doble. Los casos se ordenan por la diferencia en pesos. ${source}`,
    matiz: `Entre todas, ${millions(overruns.reduce((sum, o) => sum + o.excess, 0))} por encima de lo estimado. Con la inflación, un estimado de unos meses antes puede quedar viejo cuando se adjudica.`,
    totalCasos: overruns.length,
    casos: overruns.slice(0, CASES).map(({ p }) => processCase(p, `estimado ${millions(p.estimado!)}`)),
  });

  // 3. Symbolic estimate.
  const symbolic = ars
    .filter((p) => p.estimado !== null && p.estimado > 0 && p.estimado < SYMBOLIC_ESTIMATE && (awarded.get(p.id) ?? 0) >= REAL_ESTIMATE)
    .sort((a, b) => awarded.get(b.id)! - awarded.get(a.id)!);
  signals.push({
    id: "estimado-simbolico",
    tema: "Cuánto se paga",
    cifra: int(symbolic.length),
    titulo: `compras se estimaron en menos de $ ${int(SYMBOLIC_ESTIMATE)} y se adjudicaron por $ ${int(REAL_ESTIMATE)} o más`,
    descripcion:
      "Un estimado simbólico (un peso, diez pesos) no dice nada sobre el precio esperado. Sin un estimado real no hay contra qué comparar lo que se pagó.",
    metodo: `Procesos en pesos con monto estimado mayor a cero y menor a $ ${int(SYMBOLIC_ESTIMATE)}, adjudicados por al menos $ ${int(REAL_ESTIMATE)}. Los estimados en cero se dejan afuera: BAC publica cero en muchos procesos, como las concesiones. ${source}`,
    matiz: "Puede ser un error de carga en BAC y no una decisión del organismo; el pliego de cada compra lo aclara.",
    totalCasos: symbolic.length,
    casos: symbolic.slice(0, CASES).map((p) => processCase(p, `estimado $ ${int(p.estimado!)}`)),
  });

  // 4. Concentration: agencies that bought more than half from one company.
  const byAgency = new Map<string, { nombre: string; total: number; companies: Map<string, { nombre: string; monto: number }> }>();
  for (const a of pesos) {
    if (!a.organismoId) continue;
    let agency = byAgency.get(a.organismoId);
    if (!agency) byAgency.set(a.organismoId, (agency = { nombre: a.organismo ?? a.organismoId, total: 0, companies: new Map() }));
    agency.total += a.monto ?? 0;
    if (a.proveedorTipo !== "juridica" || !a.cuit) continue;
    const c = agency.companies.get(a.cuit) ?? { nombre: a.proveedor ?? a.cuit, monto: 0 };
    c.monto += a.monto ?? 0;
    agency.companies.set(a.cuit, c);
  }
  const concentrated = [...byAgency]
    .filter(([, a]) => a.total >= CONCENTRATION_MIN && a.companies.size >= 3)
    .map(([id, a]) => {
      const top = [...a.companies.values()].sort((x, y) => y.monto - x.monto)[0]!;
      return { id, nombre: a.nombre, total: a.total, top, share: top.monto / a.total };
    })
    .filter((a) => a.share > 0.5)
    .sort((a, b) => b.share - a.share);
  signals.push({
    id: "concentracion",
    tema: "A quién se le compra",
    cifra: int(concentrated.length),
    titulo: "organismos le compraron más de la mitad a una sola empresa",
    descripcion:
      "Cuando un organismo le compra casi todo a la misma empresa, depende de ella: si los precios suben o el servicio empeora, no tiene a quién más recurrir.",
    metodo: `Suma de lo adjudicado en pesos por organismo y por empresa, en todo el período. Solo organismos que compraron al menos ${millions(CONCENTRATION_MIN)} y a por lo menos tres empresas. ${source}`,
    matiz:
      "Hay organismos que existen para un solo contrato grande (una concesión, una obra, el transporte): ahí la concentración es esperable.",
    totalCasos: concentrated.length,
    casos: concentrated.slice(0, CASES).map((a) => ({
      titulo: agencyName(a.nombre),
      detalle: `${a.top.nombre} se llevó el ${percent(a.share)} de ${millions(a.total)}`,
      organismoId: a.id,
      monto: a.top.monto,
    })),
  });

  // 5. Unsuccessful processes (deserted or failed).
  const failed = processes.filter((p) => p.estado === "unsuccessful");
  const cancelled = processes.filter((p) => p.estado === "cancelled");
  const failedByAgency = new Map<string, { nombre: string; total: number; failed: number }>();
  for (const p of processes) {
    if (!p.organismoId) continue;
    const a = failedByAgency.get(p.organismoId) ?? { nombre: p.organismo ?? p.organismoId, total: 0, failed: 0 };
    a.total++;
    if (p.estado === "unsuccessful") a.failed++;
    failedByAgency.set(p.organismoId, a);
  }
  const failedRanking = [...failedByAgency]
    .filter(([, a]) => a.total >= FAILED_MIN_PROCESSES && a.failed > 0)
    .sort(([, a], [, b]) => b.failed / b.total - a.failed / a.total);
  signals.push({
    id: "fracasadas",
    tema: "Cuánta competencia hay",
    cifra: `1 de cada ${failed.length ? Math.round(processes.length / failed.length) : "—"}`,
    titulo: "compras quedó desierta o fracasó",
    descripcion:
      "Una compra desierta (nadie se presentó) o fracasada (ninguna oferta servía) hay que volver a empezarla. Si en un organismo pasa seguido, puede que los pliegos estén mal armados o que haya poca competencia en su rubro.",
    metodo: `Procesos con estado «unsuccessful» en OCDS, sobre ${int(processes.length)} procesos. El ranking incluye organismos con al menos ${FAILED_MIN_PROCESSES} procesos. ${source}`,
    matiz: `Son ${int(failed.length)} compras. Aparte, ${int(cancelled.length)} se dejaron sin efecto (estado «cancelled»), algo que también puede pasar por razones administrativas.`,
    totalCasos: failedRanking.length,
    casos: failedRanking.slice(0, CASES).map(([id, a]) => ({
      titulo: agencyName(a.nombre),
      detalle: `${percent(a.failed / a.total)} de sus ${int(a.total)} procesos (${int(a.failed)})`,
      organismoId: id,
    })),
  });

  return { origen: origin, senales: signals };
}
