import { getRouteApi, Link } from "@tanstack/react-router";

import { BarList, Cell, OtherCurrenciesNote, PageHeader, Section, SourceNote, Stat, Stats, Table, YearChart } from "../components/ui.tsx";
import { agencyName, count, date, int, percent, procedure } from "../lib.ts";
import { PesosToggle, usePesos } from "../pesos.tsx";

const route = getRouteApi("/compras");

export function ComprasPage() {
  const r = route.useLoaderData();
  const t = r.totales;
  const lastYear = r.porAnio.find((y) => y.anio === r.ultimoAnioCompleto);
  const procedures = r.porProcedimiento.filter((p) => p.procesos > 0);
  const totalProcesses = procedures.reduce((sum, p) => sum + p.procesos, 0);
  const p = usePesos(r.constantes);
  const agencies = p.real ? r.topOrganismosReal : r.topOrganismos;
  const suppliers = p.real ? r.topProveedoresReal : r.topProveedores;
  const allYears = p.real ? `desde ${r.constantes?.desde}` : "todos los años";

  return (
    <div className="flex flex-col">
      <PageHeader topic="Compras" title="¿Qué compra la Ciudad, cómo y a quién?">
        Cada compra del Gobierno porteño que pasa por Buenos Aires Compras (BAC), del {date(t.desde)} al {date(t.hasta)}: qué se compró, por
        qué procedimiento y a qué proveedor se le adjudicó.
      </PageHeader>

      <PesosToggle constantes={r.constantes} />

      <Stats>
        {lastYear && (
          <Stat
            label={`Adjudicado en ${lastYear.anio}`}
            value={p.format(lastYear)}
            note={`${count(lastYear.adjudicaciones, "adjudicación", "adjudicaciones")}, por toda su duración`}
          />
        )}
        <Stat label="Procesos de compra" value={int(t.procesos)} note={`${t.desde?.slice(0, 4)} a ${t.hasta?.slice(0, 4)}`} />
        <Stat label="Organismos que compran" value={int(t.organismos)} note="Unidades ejecutoras" />
        <Stat label="Empresas proveedoras" value={int(t.proveedores)} note="Sin contar personas humanas" />
      </Stats>

      <Section id="por-anio" title="Contratos adjudicados por año">
        <YearChart rows={r.porAnio} lastComplete={r.ultimoAnioCompleto} pesos={p} cambio={r.cambio} />
        <OtherCurrenciesNote amounts={t.otrasMonedas} converted={r.cambio !== null} />
      </Section>

      <Section
        id="procedimientos"
        title="Cómo se compra"
        note="La licitación pública es abierta a cualquier proveedor. En la contratación directa el organismo elige a quién comprarle; la contratación menor es un trámite simplificado para montos chicos."
      >
        <Table head={["Procedimiento", "Procesos", "% de los procesos", "Adjudicado"]}>
          {procedures.map((row) => (
            <tr key={row.procedimiento}>
              <Cell first>{procedure(row.procedimiento)}</Cell>
              <Cell>{int(row.procesos)}</Cell>
              <Cell>{percent(row.procesos / totalProcesses)}</Cell>
              <Cell>{p.format(row)}</Cell>
            </tr>
          ))}
        </Table>
        <p className="text-sm text-subtle">
          Procesos: todos los años. Adjudicado: suma de {allYears}. {p.unit}.
        </p>
      </Section>

      <Section id="organismos" title="Los que más compraron" note={`Suma de ${allYears}. ${p.unit}.`}>
        <BarList
          rows={agencies.map((o) => ({
            key: o.id,
            label: (
              <Link to="/organismos/$id" params={{ id: o.id }}>
                {agencyName(o.nombre)}
              </Link>
            ),
            value: p.value(o) ?? 0,
            detail: `${count(o.procesos, "proceso", "procesos")} · ${percent((p.real ? o.directaReal : o.directaMonto) ?? 0)} por contratación directa`,
          }))}
        />
        <Link to="/organismos">Ver los {count(t.organismos, "organismo", "organismos")}</Link>
      </Section>

      <Section id="proveedores" title="Las empresas que más vendieron" note={`Suma de ${allYears}. ${p.unit}.`}>
        <BarList
          rows={suppliers.map((s) => ({
            key: s.cuit,
            label: (
              <Link to="/proveedores/$cuit" params={{ cuit: s.cuit }}>
                {s.nombre}
              </Link>
            ),
            value: p.value(s) ?? 0,
            detail: `${count(s.adjudicaciones, "adjudicación", "adjudicaciones")} · ${count(s.organismos, "organismo", "organismos")}`,
          }))}
        />
        <p className="text-sm text-muted">
          Las personas humanas que le venden a la Ciudad no tienen ficha propia: sumaron {int(r.personasHumanas.adjudicaciones)}{" "}
          adjudicaciones por {p.format(r.personasHumanas)}
          {p.real && ` desde ${r.constantes?.desde}`}. <Link to="/proveedores">Ver todas las empresas</Link>
        </p>
      </Section>

      <SourceNote origin={r.origen}>
        <p>
          Una adjudicación es un lote ganado por un proveedor; un proceso puede tener varias. Cuando BAC no informa la moneda de una
          adjudicación, se toma la de su proceso.
        </p>
      </SourceNote>
    </div>
  );
}
