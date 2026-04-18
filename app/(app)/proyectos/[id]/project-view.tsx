"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GradeBadge } from "@/components/ui/badge";
import { setProjectStatus, setSeEnsenoBien } from "./actions";

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

  // Accordion state — first phase open by default; auto-focus current phase
  // for en_ensenanza status if its dias_label matches today.
  const initialOpen = useMemo(() => computeInitialOpen(project.status, phases), [project.status, phases]);
  const [openPhaseIds, setOpenPhaseIds] = useState<Set<string>>(initialOpen);

  // Persist accordion state per-project
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = `pbl-view-open-${project.id}`;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) setOpenPhaseIds(new Set(JSON.parse(raw) as string[]));
    } catch {
      // ignore
    }
  }, [project.id]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        `pbl-view-open-${project.id}`,
        JSON.stringify([...openPhaseIds]),
      );
    } catch {
      // ignore
    }
  }, [openPhaseIds, project.id]);

  const togglePhase = (id: string) => {
    setOpenPhaseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
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

  return (
    <div>
      {/* Accent bar — uses first grade's color if single-grade, else flag yellow */}
      <div className="mb-4 no-print">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm font-medium text-brand-blue"
        >
          ◀ Mis proyectos
        </button>
      </div>

      <div className="mb-4 h-1 w-12 rounded-full bg-brand-yellow" />
      <h1 className="mb-3 text-2xl font-bold leading-tight">{project.titulo}</h1>

      <MetaRow meta={meta} duracion={project.duracion_semanas} />

      <div className="my-6 rounded-2xl border-[1.5px] border-brand-blue/20 bg-brand-blue/5 p-4">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-brand-blue">
          Pregunta guía
        </p>
        <p className="text-base leading-relaxed">{project.pregunta_guia}</p>
      </div>

      {/* Status lifecycle + primary CTA */}
      <StatusControl
        status={project.status}
        isPending={isPending}
        onStart={() => handleStatus("en_ensenanza")}
        onComplete={() => handleStatus("completado")}
        onReopen={() => handleStatus("en_ensenanza")}
      />

      {/* Feedback prompt when completado */}
      {project.status === "completado" ? (
        <FeedbackPrompt
          current={project.se_enseno_bien}
          onChoose={handleFeedback}
          isPending={isPending}
        />
      ) : null}

      {/* DBAs objetivo */}
      <Section title="DBAs objetivo">
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
      </Section>

      {/* Phases accordion */}
      <Section title="Plan por fases">
        <div className="space-y-3">
          {phases.map((phase) => (
            <PhaseCard
              key={phase.id}
              phase={phase}
              isOpen={openPhaseIds.has(phase.id)}
              onToggle={() => togglePhase(phase.id)}
              targetById={targetById}
            />
          ))}
        </div>
      </Section>

      {/* Producto final */}
      <Section title="Producto final">
        <p className="text-sm leading-relaxed">{project.producto_final}</p>
      </Section>

      {/* Materiales */}
      <Section title="Materiales">
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {materiales.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      </Section>

      {/* Cierre */}
      <Section title="Cierre">
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
      </Section>

      {/* Action bar */}
      <div className="my-8 grid grid-cols-2 gap-3 no-print">
        <button
          type="button"
          onClick={handlePrint}
          className="rounded-xl border-[1.5px] border-border bg-card-bg px-4 py-3 text-sm font-semibold"
        >
          Imprimir / Guardar PDF
        </button>
        <button
          type="button"
          onClick={handleShare}
          className="rounded-xl border-[1.5px] border-brand-blue bg-brand-blue/5 px-4 py-3 text-sm font-semibold text-brand-blue"
        >
          Compartir en WhatsApp
        </button>
      </div>

      <div className="mb-10 no-print">
        <ArchiveButton
          status={project.status}
          isPending={isPending}
          onArchive={() => handleStatus("archivado")}
          onUnarchive={() => handleStatus("generado")}
        />
      </div>
    </div>
  );
}

function MetaRow({ meta, duracion }: { meta: Meta; duracion: number }) {
  const materiasLabel = meta.materias.map((m) => m.nombre).join(" · ");
  const gradosLabel = meta.grados.map((g) => `${g}°`).join(" · ");
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function PhaseCard({
  phase,
  isOpen,
  onToggle,
  targetById,
}: {
  phase: Phase;
  isOpen: boolean;
  onToggle: () => void;
  targetById: TargetMap;
}) {
  return (
    <div className="rounded-2xl border-[1.5px] border-border bg-card-bg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
        aria-expanded={isOpen}
      >
        <div>
          <p className="text-xs font-medium text-text-secondary">
            Fase {phase.orden} · {phase.dias_label}
          </p>
          <p className="font-semibold">{phase.nombre}</p>
        </div>
        <span
          className={`flex-shrink-0 text-lg text-text-secondary transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
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
                if (!t) {
                  return (
                    <WarningChip key={tid} label="DBA no disponible" />
                  );
                }
                return <DbaPill key={tid} target={t} isIngles={m.materia_slug === "ingles"} />;
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

function StatusControl({
  status,
  isPending,
  onStart,
  onComplete,
  onReopen,
}: {
  status: Status;
  isPending: boolean;
  onStart: () => void;
  onComplete: () => void;
  onReopen: () => void;
}) {
  if (status === "archivado") {
    return (
      <div className="mb-6 rounded-xl border border-border bg-input-bg p-3 text-center text-xs text-text-secondary">
        Proyecto archivado.
      </div>
    );
  }
  if (status === "generado") {
    return (
      <button
        type="button"
        onClick={onStart}
        disabled={isPending}
        className="mb-6 w-full rounded-xl bg-brand-blue px-5 py-4 text-base font-semibold text-white disabled:opacity-50 no-print"
      >
        Empezar a enseñar
      </button>
    );
  }
  if (status === "en_ensenanza") {
    return (
      <button
        type="button"
        onClick={onComplete}
        disabled={isPending}
        className="mb-6 w-full rounded-xl bg-brand-yellow px-5 py-4 text-base font-bold text-text-primary disabled:opacity-50 no-print"
      >
        Marqué como completado
      </button>
    );
  }
  // completado
  return (
    <button
      type="button"
      onClick={onReopen}
      disabled={isPending}
      className="mb-6 w-full rounded-xl border-[1.5px] border-border bg-card-bg px-5 py-4 text-sm font-medium text-text-secondary disabled:opacity-50 no-print"
    >
      Volver a enseñar
    </button>
  );
}

function FeedbackPrompt({
  current,
  onChoose,
  isPending,
}: {
  current: boolean | null;
  onChoose: (value: boolean) => void;
  isPending: boolean;
}) {
  return (
    <div className="mb-6 rounded-2xl border-[1.5px] border-brand-yellow bg-[#fffbf0] p-4 no-print">
      <p className="mb-1 font-semibold">¿El proyecto funcionó para tus estudiantes?</p>
      <p className="mb-3 text-xs text-text-secondary">
        Tu respuesta nos ayuda a hacerlo mejor.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChoose(true)}
          disabled={isPending}
          className={`flex-1 rounded-xl border-[1.5px] px-3 py-2 text-sm font-semibold disabled:opacity-50 ${
            current === true
              ? "border-brand-green bg-brand-green/10 text-[var(--grade-5-text)]"
              : "border-border bg-white text-text-primary"
          }`}
        >
          Sí, funcionó
        </button>
        <button
          type="button"
          onClick={() => onChoose(false)}
          disabled={isPending}
          className={`flex-1 rounded-xl border-[1.5px] px-3 py-2 text-sm font-semibold disabled:opacity-50 ${
            current === false
              ? "border-brand-red bg-brand-red/10 text-[var(--grade-3-text)]"
              : "border-border bg-white text-text-primary"
          }`}
        >
          Más o menos
        </button>
      </div>
    </div>
  );
}

function ArchiveButton({
  status,
  isPending,
  onArchive,
  onUnarchive,
}: {
  status: Status;
  isPending: boolean;
  onArchive: () => void;
  onUnarchive: () => void;
}) {
  if (status === "archivado") {
    return (
      <button
        type="button"
        onClick={onUnarchive}
        disabled={isPending}
        className="text-sm text-brand-blue disabled:opacity-50"
      >
        Restaurar proyecto
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onArchive}
      disabled={isPending}
      className="text-sm text-text-secondary disabled:opacity-50"
    >
      Archivar proyecto
    </button>
  );
}

function computeInitialOpen(status: Status, phases: Phase[]): Set<string> {
  if (phases.length === 0) return new Set();
  // Only auto-focus current phase when we're in the middle of teaching
  if (status === "en_ensenanza") {
    const todayEs = todayDayOfWeekEs();
    const match = phases.find((p) => phaseContainsDay(p.dias_label, todayEs));
    if (match) return new Set([match.id]);
  }
  return new Set([phases[0].id]);
}

function todayDayOfWeekEs(): string {
  const d = new Date().getDay();
  // 0 = domingo, 1 = lunes, ...
  return ["dom", "lun", "mar", "mie", "jue", "vie", "sab"][d] ?? "";
}

function phaseContainsDay(label: string, today: string): boolean {
  if (!today) return false;
  const norm = label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const tokens = norm.split(/[^a-z]+/).filter(Boolean);
  return tokens.some((t) => t.startsWith(today));
}
