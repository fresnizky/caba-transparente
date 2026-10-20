/**
 * Sources whose official documents carry personal data. While D-04 is open their originals stay in data/raw
 * only: they are not uploaded to R2 (`subir-r2`) nor to archive.org, and nothing is sent to the Wayback Machine
 * (which keeps the original as published) (`archivar`). Their processed data is published as usual.
 */
export const RAW_EXCLUDED: Record<string, string> = {
  "autoridades-superiores": "the official CSV has CUIL, age and email of every official (D-04)",
  "compras-bac": "the official CSVs have name and CUIT of suppliers who are individuals (D-04)",
};
