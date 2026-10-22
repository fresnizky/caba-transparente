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
import { agencyName, count, date, HIDDEN_TITLE, int, money, procedure, searchKey } from "../lib.ts";
import { PesosToggle, usePesos } from "../pesos.tsx";

const listRoute = getRouteApi("/proveedores");
const detailRoute = getRouteApi("/proveedores/$cuit");

/** The list has thousands of companies: only the first ones that match are drawn. */
const SHOWN = 100;

const formatCuit = (c: string) => `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}`;

export function ProveedoresPage() {
  const { proveedores, resumen } = listRoute.useLoaderData();
  const pesos = usePesos(resumen.constantes);
  const [query, setQuery] = useState("");
  const q = searchKey(query.trim());
  // Sorted once per unit: the list has thousands of companies.
  const sorted = useMemo(
    () => (pesos.real ? [...proveedores].sort((a, b) => (b.montoReal ?? 0) - (a.montoReal ?? 0)) : proveedores),
    [proveedores, pesos.real],
  );
  const matches = useMemo(() => {
    if (!q) return sorted;
    const digits = q.replace(/\D/g, "");
    return sorted.filter((p) => searchKey(p.nombre).includes(q) || (digits.length >= 4 && p.cuit.includes(digits)));
  }, [sorted, q]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader topic="Proveedores" title="¿A qué empresas les compra la Ciudad?">
        Las {int(proveedores.length)} empresas que ganaron al menos una compra en Buenos Aires Compras, ordenadas por lo que se les
        adjudicó.
      </PageHeader>
      <PesosToggle constantes={resumen.constantes} />
      <SearchInput label="Buscar por razón social o CUIT" value={query} onChange={setQuery} />
      {matches.length ? (
        <>
          <Table head={["Empresa", "Adjudicado", "Adjudicaciones", "Organismos", "Años"]}>
            {matches.slice(0, SHOWN).map((p) => (
              <tr key={p.cuit}>
                <Cell first>
                  <Link to="/proveedores/$cuit" params={{ cuit: p.cuit }}>
                    {p.nombre}
                  </Link>
                </Cell>
                <Cell>{pesos.format(p)}</Cell>
                <Cell>{int(p.adjudicaciones)}</Cell>
                <Cell>{int(p.organismos)}</Cell>
                <Cell>{p.desde === p.hasta ? p.desde : `${p.desde}–${p.hasta}`}</Cell>
              </tr>
            ))}
          </Table>
          {matches.length > SHOWN && (
            <p className="text-sm text-subtle">
              Se muestran {SHOWN} de {int(matches.length)}. Buscá por nombre o CUIT para encontrar el resto.
            </p>
          )}
        </>
      ) : (
        <Empty>Ninguna empresa coincide con «{query}».</Empty>
      )}
      <p className="text-sm text-muted">
        Las personas humanas que le venden a la Ciudad (CUIT que empieza con 20, 23, 24 o 27) no están en esta lista: su CUIT lleva el DNI y
        no se perfila a particulares. Entre todas sumaron {count(resumen.personasHumanas.adjudicaciones, "adjudicación", "adjudicaciones")}{" "}
        por {pesos.format(resumen.personasHumanas)}
        {pesos.real && ` desde ${resumen.constantes?.desde}`}.
      </p>
    </div>
  );
}

export function ProveedorPage() {
  const p = detailRoute.useLoaderData();
  const pesos = usePesos(p.constantes);

  return (
    <div className="flex flex-col">
      <nav aria-label="Ruta" className="pb-2 text-sm">
        <Link to="/proveedores">Proveedores</Link>
      </nav>
      <PageHeader title={p.nombre}>
        CUIT {formatCuit(p.cuit)}. Le vendió a la Ciudad de {p.desde ?? "—"} a {p.hasta ?? "—"}.
      </PageHeader>

      <PesosToggle constantes={p.constantes} />

      <Stats>
        <Stat label="Total adjudicado" value={pesos.format(p)} note={pesos.real ? pesos.unit : "Pesos de cada año, todos los años"} />
        <Stat label="Adjudicaciones" value={int(p.adjudicaciones)} note="Lotes ganados" />
        <Stat label="Organismos" value={int(p.organismos)} note="Que le compraron" />
        <Stat label="Última adjudicación" value={date(p.recientes[0]?.fecha ?? null)} />
      </Stats>

      {p.porAnio.length > 1 && (
        <Section id="por-anio" title="Contratos adjudicados por año">
          <YearChart rows={p.porAnio} lastComplete={p.ultimoAnioCompleto} pesos={pesos} />
          <OtherCurrenciesNote amounts={p.otrasMonedas} />
        </Section>
      )}

      <Section id="organismos" title="Quién le compra" note={`Por monto adjudicado. ${pesos.unit}.`}>
        <BarList
          rows={pesos
            .sort(p.porOrganismo)
            .filter((o) => (pesos.value(o) ?? 0) > 0)
            .slice(0, 20)
            .map((o) => ({
              key: o.id,
              label: (
                <Link to="/organismos/$id" params={{ id: o.id }}>
                  {agencyName(o.nombre)}
                </Link>
              ),
              value: pesos.value(o) ?? 0,
              detail: `${count(o.adjudicaciones, "adjudicación", "adjudicaciones")}`,
            }))}
        />
        {p.porOrganismo.length > 20 && <p className="text-sm text-subtle">Y {p.porOrganismo.length - 20} organismos más.</p>}
      </Section>

      <Section id="procedimientos" title="Cómo le compran">
        <Table head={["Procedimiento", "Adjudicaciones", "Adjudicado"]}>
          {p.porProcedimiento.map((r) => (
            <tr key={r.procedimiento}>
              <Cell first>{procedure(r.procedimiento)}</Cell>
              <Cell>{int(r.adjudicaciones)}</Cell>
              <Cell>{pesos.format(r)}</Cell>
            </tr>
          ))}
        </Table>
      </Section>

      <Section
        id="recientes"
        title="Adjudicaciones recientes"
        note={`Las ${p.recientes.length} más nuevas, con el monto en pesos de su fecha. El enlace lleva al documento en Buenos Aires Compras.`}
      >
        <ul className="flex flex-col divide-y divide-line">
          {p.recientes.map((a) => (
            <li key={a.ocid} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className={a.oculto ? "italic text-subtle" : ""}>
                  {a.url ? (
                    <a href={a.url} target="_blank" rel="noreferrer">
                      {a.titulo ?? HIDDEN_TITLE}
                    </a>
                  ) : (
                    (a.titulo ?? HIDDEN_TITLE)
                  )}
                </span>
                <span className="text-sm text-subtle">
                  {date(a.fecha)} ·{" "}
                  {a.organismoId ? (
                    <Link to="/organismos/$id" params={{ id: a.organismoId }}>
                      {agencyName(a.organismo ?? a.organismoId)}
                    </Link>
                  ) : (
                    "Sin organismo"
                  )}{" "}
                  · {procedure(a.procedimiento)}
                </span>
              </div>
              <span className="shrink-0 text-sm tabular">{money(a.monto, a.moneda)}</span>
            </li>
          ))}
        </ul>
      </Section>

      <SourceNote origin={p.origen} />
    </div>
  );
}
