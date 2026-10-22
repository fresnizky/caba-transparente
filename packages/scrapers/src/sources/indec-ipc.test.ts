import { expect, test } from "bun:test";

import { parseIpc } from "./indec-ipc.ts";

const HEAD = "Codigo;Descripcion;Clasificador;Periodo;Indice_IPC;v_m_IPC;v_i_a_IPC;Region";

test("keeps the general level of each region, with Argentine decimals", () => {
  const rows = parseIpc(
    [
      HEAD,
      "0;NIVEL GENERAL;Nivel general y divisiones COICOP;201612;100;NA;NA;GBA",
      "01;Alimentos y bebidas no alcohólicas;Nivel general y divisiones COICOP;201701;101,5;1,5;NA;GBA",
      "0;NIVEL GENERAL;Nivel general y divisiones COICOP;201701;101,313;1,3;NA;GBA",
      "",
    ].join("\r\n"),
  );
  expect(rows).toEqual([
    { periodo: "2016-12", region: "GBA", indice: 100, variacion_mensual: null },
    { periodo: "2017-01", region: "GBA", indice: 101.313, variacion_mensual: 1.3 },
  ]);
});

test("fails if INDEC changes the columns", () => {
  expect(() => parseIpc("Codigo;Periodo;Indice\n0;201612;100")).toThrow(/columnas/);
});
