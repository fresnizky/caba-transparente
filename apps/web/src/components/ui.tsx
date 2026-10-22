/** Building blocks of every page: headers, sections, figures, bars and the source of each number. */

import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { count, date, int, pesos } from "../lib.ts";
import type { Pesos } from "../pesos.tsx";
import type { Origin, OtherCurrencies, YearRow } from "../types.ts";

export function PageHeader({ topic, title, children }: { topic?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3 pb-6">
      {topic && <p className="text-sm font-medium uppercase tracking-wide text-subtle">{topic}</p>}
      <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h1>
      {children && <div className="max-w-2xl text-lg text-muted text-pretty">{children}</div>}
    </header>
  );
}

export function Section({ id, title, children, note }: { id?: string; title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-titulo` : undefined} className="flex flex-col gap-4 border-t border-line py-8">
      <div className="flex flex-col gap-1">
        <h2 id={id ? `${id}-titulo` : undefined} className="text-xl font-semibold tracking-tight">
          {title}
        </h2>
        {note && <p className="text-sm text-subtle">{note}</p>}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line p-4">
      <span className="text-sm text-subtle">{label}</span>
      <span className="text-2xl font-semibold tracking-tight tabular">{value}</span>
      {note && <span className="text-sm text-subtle">{note}</span>}
    </div>
  );
}

export const Stats = ({ children }: { children: ReactNode }) => (
  <div className="grid grid-cols-2 gap-3 pb-8 lg:grid-cols-4">{children}</div>
);

export function Notice({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div role="note" className="rounded-lg border border-accent bg-accent-soft p-4 text-sm text-ink">
      {title && <p className="font-semibold">{title}</p>}
      <div className="text-pretty">{children}</div>
    </div>
  );
}

/** Horizontal bars: a ranking where each row says its value. */
export function BarList({
  rows,
  format = pesos,
}: {
  rows: { key: string; label: ReactNode; value: number; detail?: ReactNode }[];
  format?: (n: number) => string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ol className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.key} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-4">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="shrink-0 tabular text-muted">{format(r.value)}</span>
          </div>
          <div className="h-2 rounded-full bg-panel" aria-hidden>
            <div className="h-2 rounded-full bg-bar" style={{ width: `${Math.max(0.5, (r.value / max) * 100)}%` }} />
          </div>
          {r.detail && <span className="text-sm text-subtle">{r.detail}</span>}
        </li>
      ))}
    </ol>
  );
}

/** Amount awarded per year. The last year is drawn lighter when it is not complete. In constant pesos, years the
 * index does not cover are left out. */
export function YearChart({ rows, lastComplete, pesos: p }: { rows: YearRow[]; lastComplete: number | null; pesos: Pesos }) {
  const shown = rows.filter((r) => p.value(r) !== null);
  const max = Math.max(...shown.map((r) => p.value(r) ?? 0), 1);
  const partial = (r: YearRow) => lastComplete !== null && r.anio > lastComplete;
  if (!shown.length) return <Empty>Sin compras desde {p.constantes?.desde}, el primer año que cubre el índice.</Empty>;
  return (
    <figure className="flex flex-col gap-2">
      <div
        className="flex h-48 items-end gap-1 sm:gap-2"
        role="img"
        aria-label={`Contratos adjudicados por año, por su monto total. ${p.unit}.`}
      >
        {shown.map((r) => (
          <div key={r.anio} className="group flex h-full flex-1 flex-col justify-end" title={`${r.anio}: ${p.format(r)}`}>
            <div
              className={`rounded-t ${partial(r) ? "bg-bar-soft" : "bg-bar"} group-hover:bg-link`}
              style={{ height: `${Math.max(0.5, ((p.value(r) ?? 0) / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1 text-xs text-subtle tabular sm:gap-2" aria-hidden>
        {shown.map((r) => (
          <span key={r.anio} className="flex-1 text-center">
            <span className="hidden sm:inline">{r.anio}</span>
            <span className="sm:hidden">{String(r.anio).slice(2)}</span>
          </span>
        ))}
      </div>
      <figcaption className="text-sm text-subtle">
        Cada contrato suma su monto total en el año en que se adjudicó, aunque dure varios años: no es lo que se gastó ese año.{" "}
        {p.real ? `${p.unit}, ajustados por inflación.` : "Pesos de cada año, sin ajustar por inflación."}
        {shown.some(partial) && " En gris claro, el año en curso (incompleto)."}
      </figcaption>
      <table className="sr-only">
        <caption>Contratos adjudicados por año, por su monto total. {p.unit}.</caption>
        <tbody>
          {shown.map((r) => (
            <tr key={r.anio}>
              <th>{r.anio}</th>
              <td>{p.format(r)}</td>
              <td>{count(r.adjudicaciones, "adjudicación", "adjudicaciones")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function OtherCurrenciesNote({ amounts }: { amounts: OtherCurrencies }) {
  const parts = Object.entries(amounts)
    .filter(([, v]) => v > 0)
    .map(([c, v]) => `${c === "USD" ? "US$" : c === "EUR" ? "€" : c} ${int(v)}`);
  if (!parts.length) return null;
  return <p className="text-sm text-subtle">Además, adjudicaciones en otras monedas que no se suman a los pesos: {parts.join(" y ")}.</p>;
}

/** Where the numbers of a page come from: every page that shows numbers ends with this. */
export function SourceNote({ origin, children }: { origin: Origin; children?: ReactNode }) {
  return (
    <aside className="mt-4 flex flex-col gap-1 rounded-lg bg-panel p-4 text-sm text-muted">
      <p>
        <span className="font-medium text-ink">Fuente: </span>
        <a href={origin.url} target="_blank" rel="noreferrer">
          {origin.nombre}
        </a>
        {origin.descargado && `, descargado el ${date(origin.descargado)}`}.{" "}
        {origin.datos && (
          <>
            <a href={origin.datos} target="_blank" rel="noreferrer">
              Datos procesados
            </a>{" "}
            ·{" "}
          </>
        )}
        <Link to="/como-leer">Cómo leer estos números</Link>
      </p>
      {children}
    </aside>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-line p-6 text-center text-subtle">{children}</p>;
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-xl text-left text-sm">
        <thead className="border-b border-line text-subtle">
          <tr>
            {head.map((h, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: fixed header
              <th key={i} scope="col" className={`py-2 pr-4 font-medium ${i > 0 ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  );
}

export const Cell = ({ children, first }: { children: ReactNode; first?: boolean }) => (
  <td className={`py-2 pr-4 align-top ${first ? "" : "text-right tabular whitespace-nowrap"}`}>{children}</td>
);

export function SearchInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-subtle">{label}</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-line px-3 py-2 text-base outline-none focus:border-link"
      />
    </label>
  );
}
