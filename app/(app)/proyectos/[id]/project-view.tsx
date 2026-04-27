"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Info,
  MoreVertical,
  Printer,
  Share2,
  Sparkles,
  Archive,
  RotateCcw,
} from "lucide-react";
import { GradeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  setPhaseCompleted,
  setProjectStatus,
  setSeEnsenoBien,
} from "./actions";

type Status = "generado" | "en_ensenanza" | "completado" | "archivado";

type Project = {
  id: string;
  titulo: string;
  pregunta_guia: string;
  tema_contexto: string | null;
  duracion_semanas: number;
  producto_final: string;
  cierre_actividad: string;
  cierre_evaluacion: string;
  status: Status;
  se_enseno_bien: boolean | null;
  created_at: string;
};

type Meta = {
  grados: number[];
  materias: Array<{ id: string; slug: string; nombre: string }>;
  studentCount: number;
};

type TargetsByGrade = Array<{
  grado: number;
  items: Array<{
    materia_id: string;
    materia_nombre: string;
    materia_slug: string;
    dba_numero: number;
    enunciado: string;
    evidencia: string | null;
  }>;
}>;

type Phase = {
  id: string;
  orden: number;
  nombre: string;
  dias_label: string;
  descripcion: string;
  completed_at: string | null;
  byGrade: Array<{
    grado: number;
    byMateria: Array<{
      materia_id: string;
      materia_nombre: string;
      materia_slug: string;
      tarea: string;
      evidencia_observable: string;
      targetIds: string[];
    }>;
  }>;
};

type TargetMap = Record<
  string,
  {
    grado: number;
    materia_id: string;
    dba_numero: number;
    enunciado: string;
    evidencia: string | null;
  }
>;

export function ProjectView({
  project,
  meta,
  targetsByGrade,
  phases,
  targetById,
  materiales,
}: {
  project: Project;
  meta: Meta;
  targetsByGrade: TargetsByGrade;
  phases: Phase[];
  targetById: TargetMap;
  materiales: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const currentPhaseId = useMemo(
    () => phases.find((p) => !p.completed_at)?.id ?? null,
    [phases],
  );

  // Open state is derived: the current (first-incomplete) phase is open by
  // default; the user can override per phase by clicking the header. Storing
  // overrides only — not the full open set — avoids stale state when
  // currentPhaseId changes (e.g. after completing a phase).
  const [userToggled, setUserToggled] = useState<Map<string, boolean>>(
    () => new Map(),
  );

  const isPhaseOpen = (id: string): boolean => {
    if (userToggled.has(id)) return userToggled.get(id)!;
    return id === currentPhaseId;
  };

  const togglePhase = (id: string) => {
    setUserToggled((prev) => {
      const next = new Map(prev);
      const currentlyOpen = prev.has(id)
        ? prev.get(id)!
        : id === currentPhaseId;
      next.set(id, !currentlyOpen);
      return next;
    });
  };

  const scrollToPhase = (id: string) => {
    setUserToggled((prev) => {
      const next = new Map(prev);
      next.set(id, true);
      return next;
    });
    requestAnimationFrame(() => {
      const el = document.getElementById(`phase-${id}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const handleStatus = (status: Status) => {
    startTransition(async () => {
      await setProjectStatus(project.id, status);
      router.refresh();
    });
  };

  const handleFeedback = (value: boolean) => {
    startTransition(async () => {
      await setSeEnsenoBien(project.id, value);
      router.refresh();
    });
  };

  const handlePhaseComplete = (phaseId: string, completed: boolean) => {
    startTransition(async () => {
      await setPhaseCompleted(project.id, phaseId, completed);
      router.refresh();
    });
  };

  const handlePrint = () => window.print();

  const handleShare = async () => {
    const text = `${project.titulo}\n\n${project.pregunta_guia}\n\nCreado con Colombiando · colombiando.app`;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: project.titulo, text });
        return;
      } catch {
        // user cancelled or unsupported → fall back
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      alert("Copiado al portapapeles.");
    } catch {
      alert("Comparte manualmente el texto del proyecto.");
    }
  };

  const completedCount = phases.filter((p) => p.completed_at).length;
  const todayPhaseId = useMemo(() => {
    if (project.status !== "en_ensenanza") return null;
    const today = todayDayOfWeekEs();
    return (
      phases.find(
        (p) => !p.completed_at && phaseContainsDay(p.dias_label, today),
      )?.id ?? null
    );
  }, [project.status, phases]);

  const currentPhase = phases.find((p) => p.id === currentPhaseId);

  // Empty / recovery state — generation half-failed and left a project row
  // with no phases. Show the header and a recovery callout instead of an
  // empty plan.
  if (phases.length === 0) {
    return (
      <div>
        <BackLink />
        <Header
          project={project}
          meta={meta}
          onPrint={handlePrint}
          onShare={handleShare}
          onArchive={() => handleStatus("archivado")}
          onUnarchive={() => handleStatus("generado")}
        />
        <div className="my-6 rounded-2xl bg-brand-yellow/20 border-b-4 border-black p-4">
          <p className="mb-2 flex items-center gap-2 font-semibold">
            <Info size={18} /> Este proyecto no tiene plan generado.
          </p>
          <p className="mb-3 text-sm">
            La generación quedó incompleta. Puedes intentar generar de nuevo con
            las mismas preferencias.
          </p>
          <Button
            variant="primary"
            onClick={() => router.push("/proyectos/nuevo")}
            className="w-full"
          >
            Volver a generar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <BackLink />
      <Header
        project={project}
        meta={meta}
        onPrint={handlePrint}
        onShare={handleShare}
        onArchive={() => handleStatus("archivado")}
        onUnarchive={() => handleStatus("generado")}
      />

      <NextStepHero
        status={project.status}
        seEnsenoBien={project.se_enseno_bien}
        currentPhase={currentPhase}
        todayPhaseId={todayPhaseId}
        completedCount={completedCount}
        totalPhases={phases.length}
        isPending={isPending}
        onStart={() => handleStatus("en_ensenanza")}
        onScrollToPhase={scrollToPhase}
        onChooseFeedback={handleFeedback}
      />

      <ProductoFinalPreview text={project.producto_final} />

      <ProgressStrip
        phases={phases}
        onSelect={scrollToPhase}
      />

      {/* Plan por fases */}
      <section className="mb-6">
        <h2 className="mb-3 text-lg font-bold">Plan por fases</h2>
        <div className="space-y-3">
          {phases.map((phase) => (
            <PhaseCard
              key={phase.id}
              phase={phase}
              isOpen={isPhaseOpen(phase.id)}
              isToday={phase.id === todayPhaseId}
              isCurrent={phase.id === currentPhaseId}
              onToggle={() => togglePhase(phase.id)}
              onComplete={(done) => handlePhaseComplete(phase.id, done)}
              targetById={targetById}
              isPending={isPending}
            />
          ))}
        </div>
      </section>

      {/* Reference material — collapsed by default, force-open in print */}
      <DisclosureSection title="DBAs y evidencias">
        {targetsByGrade.map(({ grado, items }) => (
          <div key={grado} className="mb-3">
            <div className="mb-2 flex items-center gap-2">
              <GradeBadge grade={grado} />
            </div>
            <ul className="space-y-2">
              {items.map((t, i) => (
                <li key={`${grado}-${t.materia_id}-${i}`} className="text-sm">
                  <span className="font-semibold">{t.materia_nombre}:</span>{" "}
                  DBA #{t.dba_numero} — {t.enunciado}
                  {t.evidencia && t.materia_slug !== "ingles" ? (
                    <p className="mt-1 pl-3 text-xs text-text-secondary">
                      Evidencia: {t.evidencia}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {targetsByGrade.length === 0 ? (
          <p className="text-sm text-text-secondary">(sin elementos)</p>
        ) : null}
      </DisclosureSection>

      <DisclosureSection title="Materiales">
        {materiales.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {materiales.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-secondary">(sin elementos)</p>
        )}
      </DisclosureSection>

      <DisclosureSection title="Cierre del proyecto">
        <div className="space-y-3 text-sm">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
              Actividad
            </p>
            <p className="leading-relaxed">{project.cierre_actividad}</p>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
              Cómo evaluar
            </p>
            <p className="leading-relaxed">{project.cierre_evaluacion}</p>
          </div>
        </div>
      </DisclosureSection>

      {/* Project-level completion CTA — ghost, less prominent than phase
          completion (which is the daily action). */}
      {project.status === "en_ensenanza" ? (
        <div className="my-8 no-print">
          <Button
            variant="ghost"
            onClick={() => handleStatus("completado")}
            disabled={isPending}
            className="w-full"
          >
            Marqué este proyecto como completado
          </Button>
        </div>
      ) : null}

      {project.status === "completado" && project.se_enseno_bien !== null ? (
        <div className="my-8 no-print">
          <Button
            variant="ghost"
            onClick={() => handleStatus("en_ensenanza")}
            disabled={isPending}
            className="w-full"
          >
            Volver a enseñar
          </Button>
        </div>
      ) : null}

      {project.status === "archivado" ? (
        <div className="my-6 rounded-xl border border-border bg-input-bg p-3 text-center text-xs text-text-secondary">
          Proyecto archivado.
        </div>
      ) : null}
    </div>
  );
}

// =============================================================================
// Header (back link, title with kebab, pregunta as subtitle, meta strip)
// =============================================================================

function BackLink() {
  const router = useRouter();
  return (
    <div className="mb-4 no-print">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-blue"
      >
        <ChevronLeft size={16} aria-hidden /> Mis proyectos
      </button>
    </div>
  );
}

function Header({
  project,
  meta,
  onPrint,
  onShare,
  onArchive,
  onUnarchive,
}: {
  project: Project;
  meta: Meta;
  onPrint: () => void;
  onShare: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
}) {
  return (
    <header>
      <div className="mb-4 h-1 w-12 rounded-full bg-brand-yellow" />
      <div className="mb-2 flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold leading-tight">{project.titulo}</h1>
        <div className="no-print">
          <KebabMenu
            isArchived={project.status === "archivado"}
            onPrint={onPrint}
            onShare={onShare}
            onArchive={onArchive}
            onUnarchive={onUnarchive}
          />
        </div>
      </div>
      <p className="mb-3 text-base leading-relaxed text-text-secondary">
        {project.pregunta_guia}
      </p>
      <MetaRow meta={meta} duracion={project.duracion_semanas} />
    </header>
  );
}

function MetaRow({ meta, duracion }: { meta: Meta; duracion: number }) {
  const materiasLabel = meta.materias.map((m) => m.nombre).join(" · ");
  const gradosLabel = meta.grados.map((g) => `${g}°`).join(" · ");
  return (
    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
      <span>
        <strong className="text-text-primary">{duracion}</strong> semana
        {duracion === 1 ? "" : "s"}
      </span>
      <span>
        <strong className="text-text-primary">{meta.studentCount}</strong>{" "}
        estudiante{meta.studentCount === 1 ? "" : "s"}
      </span>
      <span>Grados: {gradosLabel}</span>
      <span>Materias: {materiasLabel}</span>
    </div>
  );
}

// =============================================================================
// Next-step hero (status-aware, speech-bubble style)
// =============================================================================

function NextStepHero({
  status,
  seEnsenoBien,
  currentPhase,
  todayPhaseId,
  completedCount,
  totalPhases,
  isPending,
  onStart,
  onScrollToPhase,
  onChooseFeedback,
}: {
  status: Status;
  seEnsenoBien: boolean | null;
  currentPhase: Phase | undefined;
  todayPhaseId: string | null;
  completedCount: number;
  totalPhases: number;
  isPending: boolean;
  onStart: () => void;
  onScrollToPhase: (id: string) => void;
  onChooseFeedback: (value: boolean) => void;
}) {
  if (status === "archivado") return null;

  if (status === "generado") {
    return (
      <SpeechBubble>
        <p className="mb-3 leading-relaxed">
          Listo para empezar. Cuando arranques la primera clase, marca el
          proyecto como en curso.
        </p>
        <Button
          variant="primary"
          onClick={onStart}
          disabled={isPending}
          size="sm"
          className="w-full"
        >
          Empezar a enseñar
        </Button>
      </SpeechBubble>
    );
  }

  if (status === "en_ensenanza") {
    if (todayPhaseId && currentPhase) {
      return (
        <SpeechBubble>
          <p className="mb-3 leading-relaxed">
            Hoy es {todayDayName()}. Estás en{" "}
            <strong>
              Fase {currentPhase.orden}: {currentPhase.nombre}
            </strong>
            .
          </p>
          <Button
            variant="primary"
            onClick={() => onScrollToPhase(todayPhaseId)}
            size="sm"
            className="w-full"
          >
            Ver fase de hoy
          </Button>
        </SpeechBubble>
      );
    }
    if (currentPhase) {
      return (
        <SpeechBubble>
          <p className="mb-3 leading-relaxed">
            En curso · Fase {currentPhase.orden} de {totalPhases}:{" "}
            <strong>{currentPhase.nombre}</strong>.
          </p>
          <Button
            variant="primary"
            onClick={() => onScrollToPhase(currentPhase.id)}
            size="sm"
            className="w-full"
          >
            Ver el plan
          </Button>
        </SpeechBubble>
      );
    }
    // All phases completed but project status still en_ensenanza
    return (
      <SpeechBubble>
        <p className="mb-3 leading-relaxed">
          Marcaste todas las fases como hechas. ¿Completar el proyecto?
        </p>
        <p className="text-xs text-text-secondary">
          {completedCount} de {totalPhases} fases completadas.
        </p>
      </SpeechBubble>
    );
  }

  // status === "completado"
  if (seEnsenoBien === null) {
    return (
      <SpeechBubble>
        <p className="mb-1 font-semibold leading-relaxed">
          Lo enseñaste. ¿Funcionó para tus estudiantes?
        </p>
        <p className="mb-3 text-xs text-text-secondary">
          Tu respuesta nos ayuda a hacerlo mejor.
        </p>
        <div className="flex gap-2">
          <Button
            variant="primary"
            onClick={() => onChooseFeedback(true)}
            disabled={isPending}
            size="sm"
            className="flex-1"
          >
            Sí, funcionó
          </Button>
          <Button
            variant="ghost"
            onClick={() => onChooseFeedback(false)}
            disabled={isPending}
            size="sm"
            className="flex-1"
          >
            Más o menos
          </Button>
        </div>
      </SpeechBubble>
    );
  }
  return (
    <SpeechBubble>
      <p className="leading-relaxed">
        {seEnsenoBien
          ? "¡Funcionó! Gracias por contarnos."
          : "Tomamos nota. Gracias por contarnos."}
      </p>
    </SpeechBubble>
  );
}

function SpeechBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative my-6 rounded-2xl border-b-4 border-black bg-brand-yellow p-4 no-print">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Sparkles size={16} aria-hidden />
        <span>Colombiando</span>
      </div>
      <div className="text-sm">{children}</div>
      {/* Speech-bubble tail (decorative, hidden if anyone disables it via CSS) */}
      <span
        aria-hidden
        className="absolute -bottom-3 left-6 block h-0 w-0 border-x-8 border-t-[12px] border-x-transparent border-t-brand-yellow"
      />
      <span
        aria-hidden
        className="absolute -bottom-[14px] left-[22px] -z-10 block h-0 w-0 border-x-[10px] border-t-[14px] border-x-transparent border-t-black"
      />
    </div>
  );
}

// =============================================================================
// Producto final preview — one-line, click to expand
// =============================================================================

function ProductoFinalPreview({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start justify-between gap-3 rounded-xl border border-border bg-card-bg px-3 py-2 text-left text-sm no-print"
        aria-expanded={open}
      >
        <span className="min-w-0 flex-1">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
            Producto final
          </span>
          {!open ? (
            <span className="ml-2 truncate text-text-primary">
              {text.length > 90 ? text.slice(0, 90) + "…" : text}
            </span>
          ) : null}
        </span>
        <ChevronDown
          size={18}
          aria-hidden
          className={`mt-0.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open ? (
        <p className="mt-2 px-3 text-sm leading-relaxed">{text}</p>
      ) : null}
      {/* Print: always show full text, hide the toggle */}
      <div className="hidden print:block">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
          Producto final
        </p>
        <p className="text-sm leading-relaxed">{text}</p>
      </div>
    </section>
  );
}

// =============================================================================
// Progress strip — N segments, 1 per phase. Tap → scroll to phase.
// =============================================================================

function ProgressStrip({
  phases,
  onSelect,
}: {
  phases: Phase[];
  onSelect: (id: string) => void;
}) {
  const completedCount = phases.filter((p) => p.completed_at).length;
  const total = phases.length;
  const currentIdx = phases.findIndex((p) => !p.completed_at);
  return (
    <section className="mb-6 no-print">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
          Progreso
        </h2>
        <p className="text-xs text-text-secondary">
          <strong className="text-text-primary">{completedCount}</strong> de{" "}
          {total} {total === 1 ? "fase" : "fases"} completada
          {completedCount === 1 ? "" : "s"}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {phases.map((p, i) => {
          const done = !!p.completed_at;
          const current = i === currentIdx;
          return (
            <div key={p.id} className="flex flex-1 items-center gap-1">
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                aria-label={`Ir a Fase ${p.orden}: ${p.nombre}${done ? " (completada)" : current ? " (actual)" : ""}`}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                  done
                    ? "border-brand-blue bg-brand-blue text-white"
                    : current
                      ? "border-black bg-brand-yellow text-black"
                      : "border-border bg-card-bg text-text-placeholder"
                }`}
              >
                {done ? <Check size={14} aria-hidden /> : p.orden}
              </button>
              {i < phases.length - 1 ? (
                <div
                  className={`h-1 flex-1 rounded-full ${done ? "bg-brand-blue" : "bg-border"}`}
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

// =============================================================================
// Phase card — accordion, completion toggle, current-phase highlight
// =============================================================================

function PhaseCard({
  phase,
  isOpen,
  isToday,
  isCurrent,
  onToggle,
  onComplete,
  targetById,
  isPending,
}: {
  phase: Phase;
  isOpen: boolean;
  isToday: boolean;
  isCurrent: boolean;
  onToggle: () => void;
  onComplete: (done: boolean) => void;
  targetById: TargetMap;
  isPending: boolean;
}) {
  const completed = !!phase.completed_at;
  return (
    <div
      id={`phase-${phase.id}`}
      className={`rounded-2xl border-[1.5px] bg-card-bg overflow-hidden ${
        isCurrent && !completed
          ? "border-black"
          : completed
            ? "border-border"
            : "border-border"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={isOpen}
      >
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-xs font-medium text-text-secondary">
            <span>
              Fase {phase.orden} · {phase.dias_label}
            </span>
            {isToday ? (
              <span className="rounded-full bg-brand-yellow px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black">
                Hoy
              </span>
            ) : null}
            {completed ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-blue/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-blue">
                <Check size={10} aria-hidden /> Completada
              </span>
            ) : null}
          </p>
          <p className="font-semibold">{phase.nombre}</p>
        </div>
        <ChevronDown
          size={18}
          aria-hidden
          className={`shrink-0 text-text-secondary transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen ? (
        <div className="border-t border-border px-4 py-4">
          <p className="mb-4 text-sm leading-relaxed text-text-secondary">
            {phase.descripcion}
          </p>
          <div className="space-y-4">
            {phase.byGrade.map((g) => (
              <GradeCard
                key={g.grado}
                grado={g.grado}
                byMateria={g.byMateria}
                targetById={targetById}
              />
            ))}
          </div>
          <div className="mt-4 no-print">
            {completed ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onComplete(false)}
                disabled={isPending}
                className="w-full"
              >
                Marcar como pendiente
              </Button>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onComplete(true)}
                disabled={isPending}
                className="w-full"
              >
                Marqué la fase como hecha
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function GradeCard({
  grado,
  byMateria,
  targetById,
}: {
  grado: number;
  byMateria: Phase["byGrade"][number]["byMateria"];
  targetById: TargetMap;
}) {
  const bgVars: Record<number, string> = {
    0: "bg-[var(--grade-1-bg)]",
    1: "bg-[var(--grade-1-bg)]",
    2: "bg-[var(--grade-2-bg)]",
    3: "bg-[var(--grade-3-bg)]",
    4: "bg-[var(--grade-4-bg)]",
    5: "bg-[var(--grade-5-bg)]",
  };
  return (
    <div className={`rounded-xl p-3 ${bgVars[grado] ?? "bg-input-bg"}`}>
      <div className="mb-2">
        <GradeBadge grade={grado} />
      </div>
      <div className="space-y-3">
        {byMateria.map((m) => (
          <div key={m.materia_id}>
            <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
              {m.materia_nombre}
            </p>
            <p className="text-sm leading-relaxed">{m.tarea}</p>
            <p className="mt-1 text-[11px] text-text-secondary">
              Observación en clase: {m.evidencia_observable}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {m.targetIds.map((tid) => {
                const t = targetById[tid];
                if (!t) return <WarningChip key={tid} label="DBA no disponible" />;
                return (
                  <DbaPill
                    key={tid}
                    target={t}
                    isIngles={m.materia_slug === "ingles"}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DbaPill({
  target,
  isIngles,
}: {
  target: TargetMap[string];
  isIngles: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-full bg-brand-blue/10 px-2.5 py-1 text-[11px] font-semibold text-brand-blue"
        aria-expanded={open}
      >
        DBA #{target.dba_numero}
      </button>
      {open ? (
        <div className="mt-2 rounded-xl bg-card-bg p-3 text-xs text-text-secondary shadow-sm">
          <p className="text-text-primary">{target.enunciado}</p>
          {target.evidencia && !isIngles ? (
            <p className="mt-2">
              <span className="font-semibold text-text-secondary">Evidencia:</span>{" "}
              {target.evidencia}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function WarningChip({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-[var(--grade-1-bg)] px-2.5 py-1 text-[11px] font-medium text-[var(--grade-1-text)]">
      {label}
    </span>
  );
}

// =============================================================================
// Disclosure section (collapsible, force-open in print)
// =============================================================================

function DisclosureSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="mb-3 border-t border-border">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between py-3 text-left no-print"
        aria-expanded={open}
      >
        <h2 className="text-base font-bold">{title}</h2>
        <ChevronRight
          size={18}
          aria-hidden
          className={`text-text-secondary transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>
      <h2 className="hidden py-2 text-base font-bold print:block">{title}</h2>
      {open ? <div className="pb-4">{children}</div> : null}
      <div className="hidden pb-4 print:block">{children}</div>
    </section>
  );
}

// =============================================================================
// Kebab menu (top-right secondary actions)
// =============================================================================

function KebabMenu({
  isArchived,
  onPrint,
  onShare,
  onArchive,
  onUnarchive,
}: {
  isArchived: boolean;
  onPrint: () => void;
  onShare: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handle = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Más opciones"
        className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:bg-input-bg"
      >
        <MoreVertical size={20} aria-hidden />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 w-56 rounded-xl border border-border bg-card-bg py-1 shadow-lg"
        >
          <MenuItem onClick={handle(onPrint)} icon={<Printer size={16} />}>
            Imprimir / Guardar PDF
          </MenuItem>
          <MenuItem onClick={handle(onShare)} icon={<Share2 size={16} />}>
            Compartir en WhatsApp
          </MenuItem>
          {isArchived ? (
            <MenuItem
              onClick={handle(onUnarchive)}
              icon={<RotateCcw size={16} />}
            >
              Restaurar proyecto
            </MenuItem>
          ) : (
            <MenuItem onClick={handle(onArchive)} icon={<Archive size={16} />}>
              Archivar proyecto
            </MenuItem>
          )}
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-input-bg"
    >
      <span className="text-text-secondary">{icon}</span>
      <span>{children}</span>
    </button>
  );
}

// =============================================================================
// Helpers
// =============================================================================

function todayDayOfWeekEs(): string {
  const d = new Date().getDay();
  return ["dom", "lun", "mar", "mie", "jue", "vie", "sab"][d] ?? "";
}

function todayDayName(): string {
  const d = new Date().getDay();
  const names = [
    "domingo",
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
  ];
  return names[d] ?? "";
}

function phaseContainsDay(label: string, today: string): boolean {
  if (!today) return false;
  const norm = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const tokens = norm.split(/[^a-z]+/).filter(Boolean);
  return tokens.some((t) => t.startsWith(today));
}
