import { Link, Outlet } from "@tanstack/react-router";

import { PesosProvider } from "../pesos.tsx";

const NAV = [
  { to: "/compras", label: "Compras" },
  { to: "/organismos", label: "Organismos" },
  { to: "/proveedores", label: "Proveedores" },
  { to: "/senales", label: "Señales" },
  { to: "/boletin", label: "Boletín" },
  { to: "/fuentes", label: "Fuentes" },
] as const;

const FOOTER = [
  { to: "/como-leer", label: "Cómo leer los datos" },
  { to: "/no-publicado", label: "Lo que no se publica" },
  { to: "/datos", label: "Descargar los datos" },
  { to: "/fuentes", label: "Fuentes" },
] as const;

export const REPO_URL = "https://github.com/fresnizky/caba-transparente";

export function Layout() {
  return (
    <PesosProvider>
      <div className="flex min-h-dvh flex-col">
        <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:p-2">
          Ir al contenido
        </a>
        <div className="bg-ink px-4 py-1.5 text-center text-xs text-white">
          Versión en preparación: los datos y las páginas pueden cambiar.
        </div>
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link to="/" className="flex items-center gap-2 font-semibold text-ink hover:no-underline">
              <img src="/favicon.svg" alt="" className="size-6" />
              CABA Transparente
            </Link>
            <nav aria-label="Secciones" className="-mx-2 flex flex-1 gap-1 overflow-x-auto text-sm">
              {NAV.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  className="rounded-md px-2 py-1 whitespace-nowrap text-muted hover:bg-panel hover:text-ink hover:no-underline"
                  activeProps={{ className: "bg-panel text-ink font-medium" }}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <main id="contenido" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
          <Outlet />
        </main>
        <footer className="border-t border-line bg-panel">
          <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 text-sm text-muted">
            <nav aria-label="Más" className="flex flex-wrap gap-x-6 gap-y-2">
              {FOOTER.map((n) => (
                <Link key={n.to} to={n.to}>
                  {n.label}
                </Link>
              ))}
              <a href={REPO_URL} target="_blank" rel="noreferrer">
                Código
              </a>
            </nav>
            <p className="max-w-2xl text-pretty">
              Datos oficiales del Gobierno de la Ciudad de Buenos Aires, guardados tal cual se publicaron y con la fuente de cada número.
              Código MIT, datos procesados{" "}
              <a href="https://creativecommons.org/licenses/by/4.0/deed.es" target="_blank" rel="noreferrer">
                CC BY 4.0
              </a>
              . Los documentos originales pertenecen a sus organismos.
            </p>
          </div>
        </footer>
      </div>
    </PesosProvider>
  );
}
