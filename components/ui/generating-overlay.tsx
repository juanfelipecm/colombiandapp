"use client";

const STAGE_MESSAGES = [
  "Eligiendo DBAs para tus grados…",
  "Diseñando actividades para cada grado…",
  "Armando la lista de materiales…",
  "Revisando que todo conecte…",
];

export const GENERATING_STAGE_MESSAGES = STAGE_MESSAGES;
export const GENERATING_STAGE_INTERVAL_MS = 4_000;

export function GeneratingOverlay({ stageIdx }: { stageIdx: number }) {
  const message = STAGE_MESSAGES[stageIdx % STAGE_MESSAGES.length];
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-background px-6 text-center">
      <div className="flag-bar mb-8 w-full max-w-[320px]">
        <div className="flag-bar-yellow" />
        <div className="flag-bar-blue" />
        <div className="flag-bar-red" />
      </div>
      <div className="mb-8 h-24 w-24 animate-pulse rounded-full bg-[var(--grade-1-bg)]" />
      <p className="mb-3 min-h-[1.75rem] text-base font-medium text-text-primary">
        {message}
      </p>
      <p className="max-w-xs text-xs text-text-secondary">
        Puedes cerrar la app. Volvemos a encontrar tu proyecto cuando regreses.
      </p>
    </div>
  );
}
