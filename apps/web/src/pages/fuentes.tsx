import { getRouteApi, Link } from "@tanstack/react-router";

import { PageHeader, Section } from "../components/ui.tsx";
import { bytes, date, int } from "../lib.ts";
import type { DatasetInfo, SourceInfo } from "../types.ts";

const fuentesRoute = getRouteApi("/fuentes");
const datosRoute = getRouteApi("/datos");

const STATUS: Record<string, { label: string; className: string }> = {
  activo: { label: "Con datos", className: "bg-green-100 text-green-900" },
  relevado: { label: "En preparación", className: "bg-panel text-muted" },
  roto: { label: "Con errores", className: "bg-red-100 text-red-900" },
  pausado: { label: "Pausada", className: "bg-panel text-muted" },
};

function SourceCard({ s }: { s: SourceInfo }) {
  const st = STATUS[s.estado] ?? { label: s.estado, className: "bg-panel text-muted" };
  return (
    <li id={s.id} className="flex flex-col gap-2 rounded-lg border border-line p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{s.nombre}</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.className}`}>{st.label}</span>
      </div>
      <p className="text-sm text-muted">
        {s.organismo} · {s.formato} · {s.frecuencia}
      </p>
      {s.archivos > 0 && (
        <p className="text-sm">
          {int(s.archivos)} archivos originales ({bytes(s.bytes)}), última descarga el {date(s.ultimaDescarga)}.
          {s.datasets > 0 && (
            <>
              {" "}
              <Link to="/datos" hash={s.id}>
                Datos procesados
              </Link>
            </>
          )}
        </p>
      )}
      {s.datosPersonales && <p className="text-sm text-subtle">Datos personales en el original: {s.datosPersonales}.</p>}
      <a href={s.url} target="_blank" rel="noreferrer" className="text-sm">
        Sitio oficial
      </a>
    </li>
  );
}

export function FuentesPage() {
  const { fuentes } = fuentesRoute.useLoaderData();
  const withData = fuentes.filter((f) => f.estado === "activo");
  const pending = fuentes.filter((f) => f.estado !== "activo");
  return (
    <div className="flex flex-col">
      <PageHeader topic="Fuentes" title="De dónde sale cada número">
        Cada archivo se descarga del sitio oficial y se guarda tal cual llegó, con su huella sha256, antes de ordenarlo. Si el organismo
        después lo cambia o lo borra, la copia sigue disponible.
      </PageHeader>
      <Section title="Con datos">
        <ul className="grid gap-3 sm:grid-cols-2">
          {withData.map((s) => (
            <SourceCard key={s.id} s={s} />
          ))}
        </ul>
      </Section>
      {pending.length > 0 && (
        <Section title="En preparación" note="Relevadas: sabemos qué publican y dónde, pero todavía no las descargamos.">
          <ul className="grid gap-3 sm:grid-cols-2">
            {pending.map((s) => (
              <SourceCard key={s.id} s={s} />
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function DatasetCard({ d }: { d: DatasetInfo }) {
  const rows = d.archivos.reduce((sum, a) => sum + a.filas, 0);
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-line p-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold">{d.titulo}</h3>
        <p className="text-sm text-muted">{d.descripcion}</p>
        <p className="text-sm text-subtle">
          {int(rows)} filas en {d.archivos.length} {d.archivos.length === 1 ? "archivo" : "archivos"} · {d.licencia}
        </p>
      </div>
      {!d.publicado && <p className="text-sm text-subtle">Todavía no están publicados para descargar.</p>}
      <ul className="flex flex-wrap gap-2 text-sm">
        {d.archivos.map((a) => (
          <li key={a.parte}>
            {d.publicado ? (
              <a
                href={a.url}
                className="inline-block rounded-md border border-line px-2 py-1 tabular hover:border-link"
                title={`${int(a.filas)} filas`}
              >
                {a.parte}.csv <span className="text-subtle">{bytes(a.bytes)}</span>
              </a>
            ) : (
              <span className="inline-block rounded-md border border-dashed border-line px-2 py-1 tabular text-muted">
                {a.parte}.csv <span className="text-subtle">{bytes(a.bytes)}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
      <details>
        <summary className="cursor-pointer text-sm font-medium text-link">Columnas</summary>
        <dl className="mt-2 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
          {Object.entries(d.columnas).map(([c, desc]) => (
            <div key={c} className="contents">
              <dt className="font-mono text-xs leading-5">{c}</dt>
              <dd className="text-muted">{desc}</dd>
            </div>
          ))}
        </dl>
      </details>
      {d.notas.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-subtle">
          {d.notas.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function DatosPage() {
  const { fuentes, datasets } = datosRoute.useLoaderData();
  const sources = fuentes.filter((f) => datasets.some((d) => d.fuente === f.id));
  return (
    <div className="flex flex-col">
      <PageHeader topic="Datos" title="Descargar los datos">
        Todos los datos ordenados, en CSV (UTF-8, columnas en español). Montos en pesos nominales de cada año. Se pueden usar para cualquier
        fin citando la fuente (CC BY 4.0).
      </PageHeader>
      {sources.map((s) => (
        <Section key={s.id} id={s.id} title={s.nombre}>
          <div className="flex flex-col gap-3">
            {datasets
              .filter((d) => d.fuente === s.id)
              .map((d) => (
                <DatasetCard key={`${d.fuente}/${d.nombre}`} d={d} />
              ))}
          </div>
        </Section>
      ))}
    </div>
  );
}
