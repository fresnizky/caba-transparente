import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildBoletin, toNorm } from "./boletin.ts";

const origin = { nombre: "Boletín", url: "https://example.org", descargado: null, datos: null };

test("a hidden summary never reaches the site, even if the row had one", () => {
  expect(toNorm({ id_norma: "1", sumario: "Texto", sumario_oculto: "true" })).toMatchObject({ sumario: null, oculto: true });
  expect(toNorm({ id_norma: "2", sumario: "Aprueba", sumario_oculto: "false" }).sumario).toBe("Aprueba");
});

test("an act listed twice in the same edition counts once, and sections follow the printed order", async () => {
  const dir = mkdtempSync(join(tmpdir(), "boletin-"));
  mkdirSync(join(dir, "normas"));
  mkdirSync(join(dir, "boletines"));
  writeFileSync(
    join(dir, "normas", "2026.csv"),
    [
      "boletin_numero,seccion,tipo,nombre,sumario,sumario_oculto,id_norma,anexos,url_norma",
      "7465,Licitaciones,Licitación Pública,Llamado 1,Obra,false,10,1,",
      "7465,Poder Ejecutivo,Resolución,Resolución 1,Aprueba,false,11,0,",
      "7465,Poder Ejecutivo,Resolución,Resolución 1,Aprueba,false,11,0,",
    ].join("\n"),
  );
  writeFileSync(join(dir, "boletines", "2026.csv"), "numero,fecha,url_boletin,url_separata\n7465,2026-10-01,,\n");
  const { index, details } = await buildBoletin(dir, origin);
  expect(details[0]!.items.map((n) => n.id)).toEqual(["11", "10"]);
  expect(index.boletines[0]).toMatchObject({ numero: 7465, normas: 2, anexos: 1 });
  expect(index.boletines[0]!.secciones.map((s) => s.seccion)).toEqual(["Poder Ejecutivo", "Licitaciones"]);
});
