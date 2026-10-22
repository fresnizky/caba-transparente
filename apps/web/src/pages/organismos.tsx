import { getRouteApi, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import {
  BarList,
  Cell,
  Empty,
  OtherCurrenciesNote,
  PageHeader,
  SearchInput,
  Section,
  SourceNote,
  Stat,
  Stats,
  Table,
  YearChart,
} from "../components/ui.tsx";
import { agencyName, count, date, HIDDEN_TITLE, int, money, percent, procedure, searchKey, status } from "../lib.ts";
import { PesosToggle, usePesos } from "../pesos.tsx";

const listRoute = getRouteApi("/organismos");
/** Same threshold as the concentration signal (scripts/senales.ts). */
const CONCENTRATION_MIN = 500_000_000;
const detailRoute = getRouteApi("/organismos/$id");

export function OrganismosPage() {
  const { organismos: agencies, resumen } = listRoute.useLoaderData();
  const p = usePesos(resumen.constantes);
  const [query, setQuery] = useState("");
  const q = searchKey(query.trim());
  const shown = useMemo(() => {
    const found = q ? agencies.filter((a) => searchKey(a.nombre).includes(q)) : agencies;
    return p.real ? p.sort(found) : found;
  }, [agencies, q, p.real, p.sort]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader topic="Organismos" title="¿Quién compra y cómo?">
        Los {count(agencies.length, "organismo", "organismos")} de la Ciudad que compran por Buenos Aires Compras: ministerios, hospitales,
        direcciones y entes. Cada uno tiene su ficha con lo que compró y a quién.
      </PageHeader>
      <PesosToggle constantes={resumen.constantes} />
      <SearchInput label="Buscar organismo" value={query} onChange={setQuery} />
      {shown.length ? (
        <Table head={["Organismo", "Adjudicado", "Procesos", "Contratación directa", "Años"]}>
          {shown.map((a) => (
            <tr key={a.id}>
              <Cell first>
                <Link to="/organismos/$id" params={{ id: a.id }}>
                  {agencyName(a.nombre)}
                </Link>
              </Cell>
              <Cell>{p.format(a)}</Cell>
              <Cell>{int(a.procesos)}</Cell>
              <Cell>{p.real ? (a.directaReal === null || !a.montoReal ? "—" : percent(a.directaReal)) : percent(a.directaMonto)}</Cell>
              <Cell>{a.desde === a.hasta ? a.desde : `${a.desde}–${a.hasta}`}</Cell>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty>Ningún organismo coincide con «{query}».</Empty>
      )}
      <p className="text-sm text-subtle">
        Adjudicado: suma de {p.real ? `las compras desde ${resumen.constantes?.desde}` : "todos los años"}. {p.unit}. Contratación directa:
        parte de ese monto adjudicada sin convocatoria abierta.
      </p>
    </div>
  );
}

export function OrganismoPage() {
  const o = detailRoute.useLoaderData();
  const p = usePesos(o.constantes);
  const failed = o.estados.unsuccessful ?? 0;
  // Concentration is measured like the signal: nominal pesos over the whole period (scripts/senales.ts).
  const topShare = o.montoArs ? (o.proveedores[0]?.montoArs ?? 0) / o.montoArs : 0;
  const suppliers = p.real ? o.proveedoresReal : o.proveedores;
  const total = p.value(o) ?? 0;
  const directa = p.real ? o.directaReal : o.directaMonto;

  return (
    <div className="flex flex-col">
      <nav aria-label="Ruta" className="pb-2 text-sm">
        <Link to="/organismos">Organismos</Link>
      </nav>
      <PageHeader title={agencyName(o.nombre)}>
        Unidad ejecutora {o.id} en Buenos Aires Compras. Compras de {o.desde ?? "—"} a {o.hasta ?? "—"}.
      </PageHeader>

      <PesosToggle constantes={o.constantes} />

      <Stats>
        <Stat label="Total adjudicado" value={p.format(o)} note={p.real ? p.unit : "Pesos de cada año, todos los años"} />
        <Stat label="Procesos" value={int(o.procesos)} note={`${count(o.adjudicaciones, "adjudicación", "adjudicaciones")}`} />
        <Stat label="Contratación directa" value={directa === null || !total ? "—" : percent(directa)} note="Del monto adjudicado" />
        <Stat
          label="Desiertos o fracasados"
          value={o.procesos ? percent(failed / o.procesos) : "—"}
          note={`${count(failed, "proceso", "procesos")}`}
        />
      </Stats>

      {topShare > 0.5 && o.proveedores.length >= 3 && o.montoArs >= CONCENTRATION_MIN && (
        <div className="pt-6">
          <p className="rounded-lg border border-accent bg-accent-soft p-4 text-sm">
            <span className="font-semibold">Mucha concentración. </span>
            {o.proveedores[0]!.nombre} se llevó el {percent(topShare)} de lo que adjudicó este organismo.{" "}
            <Link to="/senales">Qué significa</Link>
          </p>
        </div>
      )}

      {o.porAnio.length > 1 && (
        <Section id="por-anio" title="Contratos adjudicados por año">
          <YearChart rows={o.porAnio} lastComplete={o.ultimoAnioCompleto} pesos={p} cambio={o.cambio} />
          <OtherCurrenciesNote amounts={o.otrasMonedas} converted={o.cambio !== null} />
        </Section>
      )}

      <Section id="procedimientos" title="Cómo compra">
        <Table head={["Procedimiento", "Procesos", "Adjudicado"]}>
          {o.porProcedimiento
            .filter((row) => row.procesos > 0 || row.montoArs > 0)
            .map((row) => (
              <tr key={row.procedimiento}>
                <Cell first>{procedure(row.procedimiento)}</Cell>
                <Cell>{int(row.procesos)}</Cell>
                <Cell>{p.format(row)}</Cell>
              </tr>
            ))}
        </Table>
      </Section>

      <Section id="proveedores" title="Principales proveedores" note={`Empresas, por monto adjudicado. ${p.unit}.`}>
        {suppliers.some((s) => (p.value(s) ?? 0) > 0) ? (
          <BarList
            rows={suppliers
              .filter((s) => (p.value(s) ?? 0) > 0)
              .map((s) => ({
                key: s.cuit,
                label: (
                  <Link to="/proveedores/$cuit" params={{ cuit: s.cuit }}>
                    {s.nombre}
                  </Link>
                ),
                value: p.value(s) ?? 0,
                detail: `${percent(total ? (p.value(s) ?? 0) / total : 0)} del total · ${count(s.adjudicaciones, "adjudicación", "adjudicaciones")}`,
              }))}
          />
        ) : (
          <Empty>Sin adjudicaciones a empresas.</Empty>
        )}
        {o.personasHumanas.adjudicaciones > 0 && (
          <p className="text-sm text-muted">
            Además, {count(o.personasHumanas.adjudicaciones, "adjudicación", "adjudicaciones")} a personas humanas por{" "}
            {p.format(o.personasHumanas)}, que no se muestran una por una.
          </p>
        )}
      </Section>

      <Section
        id="recientes"
        title="Compras recientes"
        note={`Las ${o.recientes.length} más nuevas, con el monto en pesos de su fecha. El enlace lleva al pliego en Buenos Aires Compras.`}
      >
        <ul className="flex flex-col divide-y divide-line">
          {o.recientes.map((item) => (
            <li key={item.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className={item.oculto ? "italic text-subtle" : ""}>
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noreferrer">
                      {item.titulo ?? HIDDEN_TITLE}
                    </a>
                  ) : (
                    (item.titulo ?? HIDDEN_TITLE)
                  )}
                </span>
                <span className="text-sm text-subtle">
                  {date(item.fecha)} · {procedure(item.procedimiento)} · {status(item.estado)} · {item.id}
                </span>
              </div>
              <div className="flex shrink-0 flex-col text-sm tabular sm:items-end">
                <span>{item.adjudicado !== null ? money(item.adjudicado, item.moneda) : "Sin adjudicar"}</span>
                {item.estimado !== null && item.estimado > 0 && (
                  <span className="text-subtle">estimado {money(item.estimado, item.moneda)}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <SourceNote origin={o.origen} />
    </div>
  );
}
