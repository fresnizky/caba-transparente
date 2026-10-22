import { type ErrorComponentProps, Link } from "@tanstack/react-router";

import { REPO_URL } from "./layout.tsx";

export function RouteNotFound() {
  return (
    <div className="flex flex-col gap-3 py-12">
      <h1 className="text-2xl font-semibold">No encontramos esta página</h1>
      <p className="text-muted">
        Puede que el enlace esté mal o que todavía no tengamos esos datos. <Link to="/">Volver al inicio</Link>.
      </p>
    </div>
  );
}

export function RouteError({ error }: ErrorComponentProps) {
  return (
    <div className="flex flex-col gap-3 py-12">
      <h1 className="text-2xl font-semibold">No se pudo cargar esta página</h1>
      <p className="text-muted">
        Probá recargar en un rato. Si sigue pasando,{" "}
        <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">
          contanos
        </a>
        .
      </p>
      {import.meta.env.DEV && <pre className="overflow-x-auto rounded-lg bg-panel p-4 text-sm">{String(error)}</pre>}
    </div>
  );
}
