/** Text clean-up shared by the pages and scripts/build-data.ts (no browser or Bun APIs here). */

/** Agency names come in capitals or not, depending on the year they were loaded. */
export function agencyName(name: string): string {
  if (name !== name.toUpperCase()) return name;
  const lower = name.toLowerCase().replace(/(^|[\s(."/-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase());
  return lower.replace(/\b(De|Del|La|Las|Los|El|Y|E|En|A|Para|Por)\b/g, (w) => w.toLowerCase()).replace(/^./, (c) => c.toUpperCase());
}
