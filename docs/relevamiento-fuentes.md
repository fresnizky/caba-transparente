# Relevamiento de fuentes

Primer relevamiento, hecho el 18/10/2026 consultando los portales directamente (no por buscador). Lo que no se verificó está marcado como tal.

## Portal de datos abiertos: data.buenosaires.gob.ar

- CKAN 2.11 con API pública (`/api/3/action/package_show?id=<dataset>`), 458 datasets.
- Los archivos se sirven desde `cdn.buenosaires.gob.ar/datosabiertos/datasets/<organismo>/<dataset>/<archivo>`.
- **Firewall:** después de unas 20 consultas seguidas a la API, el portal respondió «Request Rejected» (página de un WAF). Hay que pedir el catálogo una vez por corrida, con pausas, y descargar del CDN, que no bloqueó.
- **El `last_modified` de cada recurso en CKAN no es confiable:** los archivos de Buenos Aires Compras dicen 13/01/2023 en el catálogo, pero el CDN los sirve con `Last-Modified` del 15/09/2026. Para detectar cambios se usan `Last-Modified` y `ETag` del CDN.

## Compras: Buenos Aires Compras (BAC), formato OCDS

Dataset `buenos-aires-compras` (Ministerio de Hacienda y Finanzas, actualización trimestral `R/P3M`). Publicado bajo el estándar Open Contracting (OCDS 1.1).

| Archivo | Tamaño | Contenido |
|---|---|---|
| `award.csv` | 616 MB | Adjudicaciones, OCDS aplanado. **732.064 filas, de 2014 a 2026** |
| `tender.csv` | 621 MB | Convocatorias |
| `contracts.csv` | 423 MB | Contratos |
| `parties.csv` | 256 MB | Participantes |
| `bac.csv` | 2,6 GB | Todo junto |
| `bac_anual.json` | 85 MB | Paquete OCDS en JSON, pero **solo de enero a junio de 2022**, aunque se llame «anual» |

Adjudicaciones por año en `award.csv`: 2014: 8.892 · 2015: 26.058 · 2016: 38.410 · 2017: 50.683 · 2018: 70.099 · 2019: 66.931 · 2020: 46.318 · 2021: 61.340 · 2022: 74.572 · 2023: 96.383 · 2024: 66.723 · 2025: 84.989 · 2026: 40.664 (hasta la publicación de septiembre).

Particularidades:

- `buyer` viene vacío. El comprador es `tender.procuringEntity`: un código de unidad ejecutora (`CABA-UE-10002`) y su nombre.
- El CUIT del proveedor viene en dos formatos (`30-54168237-2` y `27035690218`): se normaliza con `normalizeCuit()`.
- Hay proveedores que son personas humanas (CUIT 27…).
- El `ocid` tiene prefijo `ocds-bulbcf-`.

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

## Sin verificar

- Si algún sitio de la Ciudad bloquea las IPs de GitHub Actions. Todas las pruebas se hicieron desde una conexión en Argentina.
- Legislatura porteña (`legislatura.gob.ar`, `parlamentaria.legislatura.gov.ar`): responden, no se relevaron.
- Dirección de Estadística (`estadisticaciudad.gob.ar`): no respondió.
