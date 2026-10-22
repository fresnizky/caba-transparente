/**
 * Shape of the JSON files that scripts/build-data.ts writes to public/data and the pages read.
 * `montoArs` is nominal pesos (ARS) of each year. `montoReal` is the same in constant pesos of the reference month of
 * the IPC (see ConstantPesos): it only adds what the index covers, and is null when there is no index or, in a year
 * row, when the index does not cover that whole year.
 */

/** How amounts in constant pesos were calculated. */
export interface ConstantPesos {
  indice: string;
  region: string;
  /** Month the constant pesos refer to (AAAA-MM). */
  referencia: string;
  /** First year the index covers in full: earlier amounts have no value in constant pesos. */
  desde: number;
}

/** How amounts in dollars and euros are converted to pesos for the yearly chart. */
export interface Exchange {
  fuente: string;
  monedas: string[];
}

/** An amount in nominal and in constant pesos. */
export interface Amount {
  montoArs: number;
  montoReal: number | null;
}

/** Where a set of numbers comes from: the official dataset and the date we downloaded it. */
export interface Origin {
  nombre: string;
  /** Official page of the dataset. */
  url: string;
  /** Date of the download the numbers come from (ISO). */
  descargado: string | null;
  /** Folder of our processed CSVs in R2; null while they are not uploaded there. */
  datos: string | null;
}

/** Amounts in currencies other than pesos, which are never added to the peso totals. */
export type OtherCurrencies = Record<string, number>;

export interface YearRow extends Amount {
  anio: number;
  procesos: number;
  adjudicaciones: number;
  /** Awards in other currencies converted to pesos with the rate of their month (not added to `montoArs`). Null
   * without exchange rates. */
  otras: Amount | null;
}

export interface ProcedureRow extends Amount {
  procedimiento: string;
  procesos: number;
  adjudicaciones: number;
}

/** Awards to individuals: shown only as a total, never one by one (AGENTS.md, D-04). */
export interface IndividualsTotal extends Amount {
  adjudicaciones: number;
}

export interface AgencySummary extends Amount {
  /** Number of the executing unit (`CABA-UE-<id>`): stable even if the agency is renamed. */
  id: string;
  nombre: string;
  procesos: number;
  adjudicaciones: number;
  /** Share of the amount awarded by direct contracting (0 to 1), in nominal and in constant pesos. */
  directaMonto: number;
  directaReal: number | null;
  desde: number | null;
  hasta: number | null;
}

export interface SupplierSummary extends Amount {
  cuit: string;
  nombre: string;
  adjudicaciones: number;
  organismos: number;
  desde: number | null;
  hasta: number | null;
}

export interface ProcessItem {
  id: string;
  fecha: string | null;
  /** Null when hidden because it names a patient (`oculto`). */
  titulo: string | null;
  oculto: boolean;
  procedimiento: string | null;
  estado: string | null;
  estimado: number | null;
  moneda: string | null;
  /** Sum of the awards of the process, in its currency. */
  adjudicado: number | null;
  url: string | null;
}

export interface AwardItem {
  ocid: string;
  procesoId: string | null;
  fecha: string | null;
  titulo: string | null;
  oculto: boolean;
  monto: number | null;
  moneda: string | null;
  organismoId: string | null;
  organismo: string | null;
  procedimiento: string | null;
  url: string | null;
}

export interface ComprasSummary {
  origen: Origin;
  constantes: ConstantPesos | null;
  cambio: Exchange | null;
  totales: Amount & {
    procesos: number;
    adjudicaciones: number;
    otrasMonedas: OtherCurrencies;
    organismos: number;
    proveedores: number;
    desde: string | null;
    hasta: string | null;
  };
  /** Last year with a full twelve months of data: the current one is still open. */
  ultimoAnioCompleto: number | null;
  porAnio: YearRow[];
  porProcedimiento: ProcedureRow[];
  personasHumanas: IndividualsTotal;
  /** The first ones by nominal amount, and by amount in constant pesos (the order changes). */
  topOrganismos: AgencySummary[];
  topOrganismosReal: AgencySummary[];
  topProveedores: SupplierSummary[];
  topProveedoresReal: SupplierSummary[];
}

/** A company inside an agency page. */
export type AgencySupplier = Pick<SupplierSummary, "cuit" | "nombre" | "montoArs" | "montoReal" | "adjudicaciones">;

export interface AgencyDetail extends AgencySummary {
  origen: Origin;
  constantes: ConstantPesos | null;
  cambio: Exchange | null;
  ultimoAnioCompleto: number | null;
  otrasMonedas: OtherCurrencies;
  porAnio: YearRow[];
  porProcedimiento: ProcedureRow[];
  /** Process count by OCDS status (complete, cancelled, unsuccessful, active). */
  estados: Record<string, number>;
  proveedores: AgencySupplier[];
  proveedoresReal: AgencySupplier[];
  personasHumanas: IndividualsTotal;
  recientes: ProcessItem[];
}

export interface SupplierDetail extends SupplierSummary {
  origen: Origin;
  constantes: ConstantPesos | null;
  cambio: Exchange | null;
  ultimoAnioCompleto: number | null;
  otrasMonedas: OtherCurrencies;
  porAnio: YearRow[];
  porProcedimiento: ProcedureRow[];
  porOrganismo: (Amount & { id: string; nombre: string; adjudicaciones: number })[];
  recientes: AwardItem[];
}

export interface SignalCase {
  titulo: string;
  detalle: string;
  /** Agency of the case, which has its own page. */
  organismoId?: string;
  /** Official document, when the case is a single process. */
  url?: string | null;
  monto?: number;
}

export interface Signal {
  id: string;
  tema: string;
  /** Headline figure, already formatted ("24 %", "312"). */
  cifra: string;
  titulo: string;
  descripcion: string;
  /** How it was calculated, in plain words. */
  metodo: string;
  /** What could explain it without anything wrong: a signal is a question, not an accusation. */
  matiz: string;
  totalCasos: number;
  casos: SignalCase[];
}

export interface SignalsTopic {
  origen: Origin;
  senales: Signal[];
}

export interface SourceInfo {
  id: string;
  nombre: string;
  organismo: string;
  url: string;
  formato: string;
  frecuencia: string;
  estado: string;
  datosPersonales: string | null;
  /** Distinct files downloaded, according to manifest.jsonl. */
  archivos: number;
  bytes: number;
  ultimaDescarga: string | null;
  /** Number of processed CSVs available. */
  datasets: number;
}

export interface DatasetFile {
  /** Part of the dataset, usually a year. */
  parte: string;
  filas: number;
  bytes: number;
  /** Public download in R2. */
  url: string;
}

export interface DatasetInfo {
  fuente: string;
  /** Folder inside data/processed/<fuente>/, or "" for files at its root. */
  nombre: string;
  titulo: string;
  descripcion: string;
  oficial: string;
  licencia: string;
  columnas: Record<string, string>;
  notas: string[];
  /** Whether the files are already in R2: until they are, they are listed without a download link. */
  publicado: boolean;
  archivos: DatasetFile[];
}

export interface Catalog {
  generadoEl: string;
  fuentes: SourceInfo[];
  datasets: DatasetInfo[];
}

/** Something that should be public and is not (data/curado/no-publicado.yaml). */
export interface NotPublished {
  id: string;
  titulo: string;
  descripcion: string;
  /** What we found and when. */
  evidencia: string;
  /** Who should publish it. */
  organismo: string;
  /** Link to check it. */
  url?: string;
}

/** One act of the Official Bulletin, from the API index. The text of the PDF is never read (D-04). */
export interface BulletinNorm {
  id: string;
  seccion: string;
  tipo: string;
  organismo: string | null;
  nombre: string;
  /** Null when hidden: always in edicts, and whenever it carries an ID number or names the parties of a case. */
  sumario: string | null;
  oculto: boolean;
  anexos: number;
  url: string | null;
}

export interface BulletinSummary {
  numero: number;
  fecha: string;
  normas: number;
  anexos: number;
  /** Acts per section, in the order of the printed bulletin. */
  secciones: { seccion: string; normas: number }[];
  url: string | null;
  urlSeparata: string | null;
}

export interface BulletinIndex {
  origen: Origin;
  boletines: BulletinSummary[];
}

export interface BulletinDetail extends BulletinSummary {
  origen: Origin;
  items: BulletinNorm[];
}
