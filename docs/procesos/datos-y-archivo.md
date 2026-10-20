# Datos y archivo

## `data/raw/<fuente>/`: los originales

- Cada descarga se guarda tal cual llegó en `data/raw/<fuente>/<AAAA-MM-DD>/` y se registra en `manifest.jsonl`: archivo, URL, fecha, sha256, tamaño y si está comprimido (gzip por encima de 1 MB).
- **Solo se agrega, nunca se edita ni se borra.** Si el contenido no cambió, no se guarda de nuevo. Si el mismo día llega una versión distinta, la nueva lleva la hora en el nombre.
- **Qué cuenta como cambio:** en archivos de datos, cualquier byte distinto. En HTML, solo el texto visible, los links y las imágenes (`contentFingerprint()` en `packages/core/src/fetch.ts`), para no guardar copias por tokens o nonces que cambian en cada visita. Si aparece un caso nuevo, se suma a `VOLATILE_LINK_PARTS`.
- Los originales no se commitean; los `manifest.jsonl` y `archive-org.jsonl` sí (decisión D-03 en `docs/decisiones.md`).

## Copias en archive.org

`bun run archivar [fuentes...]` hace dos copias de cada original y las anota en `data/raw/<fuente>/archive-org.jsonl` (solo agregar):

- **`item`:** el original, subido a un ítem `caba-transparente-<fuente>-<AAAA-MM>` junto con el `manifest.jsonl` completo.
- **`wayback`:** una captura de la URL oficial en la Wayback Machine. Es la prueba de que en esa fecha el Estado publicaba eso.

Necesita las claves S3 de archive.org (https://archive.org/account/s3.php) en `IA_ACCESS_KEY` e `IA_SECRET_KEY`. Se pueden guardar en `.env.archive-org` (no se commitea) y correr `bun --env-file=.env.archive-org run archivar`. Es idempotente y retomable: `--max-minutos`, `--max-capturas`, `--solo-items`, `--solo-wayback`.

**Datos personales:** lo que se sube a archive.org es, en la práctica, irreversible, y la Wayback guarda siempre el original. Qué se archiva de las fuentes con datos personales está pendiente (D-04 en `docs/decisiones.md`). Hasta que se decida, esas fuentes van en `RAW_EXCLUDED` (`packages/scrapers/src/raw-excluded.ts`) y `archivar` las saltea: no sube sus originales a ningún ítem ni pide captura a la Wayback Machine.

## Copia en Cloudflare R2

`bun run subir-r2 [fuentes...]` copia a R2 (decisión D-05) los originales y los procesados, con la misma ruta que tienen en `data/`. Quedan públicos en `https://archivo.caba-transparente.com.ar/<ruta>`, por ejemplo `https://archivo.caba-transparente.com.ar/data/processed/compras-bac/procesos/2026.csv`.

- **Originales** (`data/raw/<fuente>/`): cada archivo del `manifest.jsonl` que esté en `data/raw/` local, más los manifests. Como una ruta de `data/raw` nunca cambia de contenido, se saltea lo que ya está en R2 con el mismo tamaño. Las fuentes de `RAW_EXCLUDED` no se suben.
- **Procesados** (`data/processed/<fuente>/`): todos los archivos. Se reemplazan cuando cambia el contenido (se compara el MD5).
- No borra nada de R2: lo que está allá y ya no acá solo se lista. Es idempotente; `--simular` muestra qué subiría y `--solo-raw` o `--solo-procesados` limitan la corrida.

Necesita un token de R2 con permiso *Object Read & Write* sobre el bucket, guardado en `.env.r2` (no se commitea):

```
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=caba-transparente
```

## `data/processed/<fuente>/`: los normalizados

- CSV UTF-8, columnas en `snake_case`, una fila por observación, escritos con `writeProcessed()`.
- Montos en pesos nominales y en su escala real (pesos, no miles ni millones, salvo que la columna lo diga).
- Junto a cada CSV, su `<archivo>.meta.json` con título, descripción y qué es cada columna.
- No van a git: se publican en R2 con `bun run subir-r2` (D-03). Para regenerarlos: `bun run scrape <fuente> --solo-procesar`.

## `data/curado/`

Contenido escrito o revisado a mano (por ejemplo, la tabla que une los nombres y códigos de cada organismo entre fuentes). Cada entrada cita la fuente oficial y la fecha de revisión. Es lo único de `data/` que va a git, además de los manifests.
