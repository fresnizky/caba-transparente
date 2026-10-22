import { getRouteApi, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { Empty, PageHeader, SearchInput, Section, SourceNote } from "../components/ui.tsx";
import { count, date, int, searchKey } from "../lib.ts";
import type { BulletinNorm } from "../types.ts";

const indexRoute = getRouteApi("/boletin");
const detailRoute = getRouteApi("/boletin/$numero");

export function BoletinPage() {
  const { origen, boletines } = indexRoute.useLoaderData();
  const total = boletines.reduce((sum, b) => sum + b.normas, 0);
  return (
    <div className="flex flex-col">
      <PageHeader topic="Boletín Oficial" title="Lo que publica cada día el Boletín Oficial">
        El índice de cada edición: resoluciones, disposiciones, licitaciones y avisos, con el enlace a cada documento. Por ahora,{" "}
        {int(boletines.length)} ediciones y {int(total)} normas; el archivo completo se va sumando hacia atrás.
      </PageHeader>
      <Section title="Ediciones">
        <ul className="flex flex-col divide-y divide-line">
          {boletines.map((b) => (
            <li key={b.numero} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
              <Link to="/boletin/$numero" params={{ numero: String(b.numero) }} className="font-medium">
                Boletín N° {b.numero} · {date(b.fecha)}
              </Link>
              <span className="text-sm text-subtle tabular">
                {count(b.normas, "norma", "normas")} · {count(b.anexos, "anexo", "anexos")}
              </span>
            </li>
          ))}
        </ul>
      </Section>
      <SourceNote origin={origen}>
        <p>
          Sale del índice que publica la API del Boletín, no del texto de los documentos. Los sumarios de los edictos y los que traen un DNI
          o CUIL no se muestran: nombran a particulares.
        </p>
      </SourceNote>
    </div>
  );
}

function NormRow({ n }: { n: BulletinNorm }) {
  return (
    <li className="flex flex-col gap-0.5 py-3">
      <span>
        {n.url ? (
          <a href={n.url} target="_blank" rel="noreferrer">
            {n.nombre}
          </a>
        ) : (
          n.nombre
        )}
        {n.anexos > 0 && <span className="text-sm text-subtle"> · {count(n.anexos, "anexo", "anexos")}</span>}
      </span>
      {n.sumario ? (
        <span className="text-muted text-pretty">{n.sumario}</span>
      ) : (
        n.oculto && <span className="text-sm italic text-subtle">Sumario oculto: nombra a particulares</span>
      )}
      <span className="text-sm text-subtle">{[n.tipo, n.organismo].filter(Boolean).join(" · ")}</span>
    </li>
  );
}

export function BoletinDetallePage() {
  const b = detailRoute.useLoaderData();
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = searchKey(query.trim());
    if (!q) return b.items;
    return b.items.filter((n) => searchKey([n.nombre, n.sumario, n.tipo, n.organismo].filter(Boolean).join(" ")).includes(q));
  }, [b.items, query]);
  const sections = b.secciones.map((s) => s.seccion).filter((s) => shown.some((n) => n.seccion === s));

  return (
    <div className="flex flex-col">
      <nav aria-label="Ruta" className="pb-2 text-sm">
        <Link to="/boletin">Boletín Oficial</Link>
      </nav>
      <PageHeader title={`Boletín N° ${b.numero}`}>
        {date(b.fecha)} · {count(b.normas, "norma", "normas")} · {count(b.anexos, "anexo", "anexos")}.{" "}
        {b.url && (
          <a href={b.url} target="_blank" rel="noreferrer">
            Edición completa (PDF)
          </a>
        )}
        {b.urlSeparata && (
          <>
            {" · "}
            <a href={b.urlSeparata} target="_blank" rel="noreferrer">
              Separata
            </a>
          </>
        )}
      </PageHeader>
      <SearchInput label="Buscar en esta edición (nombre, sumario, tipo u organismo)" value={query} onChange={setQuery} />
      {sections.length ? (
        sections.map((s) => {
          const items = shown.filter((n) => n.seccion === s);
          return (
            <Section key={s} title={s} note={count(items.length, "norma", "normas")}>
              <ul className="flex flex-col divide-y divide-line">
                {items.map((n) => (
                  <NormRow key={n.id} n={n} />
                ))}
              </ul>
            </Section>
          );
        })
      ) : (
        <div className="pt-6">
          <Empty>Ninguna norma coincide con «{query}».</Empty>
        </div>
      )}
      <SourceNote origin={b.origen} />
    </div>
  );
}
