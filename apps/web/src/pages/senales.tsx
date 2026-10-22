import { getRouteApi, Link } from "@tanstack/react-router";

import { Notice, PageHeader, Section, SourceNote } from "../components/ui.tsx";
import { int, pesos } from "../lib.ts";
import type { Signal } from "../types.ts";

const route = getRouteApi("/senales");

function SignalCard({ s }: { s: Signal }) {
  return (
    <article id={s.id} className="flex flex-col gap-4 rounded-lg border border-line p-5">
      <h3 className="text-lg text-balance">
        <span className="text-3xl font-semibold tracking-tight tabular">{s.cifra}</span> {s.titulo}
      </h3>
      <p className="text-muted text-pretty">{s.descripcion}</p>
      <Notice title="El matiz">{s.matiz}</Notice>
      {s.casos.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-link">
            Ver{" "}
            {s.casos.length < s.totalCasos
              ? `los ${s.casos.length} casos principales de ${int(s.totalCasos)}`
              : `los ${s.casos.length} casos`}
          </summary>
          <ol className="mt-3 flex flex-col divide-y divide-line">
            {s.casos.map((c, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: cases have no id and the list never changes
              <li key={i} className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                <div className="flex min-w-0 flex-col">
                  <span>
                    {c.url ? (
                      <a href={c.url} target="_blank" rel="noreferrer">
                        {c.titulo}
                      </a>
                    ) : c.organismoId ? (
                      <Link to="/organismos/$id" params={{ id: c.organismoId }}>
                        {c.titulo}
                      </Link>
                    ) : (
                      c.titulo
                    )}
                  </span>
                  <span className="text-sm text-subtle">
                    {c.url && c.organismoId ? (
                      <Link to="/organismos/$id" params={{ id: c.organismoId }}>
                        {c.detalle}
                      </Link>
                    ) : (
                      c.detalle
                    )}
                  </span>
                </div>
                {c.monto !== undefined && <span className="shrink-0 text-sm tabular">{pesos(c.monto)}</span>}
              </li>
            ))}
          </ol>
        </details>
      )}
      <p className="text-sm text-subtle">
        <span className="font-medium">Cómo se calculó: </span>
        {s.metodo}
      </p>
    </article>
  );
}

export function SenalesPage() {
  const { origen, senales } = route.useLoaderData();
  const topics = [...new Set(senales.map((s) => s.tema))];

  return (
    <div className="flex flex-col">
      <PageHeader topic="Señales" title="Lo que los datos muestran y nadie explica">
        Patrones en las compras de la Ciudad que merecen una respuesta. Una señal es una pregunta, no una acusación: cada una dice cómo se
        calculó, lista sus casos y trae al lado lo que podría explicarla.
      </PageHeader>
      {topics.map((t) => (
        <Section key={t} title={t}>
          <div className="flex flex-col gap-4">
            {senales
              .filter((s) => s.tema === t)
              .map((s) => (
                <SignalCard key={s.id} s={s} />
              ))}
          </div>
        </Section>
      ))}
      <Section title="Lo que no se puede mirar">
        <p className="text-muted text-pretty">
          Cuántas compras tuvieron un solo oferente, que es la señal más directa de poca competencia, no se puede calcular: los datos
          abiertos de Buenos Aires Compras no dicen cuántas ofertas recibió cada compra.{" "}
          <Link to="/no-publicado">Lo que no se publica</Link>
        </p>
      </Section>
      <SourceNote origin={origen} />
    </div>
  );
}
