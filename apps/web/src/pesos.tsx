/**
 * Nominal or constant pesos: one choice for the whole site, kept in the browser so it survives navigation.
 * Constant pesos only exist where the build had the IPC (`constantes` not null); without it pages stay nominal.
 */

import { createContext, type ReactNode, useContext, useState } from "react";

import { pesos } from "./lib.ts";
import type { Amount, ConstantPesos } from "./types.ts";

export type PesosMode = "nominal" | "constantes";

const STORAGE_KEY = "ct:pesos";

const PesosContext = createContext<{ mode: PesosMode; setMode: (m: PesosMode) => void }>({ mode: "nominal", setMode: () => {} });

function stored(): PesosMode {
  try {
    return localStorage.getItem(STORAGE_KEY) === "constantes" ? "constantes" : "nominal";
  } catch {
    return "nominal";
  }
}

export function PesosProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<PesosMode>(stored);
  const setMode = (m: PesosMode) => {
    setModeState(m);
    try {
      localStorage.setItem(STORAGE_KEY, m);
    } catch {}
  };
  return <PesosContext.Provider value={{ mode, setMode }}>{children}</PesosContext.Provider>;
}

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** 2026-09 → "septiembre de 2026". */
export const monthName = (period: string) => `${MONTHS[Number(period.slice(5, 7)) - 1]} de ${period.slice(0, 4)}`;

export interface Pesos {
  /** Constant pesos are on: the site has the IPC and the person chose them. */
  real: boolean;
  constantes: ConstantPesos | null;
  /** The amount in the chosen unit; null if it has no value in constant pesos. */
  value: (a: Amount) => number | null;
  /** Formatted amount; "—" when it has no value in constant pesos (only bought before the index starts). */
  format: (a: Amount) => string;
  /** Sorts by the chosen unit, highest first. */
  sort: <T extends Amount>(items: T[]) => T[];
  /** "En pesos de cada año" or "En pesos de septiembre de 2026, desde 2017". */
  unit: string;
}

export function usePesos(constantes: ConstantPesos | null): Pesos {
  const { mode } = useContext(PesosContext);
  const real = mode === "constantes" && constantes !== null;
  const value = (a: Amount) => (real ? a.montoReal : a.montoArs);
  return {
    real,
    constantes,
    value,
    format: (a) => {
      const v = value(a);
      return v === null || (real && v === 0 && a.montoArs > 0) ? "—" : pesos(v);
    },
    sort: (items) => [...items].sort((a, b) => (value(b) ?? 0) - (value(a) ?? 0)),
    unit: real ? `En pesos de ${monthName(constantes.referencia)}, desde ${constantes.desde}` : "En pesos de cada año",
  };
}

/** Switch between the two units, with what each one means. Nothing is shown without the IPC. */
export function PesosToggle({ constantes }: { constantes: ConstantPesos | null }) {
  const { mode, setMode } = useContext(PesosContext);
  if (!constantes) return null;
  const options: { value: PesosMode; label: string }[] = [
    { value: "nominal", label: "Pesos de cada año" },
    { value: "constantes", label: `Pesos de ${monthName(constantes.referencia)}` },
  ];
  return (
    <div className="flex flex-col gap-2 pb-6">
      <fieldset className="flex flex-wrap items-center gap-2 text-sm">
        <legend className="sr-only">Cómo mostrar los montos</legend>
        <span className="text-subtle">Montos en</span>
        <div className="inline-flex rounded-lg border border-line p-0.5">
          {options.map((o) => (
            <label
              key={o.value}
              className={`cursor-pointer rounded-md px-3 py-1 has-focus-visible:outline-2 has-focus-visible:outline-link ${mode === o.value ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
            >
              <input
                type="radio"
                name="pesos"
                value={o.value}
                checked={mode === o.value}
                onChange={() => setMode(o.value)}
                className="sr-only"
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-sm text-subtle text-pretty">
        {mode === "constantes"
          ? `Ajustados por inflación con el ${constantes.indice} (región ${constantes.region}) hasta ${monthName(constantes.referencia)}. El índice empieza en diciembre de 2016: las compras anteriores a ${constantes.desde} no se incluyen.`
          : "Tal como los publica la Ciudad, sin ajustar por inflación: sirven para ordenar, no para comparar años."}
      </p>
    </div>
  );
}
