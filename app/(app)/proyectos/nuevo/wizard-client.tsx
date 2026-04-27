"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  GENERATING_STAGE_INTERVAL_MS,
  GENERATING_STAGE_MESSAGES,
  GeneratingOverlay,
} from "@/components/ui/generating-overlay";

type Student = {
  id: string;
  first_name: string;
  last_name: string;
  grade: number;
};

type Materia = {
  id: string;
  slug: string;
  nombre: string;
  orden: number;
};

type Step = 1 | 2 | 3 | 4;

type WizardState = {
  step: Step;
  selectedGrades: number[];
  selectedStudentIds: string[];
  selectedMateriaIds: string[];
  duracion: 1 | 2;
  tema: string;
};

type DraftShape = Omit<WizardState, "step"> & { step: number };

const DRAFT_KEY = "pbl-wizard-draft-v1";
const MAX_MATERIAS = 3;

type GenerationPhase =
  | { kind: "idle" }
  | { kind: "generating"; stageIdx: number }
  | { kind: "error"; message: string };

export function WizardClient({
  students,
  materias,
}: {
  students: Student[];
  materias: Materia[];
}) {
  const router = useRouter();

  const availableGrades = useMemo(
    () => [...new Set(students.map((s) => s.grade))].sort((a, b) => a - b),
    [students],
  );

  // Hydrate from localStorage on first mount.
  const [state, setState] = useState<WizardState>(() => ({
    step: 1,
    selectedGrades: availableGrades,
    selectedStudentIds: students.map((s) => s.id),
    selectedMateriaIds: [],
    duracion: 1,
    tema: "",
  }));

  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as DraftShape;
        // Intersect with current roster so a stale draft doesn't reference deleted students
        const validStudentIds = new Set(students.map((s) => s.id));
        const validGrades = new Set(availableGrades);
        const validMateriaIds = new Set(materias.map((m) => m.id));
        setState({
          step: (draft.step >= 1 && draft.step <= 4 ? draft.step : 1) as Step,
          selectedGrades: (draft.selectedGrades ?? availableGrades).filter((g) => validGrades.has(g)),
          selectedStudentIds: (draft.selectedStudentIds ?? students.map((s) => s.id)).filter((id) =>
            validStudentIds.has(id),
          ),
          selectedMateriaIds: (draft.selectedMateriaIds ?? []).filter((id) => validMateriaIds.has(id)),
          duracion: draft.duracion === 2 ? 2 : 1,
          tema: typeof draft.tema === "string" ? draft.tema : "",
        });
      }
    } catch {
      // corrupted draft — start fresh
      window.localStorage.removeItem(DRAFT_KEY);
    }
    setHydrated(true);
  }, [students, availableGrades, materias]);

  // Persist to localStorage on any change (after hydration).
  useEffect(() => {
    if (!hydrated) return;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
    } catch {
      // ignore quota errors
    }
  }, [state, hydrated]);

  // -------- Generation state --------
  // Wizard only handles the POST + hand-off. Once the server has accepted the
  // generation (202 with a generation_id), we navigate to the resume page,
  // which owns polling and the overlay from that point on. The teacher sees no
  // visual jump because the resume page renders the same GeneratingOverlay.
  const [genPhase, setGenPhase] = useState<GenerationPhase>({ kind: "idle" });

  useEffect(() => {
    if (genPhase.kind !== "generating") return;
    const timer = setInterval(() => {
      setGenPhase((prev) =>
        prev.kind === "generating"
          ? { kind: "generating", stageIdx: (prev.stageIdx + 1) % GENERATING_STAGE_MESSAGES.length }
          : prev,
      );
    }, GENERATING_STAGE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [genPhase.kind]);

  // -------- Handlers --------
  const toggleGrade = (g: number) => {
    setState((prev) => {
      const has = prev.selectedGrades.includes(g);
      const nextGrades = has ? prev.selectedGrades.filter((x) => x !== g) : [...prev.selectedGrades, g].sort((a, b) => a - b);
      const nextStudentIds = students
        .filter((s) => nextGrades.includes(s.grade))
        .map((s) => s.id);
      return { ...prev, selectedGrades: nextGrades, selectedStudentIds: nextStudentIds };
    });
  };

  const toggleMateria = (id: string) => {
    setState((prev) => {
      const has = prev.selectedMateriaIds.includes(id);
      if (has) {
        return { ...prev, selectedMateriaIds: prev.selectedMateriaIds.filter((x) => x !== id) };
      }
      if (prev.selectedMateriaIds.length >= MAX_MATERIAS) return prev;
      return { ...prev, selectedMateriaIds: [...prev.selectedMateriaIds, id] };
    });
  };

  const setDuracion = (d: 1 | 2) => setState((p) => ({ ...p, duracion: d }));
  const setTema = (t: string) => setState((p) => ({ ...p, tema: t }));

  const goNext = () => setState((p) => ({ ...p, step: Math.min(4, p.step + 1) as Step }));
  const goBack = () => setState((p) => ({ ...p, step: Math.max(1, p.step - 1) as Step }));

  const step1Valid =
    state.selectedGrades.length > 0 && state.selectedStudentIds.length > 0;
  const step2Valid = state.selectedMateriaIds.length >= 1;

  const startGeneration = async () => {
    if (!step1Valid || !step2Valid) return;

    const idempotencyKey = crypto.randomUUID();
    setGenPhase({ kind: "generating", stageIdx: 0 });

    try {
      const res = await fetch("/api/proyectos/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          grados: state.selectedGrades,
          materia_ids: state.selectedMateriaIds,
          student_ids: state.selectedStudentIds,
          duracion_semanas: state.duracion,
          tema_contexto: state.tema.trim() || null,
        }),
      });

      const body = (await res.json().catch(() => ({}))) as {
        generation_id?: string;
        status?: string;
        project_id?: string;
        message?: string;
        error?: string;
      };

      if (!res.ok) {
        setGenPhase({
          kind: "error",
          message: body.message ?? "No pudimos crear el proyecto. Intenta de nuevo.",
        });
        return;
      }

      // Same idempotency key already succeeded server-side — jump straight to the project.
      if (body.status === "success" && body.project_id) {
        clearDraft();
        router.replace(`/proyectos/${body.project_id}`);
        return;
      }
      if (body.status && body.status !== "pending") {
        setGenPhase({
          kind: "error",
          message:
            "No pudimos generar el proyecto. Tu información está guardada. Intenta de nuevo cuando haya mejor señal.",
        });
        return;
      }

      if (!body.generation_id) {
        setGenPhase({ kind: "error", message: "Algo pasó, intenta de nuevo." });
        return;
      }

      // Hand off to the resume page, which owns polling + overlay from here.
      // Clear the draft now so a dashboard back-nav doesn't pre-fill the wizard
      // with the same selections and invite a duplicate generation.
      clearDraft();
      router.replace(`/proyectos/generando/${body.generation_id}`);
    } catch (err) {
      setGenPhase({
        kind: "error",
        message: err instanceof Error ? err.message : "Algo pasó, intenta de nuevo.",
      });
    }
  };

  const clearDraft = () => {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      // ignore
    }
  };

  const dismissError = () =>
    setGenPhase({ kind: "idle" });

  // -------- Generating overlay --------
  if (genPhase.kind === "generating") {
    return <GeneratingOverlay stageIdx={genPhase.stageIdx} />;
  }

  // -------- Wizard UI --------
  return (
    <div>
      <TopBar step={state.step} onBack={state.step > 1 ? goBack : undefined} onClose={() => router.back()} />

      {genPhase.kind === "error" ? (
        <ErrorBanner message={genPhase.message} onRetry={startGeneration} onDismiss={dismissError} />
      ) : null}

      {state.step === 1 ? (
        <Step1Grades
          availableGrades={availableGrades}
          students={students}
          selectedGrades={state.selectedGrades}
          onToggleGrade={toggleGrade}
          selectedStudentIds={state.selectedStudentIds}
        />
      ) : null}

      {state.step === 2 ? (
        <Step2Materias
          materias={materias}
          selectedMateriaIds={state.selectedMateriaIds}
          onToggleMateria={toggleMateria}
        />
      ) : null}

      {state.step === 3 ? (
        <Step3Duracion duracion={state.duracion} onPick={setDuracion} />
      ) : null}

      {state.step === 4 ? (
        <Step4Tema tema={state.tema} onChangeTema={setTema} />
      ) : null}

      <div className="mt-6">
        {state.step < 4 ? (
          <Button
            onClick={goNext}
            className="w-full"
            disabled={
              (state.step === 1 && !step1Valid) ||
              (state.step === 2 && !step2Valid)
            }
          >
            Siguiente
          </Button>
        ) : (
          <Button onClick={startGeneration} variant="secondary" className="w-full">
            Generar proyecto
          </Button>
        )}
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Step components
// -----------------------------------------------------------------------------

function TopBar({
  step,
  onBack,
  onClose,
}: {
  step: number;
  onBack?: () => void;
  onClose?: () => void;
}) {
  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          disabled={!onBack}
          className="text-sm font-medium text-brand-blue disabled:opacity-40"
        >
          ◀ Atrás
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-text-secondary"
        >
          Cerrar
        </button>
      </div>
      <p className="mb-2 text-xs font-medium text-text-secondary">Paso {step} de 4</p>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4].map((s) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full ${
              s < step ? "bg-brand-yellow" : s === step ? "bg-brand-blue" : "bg-border"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function Step1Grades({
  availableGrades,
  students,
  selectedGrades,
  onToggleGrade,
  selectedStudentIds,
}: {
  availableGrades: number[];
  students: Student[];
  selectedGrades: number[];
  onToggleGrade: (g: number) => void;
  selectedStudentIds: string[];
}) {
  const includedStudentCount = selectedStudentIds.length;
  const byGrade: Record<number, number> = {};
  for (const s of students) {
    if (selectedGrades.includes(s.grade)) byGrade[s.grade] = (byGrade[s.grade] ?? 0) + 1;
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">¿Para qué grados?</h1>
      <p className="mb-6 text-sm text-text-secondary">
        Todos tus grados están seleccionados por defecto. Puedes quitar los que no quieras incluir.
      </p>
      <div className="mb-6 grid grid-cols-3 gap-3">
        {availableGrades.map((g) => {
          const active = selectedGrades.includes(g);
          const count = students.filter((s) => s.grade === g).length;
          return (
            <button
              key={g}
              type="button"
              onClick={() => onToggleGrade(g)}
              className={`rounded-xl border-[1.5px] p-3 text-center transition-colors ${
                active
                  ? "border-brand-blue bg-brand-blue/5"
                  : "border-border bg-card-bg opacity-70"
              }`}
            >
              <p className="text-lg font-bold">{g}°</p>
              <p className="text-[11px] text-text-secondary">{count} est.</p>
            </button>
          );
        })}
      </div>
      <div className="rounded-xl bg-input-bg p-3 text-sm">
        <p>
          <span className="font-semibold">{includedStudentCount}</span>{" "}
          estudiante{includedStudentCount === 1 ? "" : "s"} incluido
          {includedStudentCount === 1 ? "" : "s"}
        </p>
        {Object.entries(byGrade).length > 0 ? (
          <p className="mt-1 text-xs text-text-secondary">
            {Object.entries(byGrade)
              .map(([g, n]) => `${g}°: ${n}`)
              .join(" · ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Step2Materias({
  materias,
  selectedMateriaIds,
  onToggleMateria,
}: {
  materias: Materia[];
  selectedMateriaIds: string[];
  onToggleMateria: (id: string) => void;
}) {
  const atCap = selectedMateriaIds.length >= MAX_MATERIAS;

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">¿Qué materias quieres integrar?</h1>
      <p className="mb-2 text-sm text-text-secondary">
        Elige al menos una. Si no sabes por dónde empezar, Lenguaje + Ciencias Naturales funciona muy bien.
      </p>
      <p className="mb-6 text-xs text-text-placeholder">
        Hasta {MAX_MATERIAS} materias por proyecto en esta versión.
      </p>
      <div className="space-y-2">
        {materias.map((m) => {
          const active = selectedMateriaIds.includes(m.id);
          const disabled = !active && atCap;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onToggleMateria(m.id)}
              disabled={disabled}
              className={`flex w-full items-center justify-between rounded-xl border-[1.5px] px-4 py-3 text-left transition-colors disabled:opacity-40 ${
                active
                  ? "border-brand-blue bg-brand-blue/5"
                  : "border-border bg-card-bg"
              }`}
            >
              <span className="font-medium">{m.nombre}</span>
              <span
                className={`h-5 w-5 rounded-full border-[1.5px] ${
                  active ? "border-brand-blue bg-brand-blue" : "border-border"
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Step3Duracion({
  duracion,
  onPick,
}: {
  duracion: 1 | 2;
  onPick: (d: 1 | 2) => void;
}) {
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">¿Cuánto dura el proyecto?</h1>
      <p className="mb-6 text-sm text-text-secondary">
        Elige la duración que mejor se ajuste a tu semana.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {([1, 2] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onPick(d)}
            className={`rounded-2xl border-[1.5px] p-6 text-center transition-colors ${
              duracion === d
                ? "border-brand-blue bg-brand-blue/5"
                : "border-border bg-card-bg"
            }`}
          >
            <p className="text-3xl font-bold">{d}</p>
            <p className="mt-1 text-sm text-text-secondary">
              semana{d === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-[11px] text-text-placeholder">
              {d === 1 ? "5 días de clase" : "10 días de clase"}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

function Step4Tema({
  tema,
  onChangeTema,
}: {
  tema: string;
  onChangeTema: (t: string) => void;
}) {
  const remaining = 500 - tema.length;
  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">¿Algo específico para incluir?</h1>
      <p className="mb-2 text-sm text-text-secondary">
        Opcional. Puedes mencionar un tema, lugar, o problema de tu vereda.
      </p>
      <p className="mb-4 text-xs text-text-placeholder">
        Ej: el agua de la quebrada, los cultivos de la temporada, una fiesta local…
      </p>
      <textarea
        value={tema}
        onChange={(e) => onChangeTema(e.target.value)}
        maxLength={500}
        rows={4}
        placeholder="Cuéntale al proyecto sobre tu vereda…"
        className="w-full rounded-xl border-[1.5px] border-border bg-input-bg px-4 py-3 text-base leading-relaxed placeholder:text-text-placeholder focus:border-brand-blue focus:outline-none"
      />
      <p className="mt-1 text-right text-[11px] text-text-placeholder">
        {remaining} caracteres restantes
      </p>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Error banner
// -----------------------------------------------------------------------------

function ErrorBanner({
  message,
  onRetry,
  onDismiss,
}: {
  message: string;
  onRetry: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="mb-4 rounded-xl border-[1.5px] border-brand-red bg-[#ffe0e0] p-3 text-sm">
      <p className="mb-2 font-medium text-[var(--grade-3-text)]">{message}</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="font-semibold text-brand-blue"
        >
          Intentar de nuevo
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="font-medium text-text-secondary"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}
