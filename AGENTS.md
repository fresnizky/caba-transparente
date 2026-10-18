# CABA Transparente: guía para agentes

Guía única para cualquier agente (Claude Code, Codex, Cursor…). `CLAUDE.md` solo la importa.

Proyecto cívico: recopilar los datos públicos del Gobierno de la Ciudad de Buenos Aires, archivarlos tal cual, normalizarlos y publicarlos con la fuente de cada número. Antes de empezar, leer `docs/decisiones.md` y `docs/relevamiento-fuentes.md`.

## Idioma

| Qué | Idioma |
|---|---|
| Código: variables, funciones, tipos, nombres de archivo, comentarios | Inglés |
| Documentación: `docs/`, README, este archivo, mensajes de commit | Español |
| Columnas de los CSV publicados (`data/processed`) | Español, `snake_case`. Son un contrato público: no se renombran sin plan de migración |

## Datos

- Descargar siempre con `get()` + `archive()` o `fetchAndArchive()` de `@ct/core`: mandan User-Agent de navegador, reintentan y registran cada descarga en `data/raw/<id>/manifest.jsonl` con su sha256.
- `data/raw/` es de solo agregar: nunca editar ni borrar un original. Los originales no van a git; los `manifest.jsonl` y `archive-org.jsonl` sí (decisión D-03).
- Archivos que no entran en memoria (los CSV de Buenos Aires Compras pesan entre 250 MB y 2,6 GB): procesar en streaming.
- Datos normalizados: CSV UTF-8 con `writeProcessed()`, columnas en `snake_case`, montos en pesos nominales. Cada CSV lleva su `<archivo>.meta.json`.
- Cada recolector es idempotente: correrlo dos veces seguidas no duplica nada.
- Ser amable con los servidores: pedidos en secuencia y con pausa. `data.buenosaires.gob.ar` tiene un firewall que bloquea ráfagas de pedidos (ver `docs/relevamiento-fuentes.md`).
- Para saber si un archivo cambió, usar `Last-Modified`/`ETag` del servidor, no el `last_modified` del catálogo CKAN (no es confiable).

## Datos personales (regla sin excepciones)

- Se publican nombre, cargo y organismo de funcionarios (actos públicos). Nunca DNI, CUIL, edad, domicilio, mail personal ni familiares: se quitan **antes** de archivar, y la fuente se agrega a `WAYBACK_EXCLUDED` (`packages/scrapers/src/archive-org.ts`) en el mismo commit.
- A los proveedores que son personas humanas (CUIT 20, 23, 24, 27) no se los perfila.
- Solo se usa lo que el Estado publica. Nunca pasar un login o un captcha, ni guardar datos expuestos por error.

## Código

- Monorepo con Bun workspaces, TypeScript estricto. Bun ejecuta TS directo, sin build.
- Un recolector por fuente: `packages/scrapers/src/sources/<id>.ts`, que exporta `async function run(args: string[])`. Se corre con `bun run scrape <id>`. El `id` es también la carpeta en `data/raw/<id>/` y `data/processed/<id>/`.
- Antes de escribir una función auxiliar, buscar en `packages/core/src/util.ts`.
- Al terminar una fuente, actualizar su `estado` en `sources.yaml`.

## Verificación

`bun run typecheck`, `bun test` y `bun run lint` antes de dar algo por terminado.
