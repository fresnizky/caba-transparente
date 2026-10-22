import { getRouteApi, Link } from "@tanstack/react-router";

import { Section, Stat, Stats } from "../components/ui.tsx";
import { date, int } from "../lib.ts";
import { usePesos } from "../pesos.tsx";

const route = getRouteApi("/");

const SECTIONS = [
  { to: "/compras", title: "Compras", question: "¿Qué compra la Ciudad, cómo y a quién?" },
  { to: "/organismos", title: "Organismos", question: "¿Cuánto compró cada ministerio, hospital o dirección?" },
  { to: "/proveedores", title: "Proveedores", question: "¿A qué empresas les compra la Ciudad?" },
  { to: "/senales", title: "Señales", question: "¿Qué patrones en las compras merecen una explicación?" },
  { to: "/boletin", title: "Boletín Oficial", question: "¿Qué normas y avisos publicó la Ciudad cada día?" },
  { to: "/no-publicado", title: "Lo que no se publica", question: "¿Qué debería ser público y no está?" },
  { to: "/fuentes", title: "Fuentes", question: "¿De dónde sale cada número y cuándo se descargó?" },
] as const;

export function HomePage() {
  const { compras, senales, catalogo } = route.useLoaderData();
  const lastYear = compras?.porAnio.find((y) => y.anio === compras.ultimoAnioCompleto);
  const p = usePesos(compras?.constantes ?? null);
  const active = catalogo.fuentes.filter((f) => f.estado === "activo");
  const pending = catalogo.fuentes.filter((f) => f.estado !== "activo");

  return (
    <div className="flex flex-col">
      <header className="flex flex-col gap-4 pb-8">
        <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          La Ciudad de Buenos Aires, con los números sobre la mesa.
        </h1>
        <p className="max-w-2xl text-lg text-muted text-pretty">
          En qué gasta la Ciudad, a quién le compra y qué falta publicar. Datos oficiales del Gobierno porteño, guardados tal cual se
          publicaron, ordenados y con la fuente de cada número.
        </p>
      </header>

      {compras && lastYear && (
        <Stats>
          <Stat
            label={`Adjudicado en ${lastYear.anio}`}
            value={p.format(lastYear)}
            note={`Contratos de ese año, por toda su duración. ${p.real ? p.unit.replace(/, desde \d+$/, "") : "En pesos de ese año"}.`}
          />
          <Stat label={`Compras en ${lastYear.anio}`} value={int(lastYear.procesos)} note="Procesos publicados en BAC" />
          <Stat
            label="Empresas proveedoras"
            value={int(compras.totales.proveedores)}
            note={`Desde ${compras.totales.desde?.slice(0, 4)}`}
          />
          <Stat label="Señales para mirar" value={int(senales?.senales.length ?? 0)} note="Patrones con sus casos" />
        </Stats>
      )}

      <Section title="Qué vas a encontrar">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SECTIONS.map((s) => (
            <li key={s.to}>
              <Link
                to={s.to}
                className="flex h-full flex-col gap-1 rounded-lg border border-line p-4 text-ink hover:border-ink hover:no-underline"
              >
                <span className="font-semibold">{s.title}</span>
                <span className="text-sm text-muted">{s.question}</span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Qué datos hay hoy" note="El proyecto recién empieza: se suman fuentes de a una, con su archivo original guardado.">
        <ul className="flex flex-col gap-2">
          {active.map((f) => (
            <li key={f.id} className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium">{f.nombre}</span>
              <span className="text-sm text-subtle">
                {f.ultimaDescarga ? `descargado el ${date(f.ultimaDescarga)}` : "sin descargas todavía"}
              </span>
            </li>
          ))}
        </ul>
        {pending.length > 0 && (
          <p className="text-sm text-muted">
            En preparación: {pending.map((f) => f.nombre).join(", ")}. <Link to="/fuentes">Ver todas las fuentes</Link>.
          </p>
        )}
      </Section>
    </div>
  );
}
