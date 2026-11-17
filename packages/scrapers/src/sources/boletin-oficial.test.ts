import { describe, expect, test } from "bun:test";

import { type BulletinIndex, bulletinFiles, bulletinRows, flattenNorms, isoDate, parseNormName, summaryFields } from "./boletin-oficial.ts";

const DL = "http://api-restboletinoficial.buenosaires.gob.ar/download";

const norm = (over: object = {}) => ({
  nombre: "Resolución N° 100/PRUEBA/26",
  sumario: "Aprueba el pliego de una licitación de prueba",
  id_norma: 1,
  id_sdin: "",
  url_norma: `${DL}/10`,
  anexos: [] as { filenet_firmado: string; nombre_anexo: string | null }[],
  ...over,
});

const index: BulletinIndex = {
  boletin: {
    fecha_publicacion: "20/10/2026",
    numero: 9000,
    url_boletin: `${DL}/1`,
    separata: [{ nombre: null, url: `${DL}/2` }],
  },
  normas: {
    normas: {
      "Poder Ejecutivo": {
        Resolución: {
          "Ministerio de Prueba": [norm({ anexos: [{ filenet_firmado: `${DL}/11`, nombre_anexo: "PE-RES-PRUEBA-100-26-ANX-1.pdf" }] })],
        },
        Decreto: { "Jefe de Gobierno": [norm({ nombre: "Decreto N° 5", id_norma: 2, url_norma: `${DL}/20` })] },
      },
      "Edictos Oficiales": {
        Notificación: {
          "Organismo de Prueba": [norm({ nombre: "Notificación N° 7/PRUEBA/26", sumario: "Sr. Ejemplo, Juan", id_norma: 3 })],
        },
      },
    },
  },
};

describe("index", () => {
  test("flattens the tree keeping section, type and issuing body", () => {
    const placed = flattenNorms(index.normas.normas);
    expect(placed.map((n) => [n.seccion, n.tipo, n.organismo, n.id_norma])).toEqual([
      ["Poder Ejecutivo", "Resolución", "Ministerio de Prueba", 1],
      ["Poder Ejecutivo", "Decreto", "Jefe de Gobierno", 2],
      ["Edictos Oficiales", "Notificación", "Organismo de Prueba", 3],
    ]);
  });

  test("parses dates and norm names", () => {
    expect(isoDate("20/10/2026")).toBe("2026-10-20");
    expect(isoDate("2026-10-20")).toBeNull();
    expect(parseNormName("Resolución N° 643/LCABA/26")).toEqual({ numero: "643", sigla: "LCABA", anio: 2026 });
    expect(parseNormName("Resolución Conjunta N° 1.234/MHFGC/MJGGC/98")).toEqual({ numero: "1234", sigla: "MHFGC/MJGGC", anio: 1998 });
    expect(parseNormName("Decreto N° 5")).toEqual({ numero: "5", sigla: null, anio: null });
  });

  test("hides the summary of edicts and of any summary with an identity number", () => {
    expect(summaryFields("Edictos Oficiales", "Sr. Ejemplo, Juan")).toEqual({ sumario: null, sumario_oculto: true });
    expect(summaryFields("Poder Ejecutivo", "Designa a Persona de Prueba, CUIL 20-12345678-9")).toEqual({
      sumario: null,
      sumario_oculto: true,
    });
    expect(summaryFields("Poder Ejecutivo", "Designa a Persona de Prueba DNI 12.345.678")).toEqual({ sumario: null, sumario_oculto: true });
    expect(summaryFields("Poder Ejecutivo", " Aprueba  el pliego ")).toEqual({ sumario: "Aprueba el pliego", sumario_oculto: false });
    expect(
      summaryFields("Poder Ejecutivo", "Toma conocimiento de la sentencia en los autos caratulados: Prueba, Juan s/ sucesión"),
    ).toEqual({
      sumario: null,
      sumario_oculto: true,
    });
    expect(summaryFields("Licitaciones", null)).toEqual({ sumario: null, sumario_oculto: false });
  });
});

describe("files and rows", () => {
  test("one raw file per PDF of the bulletin", () => {
    expect(bulletinFiles(9000, index)).toEqual([
      { filename: "boletin-9000.pdf", url: `${DL}/1` },
      { filename: "boletin-9000-separata.pdf", url: `${DL}/2` },
      { filename: "boletin-9000-anexo-11.pdf", url: `${DL}/11` },
    ]);
  });

  test("rows of a bulletin, with the paths of our copies", () => {
    const path = (f: string) => `data/raw/boletin-oficial/2026-10-21/${f}`;
    const archived = (filename: string) =>
      filename === "boletin-9000-anexo-11.pdf" || filename === "boletin-9000.pdf"
        ? { filename, path: path(filename), url: "", fetched_at: "", sha256: "", bytes: 1234, gzip: false }
        : undefined;
    const { bulletin, norms, annexes } = bulletinRows(index, archived);

    expect(bulletin).toMatchObject({
      numero: 9000,
      fecha: "2026-10-20",
      normas: 3,
      anexos: 1,
      copia_boletin: path("boletin-9000.pdf"),
      copia_separata: null,
    });
    expect(norms[0]).toMatchObject({
      boletin_numero: 9000,
      numero: "100",
      sigla: "PRUEBA",
      anio: 2026,
      sumario_oculto: false,
      anexos: 1,
      id_sdin: null,
    });
    expect(norms[2]).toMatchObject({ seccion: "Edictos Oficiales", sumario: null, sumario_oculto: true });
    expect(annexes).toEqual([
      {
        boletin_numero: 9000,
        fecha: "2026-10-20",
        id_norma: 1,
        norma: "Resolución N° 100/PRUEBA/26",
        nombre_anexo: "PE-RES-PRUEBA-100-26-ANX-1.pdf",
        url: `${DL}/11`,
        bytes: 1234,
        copia: path("boletin-9000-anexo-11.pdf"),
      },
    ]);
  });
});
