/**
 * Runs the scraper of one source: `bun run scrape <id> [args...]`.
 * Each source lives in src/sources/<id>.ts and exports `run(args: string[])`.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";

const [id, ...args] = process.argv.slice(2);
const sourcesDir = join(import.meta.dir, "sources");
const available = readdirSync(sourcesDir)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .map((f) => f.slice(0, -3));

if (!id || !available.includes(id)) {
  console.error(`Uso: bun run scrape <id> [args...]\nFuentes: ${available.join(", ") || "(ninguna)"}`);
  process.exit(1);
}

const mod = (await import(join(sourcesDir, `${id}.ts`))) as { run: (args: string[]) => Promise<void> };
await mod.run(args);
