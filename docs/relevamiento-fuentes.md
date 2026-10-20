# Relevamiento de fuentes

Primer relevamiento, hecho el 18/10/2026 consultando los portales directamente (no por buscador). Lo que no se verificó está marcado como tal.

## Portal de datos abiertos: data.buenosaires.gob.ar

- CKAN 2.11 con API pública (`/api/3/action/package_show?id=<dataset>`), 458 datasets.
- Los archivos se sirven desde `cdn.buenosaires.gob.ar/datosabiertos/datasets/<organismo>/<dataset>/<archivo>`.
- **Firewall:** después de unas 20 consultas seguidas a la API, el portal respondió «Request Rejected» (página de un WAF). Hay que pedir el catálogo una vez por corrida, con pausas, y descargar del CDN, que no bloqueó.
- **El `last_modified` de cada recurso en CKAN no es confiable:** los archivos de Buenos Aires Compras dicen 13/01/2023 en el catálogo, pero el CDN los sirve con `Last-Modified` del 15/09/2026. Para detectar cambios se usan `Last-Modified` y `ETag` del CDN.

## Compras: Buenos Aires Compras (BAC), formato OCDS

Dataset `buenos-aires-compras` (Ministerio de Hacienda y Finanzas, actualización trimestral `R/P3M`). Publicado bajo el estándar Open Contracting (OCDS 1.1).

Tamaños y fechas según el CDN el 19/10/2026 (`Last-Modified` 15/09/2026 en todos, salvo `Metadata_OCDS.xlsx`, de 2021):

| Archivo | Tamaño | Contenido |
|---|---|---|
| `award.csv` | 616 MB | Adjudicaciones. **732.064 filas, una por ítem**: 312.915 adjudicaciones, de 2014 a 2026 |
| `tender.csv` | 621 MB | Convocatorias. 623.414 filas (ítems), 442.124 lotes, 82.115 procesos |
| `contracts.csv` | 423 MB | Contratos. 744.041 filas, de 2010 a 2026 |
| `parties.csv` | 256 MB | Participantes: unidades compradoras y proveedores. 905.212 filas |
| `bac.csv` | 2,6 GB | Todo junto: 1.163.830 filas de 99 columnas, los mismos 82.115 procesos de 2014 a 2026. El portal dice «desde el 2011», pero no trae nada anterior a 2014. Bajado a mano (ver abajo) |
| `bac_anual.csv`, `bac_anual.xlsx` | 133 MB, 22 MB | Versiones «anuales», sin relevar |
| `bac_anual.json` | 85 MB | Paquete OCDS en JSON, pero **solo de enero a junio de 2022**, aunque se llame «anual» |
| `Metadata_OCDS.xlsx` | 25 KB | Diccionario de campos |

Adjudicaciones por año (distintas, no filas): 2014: 5.690 · 2015: 19.991 · 2016: 23.021 · 2017: 26.724 · 2018: 26.838 · 2019: 28.494 · 2020: 20.418 · 2021: 25.259 · 2022: 26.566 · 2023: 29.106 · 2024: 29.335 · 2025: 32.101 · 2026: 19.370 (hasta la publicación de septiembre) · 2 con fecha `NaT`.

Estructura:

- **Una fila por ítem.** La adjudicación (o la convocatoria) se repite en cada ítem, con el mismo monto: sumar filas multiplica los montos.
- **Proceso, lote y adjudicación.** `tender/id` (`10002-0050-LPU23`) es el proceso de compra. Cada `ocid` (`ocds-bulbcf-10002-0050-LPU23-1`, `-2`…) es un lote del proceso, con su propio monto estimado, y tiene a lo sumo una adjudicación con un proveedor. En `award.csv` no hay lotes con montos o proveedores distintos entre sus ítems.
- `buyer` viene vacío. El comprador es `tender.procuringEntity`: un código de unidad ejecutora (`CABA-UE-10002`) y su nombre.
- **Monedas:** ARS, USD y EUR. En muchas adjudicaciones la moneda viene vacía, con montos grandes (en 2025, unos 172 mil millones sin moneda).
- `tender/value/amount` vale 0 en 83.211 filas (por ejemplo, concesiones).
- `tender/mainProcurementCategory` dice `works` (obras) en el 82 % de las filas, también en compras de bienes: no es confiable.
- El CUIT del proveedor viene en dos formatos (`30-54168237-2` y `27035690218`): se normaliza con `normalizeCuit()`.
- El `ocid` tiene prefijo `ocds-bulbcf-`.

Datos personales (D-04):

- **Proveedores personas humanas:** 933 de 4.524 proveedores distintos (32.384 adjudicaciones) tienen CUIT 20, 23, 24 o 27. `award.csv`, `parties.csv` y `contracts.csv` traen su nombre y CUIT. En `contracts.csv`, `signatories` es el proveedor, no un funcionario.
- **Pacientes en los títulos:** muchas compras de hospitales llevan en el título el nombre del paciente para el que se compra (prótesis, medicamentos), a veces con número de historia clínica o DNI. Es un dato de salud asociado a una persona. Las formas más comunes son «PTE.», «PCTE:», «PACIENTE», «PAC.», «HC Nº», «DNI», «AYUDA MÉDICA» o «AY. MÉD.», «A.M.», y apellido con inicial seguido del DNI sin rótulo. Con esas marcas se ocultan 10.974 de 82.115 procesos (13,4 %); en una revisión a mano de títulos de hospitales con forma «APELLIDO, NOMBRE» apareció alguno sin ninguna marca (D-04).
- `parties.csv` no trae domicilio ni contacto de los proveedores: los domicilios y mails son de las unidades compradoras.

Disponibilidad: el 19/10/2026, después de bajar unos 2 GB en secuencia, el CDN y el portal respondieron 503 y 502 durante unos 12 minutos. Cuando volvieron, `bac.csv` siguió respondiendo 503 (a `HEAD` y a pedidos parciales) mientras el resto respondía bien. El 20/10 siguió igual: `HEAD` daba 503 en menos de un segundo y `GET` dejaba la conexión abierta sin respuesta. No es un bloqueo: el CDN (Varnish) no logra traer el archivo de su origen cuando no lo tiene en caché. Una descarga desde el navegador lo cargó en la caché (dura 10 minutos, `max-age=600`) y desde ahí respondía bien a cualquier pedido. Ese día se archivó la copia del navegador, con nota en el manifest; los otros archivos no necesitaron esto.

Para completar los datos de cada proveedor sirve el Registro Nacional de Sociedades (datos.jus.gob.ar, ZIP de ~118 MB, actualizado cada uno o dos meses), igual que en Mendoza.

## Boletín Oficial: API REST

`https://api-restboletinoficial.buenosaires.gob.ar`, documentada en `/api/doc/`.

| Endpoint | Qué devuelve |
|---|---|
| `GET /obtenerBoletin/{parametro}/{carga_datos}` | Una edición. `parametro`: fecha `dd-mm-aaaa`, número de boletín, o `0` para el último. Con `carga_datos=true` trae las normas agrupadas por poder, tipo de norma y organismo |
| `GET /getUrlDocument/{id}/{tipo}` | URL de descarga de una norma (`tipo` 4) o de su anexo (`tipo` 8) |
| `POST /obtenerNormasSeccion`, `GET /obtenerSeccionesBoletin/{parametro}` | Normas por sección |
| `GET /obtenerOrganismosEmisores`, `GET /obtenerReparticiones`, `GET /obtenerFiltrosDeBusqueda` | Catálogos |
| `POST /getSdinIds` | Id de la norma en el Servicio de Información Normativa |

Lo verificado:

- Cada norma trae `nombre`, `sumario`, `id_norma`, `url_norma` y `anexos`. La URL redirige a un PDF con texto (no escaneado).
- Llega al menos al boletín 4550 (30/12/2014). No se probó hasta dónde llega hacia atrás.
- El `sumario` resume el acto en una línea (qué hace la norma y sobre qué), lo que permite clasificar las normas sin abrir el PDF.
- Secciones útiles además de normas: Licitaciones (públicas, directas, menores) y «Trimestral de contratos s/Ley de Presupuesto».
- **Si el parámetro está mal formado** (por ejemplo `20150105`), **devuelve el último boletín sin error.** El recolector tiene que verificar que la fecha que vuelve sea la pedida.

## Funcionarios y gobierno

| Dataset | Qué trae | Último período visto | Alerta |
|---|---|---|---|
| `autoridades-superiores-funcionarios` | Estructura completa: ministerio, repartición, sigla, puesto, nombre, desde/hasta, `reporta_a` (jerarquía) | 2024 (archivo del 05/02/2025) | Trae **CUIL, edad y mail** (ver D-04) |
| `sueldo-funcionarios` | Sueldos de jefe y vicejefe de Gobierno, jefe de Gabinete, ministros y secretarios | 2024 | |
| `declaraciones-juradas` | Formato largo (`informacion, tipo_de_dato, valor, presentacion, periodo`) | 2022 | En las primeras filas no se ve de quién es cada declaración: falta revisar el archivo completo |

## Otros datasets

`presupuesto-sancionado`, `presupuesto-ejecutado` y `presupuesto-ejecutado-2026` (trimestral), `ba-obras` (con CUIT de la constructora y monto), `seguimiento-obras-adjudicadas-soa`, `pauta-publicitaria`, `concesiones`, `recaudacion-impositiva`, `servicio-informacion-normativa` (normativa desde 1882).

## Acceso desde la nube

Probado el 18/10/2026 con `bun run probar-acceso`, desde una conexión en Argentina y dos veces desde GitHub Actions (IPs de Microsoft en EE. UU.):

| Sitio | Argentina | GitHub Actions |
|---|---|---|
| Datos abiertos: API CKAN, sitio y CDN | ✅ | ✅ |
| Boletín Oficial: API, documentos y sitio | ✅ | ✅ |
| Buenos Aires Compras, buenosaires.gob.ar | ✅ | ✅ |
| Legislatura (sitio y parlamentaria) | ✅ | ✅ |
| Registro Nacional de Sociedades, archive.org | ✅ | ✅ |
| Estadística de la Ciudad | Intermitente: respondió una vez y falló dos | Sin respuesta en 30 s, las dos veces |

**Conclusión:** a diferencia de Mendoza, ningún sitio de la Ciudad bloquea a GitHub Actions; no hace falta proxy. Estadística falla también desde Argentina, así que es inestabilidad del sitio y no un bloqueo. Hay que volver a probarla antes de escribir su recolector.

`parlamentaria.legislatura.gov.ar` redirige a `parlamentaria.legislatura.gob.ar`.

## Sin verificar

- Legislatura porteña: responde, no se relevó qué publica.
- Dirección de Estadística: qué publica y si se estabiliza.
- Cómo se comporta el firewall de `data.buenosaires.gob.ar` con un recolector real (muchos pedidos espaciados en una corrida larga).
