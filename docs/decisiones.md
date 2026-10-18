# Decisiones

Registro de las decisiones de arquitectura y alcance. Cada una dice qué se decidió, por qué y qué la haría cambiar. Las abiertas están al final.

## D-01. Repo nuevo, con infraestructura adaptada de Mendoza Transparente

**Fecha:** 18/10/2026

Se empieza un repositorio nuevo, no un fork ni una copia de [Mendoza Transparente](https://github.com/unllamas/mendoza-transparente). De ese proyecto se adaptan solo las piezas de infraestructura, que no dependen de la provincia:

- `packages/core/src/fetch.ts`: descarga con reintentos, archivado con sha256 y huella de HTML (`contentFingerprint`).
- `packages/core/src/internet-archive.ts` y `packages/scrapers/src/archive-org.ts`: copia en archive.org (ítems y Wayback Machine).
- `packages/core/src/csv.ts` y el CLI de recolectores.

**Por qué:** un fork arrastra ~534 MB de datos, 26 recolectores, una web y una tabla de organismos de Mendoza que no sirven acá, y ata el proyecto a sincronizar con otro sin necesidad. Empezar de cero desperdiciaría la parte más probada. La licencia MIT permite adaptar el código manteniendo el aviso de copyright (`LICENSE`, y la cabecera de cada archivo adaptado).

**Cambios respecto del original:** identificadores en inglés; el manifest se lee una vez por corrida y no en cada `archive()`; `PROXIED_HOSTS` empieza vacío.

## D-02. Bun y TypeScript, sin Turborepo por ahora

**Fecha:** 18/10/2026

Monorepo con Bun workspaces y TypeScript estricto, igual que Mendoza, para poder seguir trayendo código de ahí. Turborepo se agrega cuando haya una web que construir.

## D-03. Los originales no van a git; los manifests sí

**Fecha:** 18/10/2026

`data/raw/<fuente>/manifest.jsonl` y `archive-org.jsonl` se commitean. Los archivos originales quedan en `data/raw/` en la máquina local (ignorados por git) y se copian a archive.org con `bun run archivar`.

**Por qué:** los CSV de Buenos Aires Compras pesan entre 255 MB y 2,6 GB, y GitHub rechaza archivos de más de 100 MB. Además, el repo de Mendoza ya pesa más de 500 MB con los originales adentro.

**Provisoria:** falta elegir un almacenamiento principal para los originales (ver «Abiertas»). Mientras tanto, la máquina local más archive.org son las dos copias.

## D-04. Datos personales

**Fecha:** 18/10/2026

Se publican nombre, cargo y organismo de funcionarios. Se quitan antes de archivar DNI, CUIL, edad, domicilio, mail y datos de familiares. Las fuentes cuyos originales traen esos datos no se mandan a la Wayback Machine (`WAYBACK_EXCLUDED`), porque la Wayback guarda el original y no nuestra copia limpia. A los proveedores que son personas humanas no se los perfila.

## Abiertas

- **Almacenamiento principal de los originales.** Opciones: Cloudflare R2 (sin costo de salida, ~USD 0,015 por GB al mes), Backblaze B2, o solo archive.org. A decidir antes de correr recolectores en GitHub Actions, donde la máquina se borra después de cada corrida.
- **Remoto en GitHub, dominio y nombre público.** El dominio `caba-transparente.com.ar` estaba libre el 18/10/2026.
- **Web.** Qué stack y cuándo.
