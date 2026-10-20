# Datos y archivo

## `data/raw/<fuente>/`: los originales

- Cada descarga se guarda tal cual llegó en `data/raw/<fuente>/<AAAA-MM-DD>/` y se registra en `manifest.jsonl`: archivo, URL, fecha, sha256, tamaño y si está comprimido (gzip por encima de 1 MB).
- **Solo se agrega, nunca se edita ni se borra.** Si el contenido no cambió, no se guarda de nuevo. Si el mismo día llega una versión distinta, la nueva lleva la hora en el nombre.
- **Qué cuenta como cambio:** en archivos de datos, cualquier byte distinto. En HTML, solo el texto visible, los links y las imágenes (`contentFingerprint()` en `packages/core/src/fetch.ts`), para no guardar copias por tokens o nonces que cambian en cada visita. Si aparece un caso nuevo, se suma a `VOLATILE_LINK_PARTS`.
- Los originales no se commitean; los `manifest.jsonl` sí (decisión D-03 en `docs/decisiones.md`).

## Copias en archive.org

`bun run archivar [fuentes...]` hace dos copias de cada original y las anota en `data/raw/<fuente>/archive-org.jsonl` (solo agregar):

- **`item`:** el original, subido a un ítem `caba-transparente-<fuente>-<AAAA-MM>` junto con el `manifest.jsonl` completo.
- **`wayback`:** una captura de la URL oficial en la Wayback Machine. Es la prueba de que en esa fecha el Estado publicaba eso.

Necesita las claves S3 de archive.org (https://archive.org/account/s3.php) en `IA_ACCESS_KEY` e `IA_SECRET_KEY`. Se pueden guardar en `.env.archive-org` (no se commitea) y correr `bun --env-file=.env.archive-org run archivar`. Es idempotente y retomable: `--max-minutos`, `--max-capturas`, `--solo-items`, `--solo-wayback`.

**Datos personales:** lo que se sube a archive.org es, en la práctica, irreversible, y la Wayback guarda siempre el original. Qué se archiva de las fuentes con datos personales está pendiente (D-04 en `docs/decisiones.md`). Hasta que se decida, esas fuentes van en `WAYBACK_EXCLUDED` (`packages/scrapers/src/archive-org.ts`) y `archivar` las saltea: no sube sus originales a ningún ítem ni pide captura a la Wayback Machine.

## `data/processed/<fuente>/`: los normalizados

- CSV UTF-8, columnas en `snake_case`, una fila por observación, escritos con `writeProcessed()`.
- Montos en pesos nominales y en su escala real (pesos, no miles ni millones, salvo que la columna lo diga).
- Junto a cada CSV, su `<archivo>.meta.json` con título, descripción y qué es cada columna.

## `data/curado/`

Contenido escrito o revisado a mano (por ejemplo, la tabla que une los nombres y códigos de cada organismo entre fuentes). Cada entrada cita la fuente oficial y la fecha de revisión.
