import { getRouteApi } from "@tanstack/react-router";

import { PageHeader, Section } from "../components/ui.tsx";

const route = getRouteApi("/no-publicado");

export function NoPublicadoPage() {
  const items = route.useLoaderData();
  return (
    <div className="flex flex-col">
      <PageHeader topic="Lo que no se publica" title="Lo que debería ser público y no está">
        Datos que el Gobierno de la Ciudad no publica, publica a medias o dejó de actualizar. Cualquier persona puede pedirlos por la Ley
        104 de acceso a la información pública.
      </PageHeader>
      <Section title={`${items.length} faltantes encontrados hasta ahora`}>
        <ul className="flex flex-col gap-4">
          {items.map((i) => (
            <li key={i.id} id={i.id} className="flex flex-col gap-2 rounded-lg border border-line p-4">
              <h3 className="font-semibold text-balance">{i.titulo}</h3>
              <p className="text-muted text-pretty">{i.descripcion}</p>
              <p className="text-sm text-subtle">
                <span className="font-medium">Qué encontramos: </span>
                {i.evidencia}
              </p>
              <p className="text-sm text-subtle">
                <span className="font-medium">Quién debería publicarlo: </span>
                {i.organismo}
                {i.url && (
                  <>
                    {" · "}
                    <a href={i.url} target="_blank" rel="noreferrer">
                      Ver la publicación oficial
                    </a>
                  </>
                )}
              </p>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
