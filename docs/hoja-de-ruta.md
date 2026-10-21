# Hoja de ruta

Qué queremos mostrar en el sitio y en qué orden. El sitio sirve para control, auditoría e información pública, así que cada etapa empieza por una pregunta que un ciudadano o un periodista se haría.

Cada etapa define qué archivos necesita leer: la norma suelta, el boletín completo, los anexos o un dataset. Recién con eso se automatiza la descarga hacia atrás, para que la corrida baje y procese de una sola vez.

Todo sale de datos institucionales o agregados. A las empresas (personas jurídicas) se las puede perfilar. Las personas humanas que reciben pagos o contratos solo aparecen sumadas. Los empleados que no son funcionarios se cuentan, sin nombres (ver `AGENTS.md` y D-04).

## Hecho

- Recolector de Buenos Aires Compras (BAC), 2014 a 2026: procesos, adjudicaciones y renglones. Se corre a mano cada trimestre.
- Recolector del Boletín Oficial, probado con octubre de 2026: índice de normas, PDF del boletín, separata y anexos.
- Copia de originales y procesados en Cloudflare R2.

## Etapas

El orden es una propuesta y está por confirmar. Los números de octubre de 2026 salen de buscar palabras en los sumarios del índice del Boletín (13 boletines), así que son aproximados.

### 1. Compras y contrataciones

**Qué responde:** qué compra cada organismo, a quién, por cuánto y cómo eligió al proveedor. Y cuánto termina costando un contrato frente a lo adjudicado.

**Fuentes:**

- BAC, ya recolectado.
- Boletín: adjudicaciones (~350 en octubre), contrataciones directas (~100), ampliaciones y prórrogas (~125) y redeterminaciones de precios (~13).
- Boletín, sección «Trimestral de contratos s/Ley de Presupuesto» (17 publicaciones en octubre). Es la publicación obligatoria de los contratos de cada organismo y puede cubrir las contrataciones que no pasan por BAC.

**Qué hay que construir:**

1. Un lector de adjudicaciones del Boletín. El texto trae el número de proceso de BAC (por ejemplo «410-2811-CME26»), el objeto, la cantidad de ofertas, el adjudicatario con su CUIT, el monto y los renglones. Hay que probarlo con las adjudicaciones de octubre y decidir si alcanza con el PDF de cada norma (unos 50 KB) o hace falta el boletín completo.
2. El cruce con BAC por número de proceso: qué adjudicaciones del Boletín están en BAC y cuáles no.
3. Lo mismo para contrataciones directas, ampliaciones, prórrogas y redeterminaciones, colgadas del contrato original.
4. El trimestral de contratos.
5. Indicadores por organismo: qué parte de lo que compra es contratación directa, cuántas veces se recibió una sola oferta y cuánto se concentra en pocos proveedores (solo personas jurídicas).

**Por decidir:** si hacen falta los anexos. Los renglones a veces están en la norma y a veces en un anexo.

### 2. Ejecución presupuestaria

**Qué responde:** cuánto se aprobó para cada organismo y programa, cuánto se gastó y qué partidas se movieron durante el año.

**Fuentes:**

- Datasets `presupuesto-sancionado`, `presupuesto-ejecutado` y `presupuesto-ejecutado-2026` (trimestrales).
- Boletín: modificaciones presupuestarias (~70 normas en octubre).

**Qué hay que construir:** recolectores de los datasets, con la serie de cada programa en el tiempo, y la lectura de las modificaciones (de qué partida a cuál y por cuánto).

**Por decidir:** si el detalle de cada modificación está en la norma o en un anexo.

### 3. Organigrama

**Qué responde:** cómo está organizado el gobierno hoy, qué cargos existen y cuántos están cubiertos, y cuánta gente hay en cada escalafón.

**Fuentes:**

- Dataset `autoridades-superiores`: el último archivo es de 2024, así que es la base y no la foto actual.
- Boletín: decretos de estructura orgánica, y designaciones, ceses y renuncias (~400 en octubre).

**Qué hay que construir:** el árbol de unidades a partir del dataset, actualizado con las normas del Boletín en orden de fecha. Cada cambio queda con la norma que lo respalda.

**Cómo se publica:** sin nombres ni DNI. Para cada unidad, el cargo y si está cubierto. Para los cargos operativos, la cantidad por escalafón. La regla de D-04 permite publicar nombre, cargo y organismo de los funcionarios, pero no hace falta para esta etapa. Si se suman los nombres de los cargos superiores, se decide aparte.

**Por decidir:** desde qué fecha hace falta el Boletín para llegar de 2024 a hoy, y cómo se reconoce en el texto el escalafón de cada designación.

### 4. Cajas chicas y viáticos

**Qué responde:** cuánto gasta cada organismo por fuera de las compras, en caja chica, fondos de gestión, viáticos y misiones.

**Fuentes:** Boletín: aprobación de gastos de caja chica y fondos de gestión (~32 en octubre) y viáticos, pasajes y misiones (~11).

**Qué hay que construir:** la lectura de cada aprobación (organismo, período y monto) y la suma por organismo.

**Por decidir:** lo más probable es que el detalle de cada rendición (en qué se gastó) esté en un anexo. Se verifica con las normas de octubre antes de decidir qué bajar.

## Después

Sin orden todavía:

- **Obra pública.** `ba-obras` y `seguimiento-obras-adjudicadas-soa`: avance físico y financiero, plazos y constructora. Se cruza con las ampliaciones y redeterminaciones de la etapa 1.
- **Subsidios, transferencias y convenios.** Boletín (~40 subsidios y ~25 convenios en octubre): a qué organizaciones transfiere plata el Estado y con qué convenio. Las transferencias a personas humanas, solo sumadas.
- **Publicidad oficial.** Dataset `pauta-publicitaria` y normas del Boletín (~20 en octubre): cuánto gasta cada organismo y en qué medios.
- **Concesiones y permisos de uso del espacio público.** Dataset `concesiones` y autorizaciones del Boletín (~160 en octubre).
- **Ingresos.** `recaudacion-impositiva` frente al presupuesto: cuánto entra, además de cuánto sale.
- **Semáforo de transparencia.** Qué tan al día publica cada organismo cada dataset. Por ejemplo, `autoridades-superiores` llega a 2024 y `declaraciones-juradas` a 2022.

## Infraestructura pendiente

Espera a que las etapas digan qué hace falta:

- **Automatización de la descarga hacia atrás (GitHub Actions).** Se arma cuando la etapa 1 defina qué archivos del Boletín se bajan y qué se procesa.
- **Subir el Boletín a R2 y archive.org.** Octubre de 2026 está bajado, falta subirlo.
- **PDF comprimidos en R2.** Subirlos con `Content-Encoding: gzip` para que se abran en el navegador.
- **Descarga en streaming de archivos grandes.** `bac.csv` (2,6 GB) trabó la escritura y se terminó bajando desde el navegador.
- **Antes de la versión pública:** un mail para pedidos de retiro de datos y el dominio `caba-transparente.ar`.
