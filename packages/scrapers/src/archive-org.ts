/**
 * Copies every raw file on archive.org:
 *   bun run archivar [fuentes...] [--solo-items] [--solo-wayback] [--max-capturas=N] [--max-minutos=N]
 *
 * 1. Uploads each file of data/raw/<source>/ not yet uploaded to its archive.org item, plus the manifest.
 * 2. Asks the Wayback Machine to capture the official URL of the latest version of each document.
 * Both are logged in data/raw/<source>/archive-org.jsonl as they happen, so running it twice does nothing
 * new and a run cut short by --max-minutos (the first one uploads everything) resumes where it stopped.
 *
 * Needs IA_ACCESS_KEY and IA_SECRET_KEY (https://archive.org/account/s3.php); without them it skips.
 * Process documented in docs/procesos/datos-y-archivo.md.
 *
 * Adapted from Mendoza Transparente (MIT): https://github.com/unllamas/mendoza-transparente
 */

import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  type ArchiveOrgRecord,
  appendArchiveOrgRecord,
  archiveOrgAuth,
  archiveTimestamp,
  isCapturableUrl,
  itemIdentifier,
  type ManifestEntry,
  RAW_DIR,
  ROOT,
  readArchiveOrgRecords,
  readManifest,
  savePageNow,
  sleep,
  uploadToItem,
} from "@ct/core";

// Public repository the archive.org items point to (not created yet).
const REPO = "https://github.com/fresnizky/caba-transparente";

/**
 * Sources whose official documents carry personal data. While D-04 is open their originals stay in data/raw
 * only: nothing is uploaded to an item and nothing is sent to the Wayback Machine (which keeps the original as
 * published).
 */
const WAYBACK_EXCLUDED: Record<string, string> = {
  "autoridades-superiores": "the official CSV has CUIL, age and email of every official (D-04)",
  "compras-bac": "the official CSVs have name and CUIT of suppliers who are individuals (D-04)",
};

// Save Page Now allows 7 captures per minute for an authenticated account.
const CAPTURE_PAUSE_MS = 9000;
// A failed capture is retried after this long (the page may have been down).
const RETRY_FAILED_AFTER_DAYS = 30;

function itemMetadata(source: string, identifier: string): Record<string, string | string[]> {
  const month = identifier.slice(-7);
  return {
    mediatype: "data",
    collection: "opensource_media",
    title: `CABA Transparente: archivo crudo de ${source} (${month})`,
    description:
      `Archivos públicos descargados de sitios oficiales de la Ciudad Autónoma de Buenos Aires (Argentina) por CABA Transparente, ` +
      `fuente «${source}», en ${month}, tal cual se descargaron (los de más de 1 MB, con gzip). ` +
      `manifest.jsonl registra de qué URL oficial salió cada archivo, cuándo y su sha256. Repositorio: ${REPO}`,
    subject: ["Ciudad de Buenos Aires", "CABA", "Argentina", "transparencia", "datos abiertos", "gobierno", source],
    language: "spa",
    creator: "CABA Transparente",
    source: `${REPO}/tree/main/data/raw/${source}`,
  };
}

async function uploadItems(
  auth: string,
  source: string,
  manifest: ManifestEntry[],
  records: ArchiveOrgRecord[],
  deadline: number,
): Promise<ManifestEntry[]> {
  const done = new Set(records.filter((r) => r.kind === "item" && r.archive_url).map((r) => r.path));
  const uploaded: ManifestEntry[] = [];
  for (const entry of manifest) {
    if (done.has(entry.path) || !existsSync(join(ROOT, entry.path))) continue;
    if (Date.now() > deadline) break;
    const identifier = itemIdentifier(source, entry.fetched_at);
    const name = entry.path.slice(`data/raw/${source}/`.length);
    const body = new Uint8Array(await readFile(join(ROOT, entry.path)));
    const archiveUrl = await uploadToItem(auth, identifier, name, body, itemMetadata(source, identifier));
    await appendArchiveOrgRecord(source, {
      path: entry.path,
      url: entry.url,
      sha256: entry.sha256,
      kind: "item",
      archive_url: archiveUrl,
      archived_at: archiveTimestamp(),
    });
    uploaded.push(entry);
    console.log(`  item ${identifier}/${name}`);
  }
  const last = uploaded.at(-1);
  if (last) {
    // The latest item also gets the full manifest, so each copy explains itself without the repo.
    const latest = itemIdentifier(source, last.fetched_at);
    const body = new Uint8Array(await readFile(join(RAW_DIR, source, "manifest.jsonl")));
    await uploadToItem(auth, latest, "manifest.jsonl", body, itemMetadata(source, latest));
  }
  return uploaded;
}

/** Latest version of each official URL that still has no Wayback capture (nor a recent failure). */
function pendingCaptures(manifest: ManifestEntry[], records: ArchiveOrgRecord[]): ManifestEntry[] {
  const retryAfter = new Date(Date.now() - RETRY_FAILED_AFTER_DAYS * 864e5).toISOString();
  const skip = new Set(
    records.filter((r) => r.kind === "wayback" && (r.archive_url || r.archived_at > retryAfter)).map((r) => `${r.url}\n${r.sha256}`),
  );
  const latestByUrl = new Map<string, ManifestEntry>();
  for (const entry of manifest) if (isCapturableUrl(entry.url)) latestByUrl.set(entry.url, entry);
  return [...latestByUrl.values()].filter((e) => !skip.has(`${e.url}\n${e.sha256}`));
}

export async function run(args: string[]): Promise<void> {
  const auth = archiveOrgAuth();
  if (!auth) {
    console.log("Sin IA_ACCESS_KEY / IA_SECRET_KEY: no se copia nada a archive.org.");
    return;
  }
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const option = (name: string, fallback: number) => Number(args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1] ?? fallback);
  const maxCaptures = option("max-capturas", 300);
  const deadline = Date.now() + option("max-minutos", 150) * 60_000;
  const requested = args.filter((a) => !a.startsWith("--"));
  const sources = requested.length
    ? requested
    : readdirSync(RAW_DIR).filter((d) => statSync(join(RAW_DIR, d)).isDirectory() && existsSync(join(RAW_DIR, d, "manifest.jsonl")));

  let captures = 0;
  let stopCaptures = flags.has("--solo-items");
  for (const source of sources) {
    const manifest = await readManifest(source);
    console.log(`${source}: ${manifest.length} archivos`);
    if (WAYBACK_EXCLUDED[source]) {
      console.log(`  no se copia a archive.org: ${WAYBACK_EXCLUDED[source]}`);
      continue;
    }

    if (!flags.has("--solo-wayback")) {
      const uploaded = await uploadItems(auth, source, manifest, await readArchiveOrgRecords(source), deadline);
      console.log(`  ${uploaded.length} subidos al ítem`);
    }

    if (stopCaptures) continue;
    for (const entry of pendingCaptures(manifest, await readArchiveOrgRecords(source))) {
      if (captures >= maxCaptures || Date.now() > deadline) {
        console.log("  tope de capturas o de tiempo de la corrida: el resto sigue en la próxima");
        stopCaptures = true;
        break;
      }
      const result = await savePageNow(auth, entry.url);
      captures++;
      const ok = "archiveUrl" in result;
      await appendArchiveOrgRecord(source, {
        path: entry.path,
        url: entry.url,
        sha256: entry.sha256,
        kind: "wayback",
        archive_url: ok ? result.archiveUrl : null,
        archived_at: archiveTimestamp(),
        ...(ok ? {} : { error: result.error }),
      });
      console.log(`  wayback ${ok ? "ok" : result.error} ${entry.url}`);
      if (!ok && /too-many-daily|max-daily|user-session-limit/.test(result.error)) {
        console.log("  archive.org llegó al límite del día: se sigue en la próxima corrida");
        stopCaptures = true;
        break;
      }
      await sleep(CAPTURE_PAUSE_MS);
    }
  }
}

if (import.meta.main) await run(process.argv.slice(2));
