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

Dónde viven los originales: ver D-05.

## D-04. Datos personales (abierta)

**Fecha:** 18/10/2026 · **Estado:** abierta. Se decide con ejemplos concretos de cada fuente, después de las primeras descargas.

**Qué hay que decidir:** qué hacer con DNI, CUIL, edad, domicilio, mail y datos de familiares cuando el original del Estado los trae. Esto incluye si nuestra copia y el espejo de archive.org guardan el original completo o una versión sin esos datos, si se pide captura a la Wayback Machine y cómo se trata a los proveedores que son personas humanas.

**La tensión:** el enlace oficial (D-08) muestra el original completo, así que quitar los datos de nuestra copia no los oculta. Pero nuestras copias duran más que la del Estado, acumulan todas las versiones a lo largo de los años y en archive.org son casi imposibles de borrar. Además, una copia redactada deja de ser fiel al original, que es lo que da valor al archivo.

**Casos conocidos hasta ahora** (`docs/relevamiento-fuentes.md`):

- `autoridades-superiores`: dataset con CUIL, edad y mail de cada funcionario.
- `boletin-oficial`: PDFs de publicación obligatoria. Falta verificar cuántos actos traen DNI o CUIL.
- `compras-bac`: nombre y CUIT de proveedores que son personas humanas (20, 23, 24, 27), y nombres de pacientes (a veces con historia clínica o DNI) en los títulos de compras de hospitales. Para los títulos se decidió el 19/10/2026: se ocultan los que tienen marcas de un paciente (PTE, PCTE, PACIENTE, PAC, HC, DNI, CUIL, ayuda médica y sus abreviaturas, inicial seguida de un DNI) y la columna `titulo_oculto` lo indica. Son unos 11.000 procesos (13 %). La detección por marcas deja pasar algunos títulos sin marca; cuando aparece una marca nueva se agrega a `PERSONAL_DATA` (`compras-bac.ts`) y se reprocesa desde `data/raw/`. Por eso los procesados de esta fuente se publican en R2 y no en git (20/10/2026): en R2 la versión corregida reemplaza a la anterior, mientras que git conserva en su historial cualquier nombre que se haya escapado.

**Opciones a evaluar:** distinguir publicaciones oficiales obligatorias (copia fiel) de datasets con columnas que exceden la finalidad (versión redactada). En ambos casos se guarda en el manifest el sha256 del original.

**Mientras esté abierta:**

- Los originales de fuentes con datos personales se descargan solo a `data/raw/` local; no se suben a R2 ni a archive.org.
- Los datos procesados y la web no muestran DNI, CUIL, edad, domicilio, mail ni datos de familiares.
- A los proveedores que son personas humanas no se los perfila.

## D-05. Originales en Cloudflare R2, con segunda copia en archive.org

**Fecha:** 18/10/2026

- **R2 es la copia principal.** Cada original se sube con la misma ruta que figura en `manifest.jsonl` (`data/raw/<fuente>/<fecha>/<archivo>`), así el manifest no depende del proveedor y migrar es copiar los archivos (por ejemplo con `rclone`) y cambiar la configuración.
- **Los datos procesados también se publican en R2** (`data/processed/<fuente>/...`, misma ruta que en el repo). Ahí se reemplazan cuando se reprocesan. Agregado el 20/10/2026.
- **archive.org es la segunda copia** (`bun run archivar`): un ítem por fuente y mes, y la captura de la URL oficial en la Wayback Machine.
- La copia local en `data/raw/` es un caché de trabajo, no un respaldo.

**Por qué:** volumen medido el 18/10/2026: unos 3,5 GB por año hacia adelante (Boletín ~2,5 GB, Buenos Aires Compras ~0,85 GB, el resto ~0,2 GB). R2 da 10 GB gratis y después cobra USD 0,015 por GB al mes, sin cargo por descargas, así que sacar los datos para migrar no cuesta nada. Backblaze B2 era más barato por GB pero limita las descargas gratis; GitHub LFS cobra cada descarga, incluidas las de Actions.

## D-06. Web y panel en Cloudflare

**Fecha:** 18/10/2026

- **Web:** Cloudflare Pages, con páginas pre-generadas en el build y funciones solo donde haga falta. Lo estático no tiene límite de tráfico en el plan gratis.
- **Panel interno:** proyecto aparte en Cloudflare Pages, detrás de Cloudflare Access.
- **DNS** del dominio en Cloudflare, en la misma cuenta que R2.

**Por qué:** es la misma arquitectura que usa Mendoza Transparente en el plan gratis. Cupos a vigilar: 500 builds por mes y 20.000 archivos por despliegue. Si el sitio se acerca a ese límite, primero se construye en GitHub Actions y se sube armado; si no alcanza, el plan pago (USD 5 por mes, 100.000 archivos).

## D-07. Historia completa, de lo más nuevo a lo más viejo

**Fecha:** 18/10/2026

Se trae toda la historia publicada de cada fuente. Cada recolector empieza por lo más reciente y avanza hacia atrás, respetando los límites de cada sitio, y se puede cortar y retomar donde quedó.

**Por qué:** lo primero que va a aparecer son cambios de formato (que piden ajustar los lectores), no un problema de espacio. Ir hacia atrás de a poco muestra cada cambio de formato cuando aparece, con los datos recientes ya funcionando. El volumen estimado del Boletín completo (150 a 230 GB) cuesta unos USD 2 a 3,50 por mes en R2.

**Consecuencia para los lectores:** un documento que no se puede leer no frena la corrida. Se registra en un archivo de cobertura con el motivo (formato nuevo, imagen escaneada, error) y se sigue con el siguiente.

## D-08. Tres enlaces por documento

**Fecha:** 18/10/2026

Cada número de la web enlaza a tres copias de su documento:

| Enlace | Dónde está | De dónde sale |
|---|---|---|
| **Oficial** | El sitio del Gobierno de la Ciudad | `url` en `manifest.jsonl` |
| **Nuestra copia** | R2, público en `archivo.caba-transparente.com.ar` | `path` en `manifest.jsonl` |
| **Espejo** | archive.org: el ítem con nuestra copia y, si existe, la captura de la Wayback Machine | `archive_url` en `archive-org.jsonl` |

Qué muestran «nuestra copia» y el espejo cuando la fuente trae datos personales depende de D-04, que está abierta. Si el Gobierno borra el documento, el enlace oficial se muestra como no disponible y quedan los otros dos.

## D-09. Cuentas y dominios

**Fecha:** 18/10/2026

- Las cuentas (GitHub, Cloudflare, archive.org, PostHog) quedan por ahora a nombre de quien mantiene el proyecto (cuenta de GitHub `fresnizky`). Se reorganizan si el proyecto suma gente o una organización.
- Dominios registrados en NIC Argentina: `caba-transparente.com.ar` y `caba-transparente.ar`. El principal es `caba-transparente.com.ar`; el `.ar` redirige a él (301), igual que `www`.

## D-10. Licencias

**Fecha:** 18/10/2026

- **Código:** MIT.
- **Datos procesados** (`data/processed`, `data/curado`): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.es). Cualquiera puede usarlos, también con fines comerciales, citando la fuente.
- **Documentos originales:** pertenecen a sus organismos; los archivamos y redistribuimos como copia fiel.

## D-11. Analítica con PostHog

**Fecha:** 18/10/2026

PostHog, en su plan gratis (alrededor de un millón de eventos por mes, según fuentes no oficiales consultadas el 18/10/2026). Como usa cookies, el sitio necesita un aviso de consentimiento o configurarlo para que no guarde nada en el navegador hasta que la persona acepte. Se define al armar la web.

## D-12. Panel interno

**Fecha:** 18/10/2026

Arranca con las mismas funciones que el de Mendoza Transparente: revisar los reportes de errores que manda la gente y registrar los pedidos de acceso a la información (en la Ciudad, Ley 104). El detalle se define al construirlo.

## D-13. Flujo de trabajo en equipo

**Fecha:** 18/10/2026

Se trabaja como un equipo desde el primer día, aunque hoy haya una sola persona: todo cambio entra por PR a `main`, con la CI en verde. Detalle en `docs/procesos/ramas-y-prs.md`.

**Por qué una sola rama principal:** Mendoza usa `dev` y `main` para controlar cuándo se publica. Acá alcanza con `main` y las vistas previas de Cloudflare en cada PR; si hace falta una rama de publicación, se agrega después.

## D-14. Web: Vite, React y TanStack Router, con datos pre-armados

**Fecha:** 21/10/2026

- `apps/web` es una aplicación React 19 con Vite, TanStack Router y Tailwind 4, el mismo stack que Mendoza Transparente, para poder seguir trayendo ideas y piezas de ahí.
- Antes de servir o construir, `apps/web/scripts/build-data.ts` lee `data/processed/`, los manifests y `data/curado/`, y escribe JSON en `apps/web/public/data/`: un archivo por página (resumen, un archivo por organismo y por empresa, señales, catálogo). La web no hace cuentas: solo muestra.
- Los JSON se generan en cada build y no van a git, igual que los procesados (D-04, D-05). En desarrollo se leen de `data/` o de la carpeta que diga `CT_DATA_DIR`.
- Por ahora es una SPA: Cloudflare Pages sirve `index.html` para cualquier ruta (`public/_redirects`). Las páginas pre-generadas para buscadores (D-06) se agregan antes de la versión pública.
- Turborepo sigue sin hacer falta (D-02): hay una sola app y `bun run --filter` alcanza.

**Por qué:** las cuentas (sumas, señales) se hacen una vez sobre los CSV completos, que no entran en el navegador, y quedan probadas con `bun test`. Cada página baja solo lo suyo: la más pesada, la lista de empresas, pesa unos 500 KB sin comprimir.

**Qué la haría cambiar:** que el build supere el cupo de archivos de Cloudflare (hoy son unos 3.800 de 20.000, casi todos fichas de empresas) o que haga falta buscar dentro de los procesos, que no entran en un JSON por página.

## D-15. Pesos constantes con el IPC de INDEC, sin empalmes

**Fecha:** 22/10/2026

- Los montos de compras se pueden ver en pesos de cada año (como los publica la Ciudad) o en pesos constantes. Por defecto, pesos de cada año.
- Para los pesos constantes se usa solo el IPC de INDEC, nivel general, región GBA (`indec-ipc`, de `serie_ipc_divisiones.csv`). Cada adjudicación se lleva al último mes publicado según el mes de su fecha.
- La serie empieza en diciembre de 2016 y **no se empalma** con otras (IPC-GBA anterior, IPCNu, IPCBA de la Ciudad, inflación del BCRA). Lo que el índice no cubre queda afuera de los pesos constantes, y también los años incompletos: hoy cuentan las compras desde 2017.

**Por qué:** mezclar series de metodologías distintas, algunas de años en que el INDEC estaba intervenido, mete supuestos en cada número. Es preferible mostrar menos años, con un solo índice oficial y fácil de verificar. Se eligió la región GBA porque la Ciudad forma parte de ella.

**Qué la haría cambiar:** necesitar comparar años anteriores a 2017. En ese caso se evalúa el IPCBA de la Ciudad, que empieza en 2012 pero viene en dos bases (julio 2011 y 2021) que habría que empalmar.

## D-16. Dólares y euros en los gráficos, convertidos con la cotización del BCRA

**Fecha:** 22/10/2026

- En los gráficos por año, las adjudicaciones en dólares y euros se suman encima de las barras en pesos, en otro color. Se convierten con el promedio mensual de la cotización del BCRA (API de Estadísticas Cambiarias, `bcra-cotizaciones`) del mes de cada adjudicación. En pesos constantes, primero se convierten y después se ajustan con el IPC (D-15).
- En totales, rankings y señales no se convierten: siguen solo en pesos, y las otras monedas se informan aparte, en su moneda.
- Se usa la misma fuente para las dos monedas. Para el dólar no es exactamente la Comunicación A 3500 (difiere en centavos).

**Por qué:** desde 2023 pesan: en 2025 hubo unos US$ 104 millones, cerca del 20 % de lo adjudicado en pesos. Dejarlas fuera del gráfico lo hacía ver más chico de lo que fue.

## Abiertas

- **Datos personales.** Ver D-04.
- **Acceso desde la nube.** Probado el 18/10/2026: todos los sitios relevados responden desde GitHub Actions salvo Estadística de la Ciudad, que también falla desde Argentina (sitio inestable). Por ahora no hace falta proxy. Detalle en `docs/relevamiento-fuentes.md`.
