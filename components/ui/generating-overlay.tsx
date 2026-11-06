"use client";

import { ETAPAS, ETAPA_META } from "@/lib/clase-viva/etapas";

/**
 * Cosmetic stage copy shown while the plan generates (60–200s). It does not
 * reflect real progress, so it walks through the fases once and then HOLDS a
 * terminal message instead of looping back (a loop would visibly restart
 * "Fase 1" mid-wait).
 */
const STAGE_MESSAGES = [
  "Leyendo los DBA de tus grados…",
  ...ETAPAS.map((e) => `Fase ${ETAPA_META[e].orden} · ${ETAPA_META[e].generando}`),
  "Revisando que las cinco fases conecten…",
];

export const GENERATING_TERMINAL_MESSAGE =
  "Afinando los detalles. Esto toma unos minutos; puedes volver al inicio y te avisamos.";

export const GENERATING_STAGE_MESSAGES = [...STAGE_MESSAGES, GENERATING_TERMINAL_MESSAGE];
export const GENERATING_STAGE_INTERVAL_MS = 4_000;

/** Advance one stage, clamping at the terminal message (never wraps). */
export function nextStageIdx(idx: number): number {
  return Math.min(idx + 1, GENERATING_STAGE_MESSAGES.length - 1);
}

export function GeneratingOverlay({ stageIdx }: { stageIdx: number }) {
  const message =
    GENERATING_STAGE_MESSAGES[Math.min(Math.max(stageIdx, 0), GENERATING_STAGE_MESSAGES.length - 1)];
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-background px-6 text-center">
      <div className="flag-bar mb-8 w-full max-w-[320px]">
        <div className="flag-bar-yellow" />
        <div className="flag-bar-blue" />
        <div className="flag-bar-red" />
      </div>
      <div className="mb-8 h-24 w-24 animate-pulse rounded-full bg-[var(--grade-1-bg)]" />
      <p aria-live="polite" className="mb-3 min-h-[1.75rem] max-w-sm text-base font-medium text-text-primary">
        {message}
      </p>
      <p className="max-w-xs text-xs text-text-secondary">
        Puedes cerrar la app. Volvemos a encontrar tu proyecto cuando regreses.
      </p>
    </div>
  );
}
