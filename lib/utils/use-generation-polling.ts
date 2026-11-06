"use client";

import { useEffect, useRef, useState } from "react";
import { GENERATING_STAGE_INTERVAL_MS, nextStageIdx } from "@/components/ui/generating-overlay";

/** Teacher-facing copy per terminal generation status (DESIGN.md: what happened, then what to do). */
export const GENERATION_ERROR_COPY: Record<string, string> = {
  validation_failed:
    "No logramos armar un proyecto con estas opciones. Intenta con otro tema o menos materias.",
  timeout: "Tardó más de lo esperado. Inténtalo de nuevo.",
  api_error: "Algo falló de nuestro lado. Inténtalo en unos minutos.",
  db_error: "Algo falló de nuestro lado. Inténtalo en unos minutos.",
};

export function generationErrorMessage(status: string | undefined): string {
  return (status && GENERATION_ERROR_COPY[status]) ?? GENERATION_ERROR_COPY.api_error;
}

const POLL_INTERVAL_MS = 2_000;
// Matches the route's maxDuration (300s). Server keeps working past this via
// after(), so the project may still land — but we stop polling and surface an
// error if we haven't seen a terminal state by then.
const POLL_MAX_ATTEMPTS = 150;

export type GenerationPollResult =
  | { kind: "pending"; stageIdx: number }
  | { kind: "success"; projectId: string }
  | { kind: "error"; message: string };

type StatusResponse = {
  status?: string;
  project_id?: string | null;
  error?: string | null;
};

export function useGenerationPolling(generationId: string | null): GenerationPollResult {
  const [result, setResult] = useState<GenerationPollResult>({ kind: "pending", stageIdx: 0 });
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stageTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!generationId) return;

    stageTimerRef.current = setInterval(() => {
      setResult((prev) =>
        prev.kind === "pending"
          ? { kind: "pending", stageIdx: nextStageIdx(prev.stageIdx) }
          : prev,
      );
    }, GENERATING_STAGE_INTERVAL_MS);

    let attempts = 0;
    let cancelled = false;

    const clear = () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      if (stageTimerRef.current) clearInterval(stageTimerRef.current);
      pollTimerRef.current = null;
      stageTimerRef.current = null;
    };

    pollTimerRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const r = await fetch(
          `/api/proyectos/generations/${encodeURIComponent(generationId)}/status`,
          { cache: "no-store" },
        );
        if (!r.ok) return;
        const s = (await r.json()) as StatusResponse;
        if (cancelled) return;

        if (s.status === "success" && s.project_id) {
          clear();
          setResult({ kind: "success", projectId: s.project_id });
          return;
        }

        if (s.status && s.status !== "pending") {
          clear();
          setResult({ kind: "error", message: generationErrorMessage(s.status) });
          return;
        }

        if (attempts >= POLL_MAX_ATTEMPTS) {
          clear();
          setResult({
            kind: "error",
            message: GENERATION_ERROR_COPY.timeout,
          });
        }
      } catch {
        // network blip — try again on next interval
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clear();
    };
  }, [generationId]);

  return result;
}
