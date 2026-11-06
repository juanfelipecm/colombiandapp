"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Loader2,
  MoreVertical,
  Share2,
  Sparkles,
  Archive,
  RotateCcw,
  X,
} from "lucide-react";
import {
  shareImage,
  downloadPdf,
  type ShareKebabState as HandlerShareKebabState,
} from "@/lib/share-render/share-handlers";
import { GradeBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout, QuestionBox, TareaPreviaCallout } from "@/components/ui/callout";
import { splitParagraphs } from "@/lib/clase-viva/bloques";
import { TOTAL_FASES, type ProjectStatus } from "@/lib/clase-viva/etapas";
import { formatGradosList } from "@/lib/clase-viva/grados";
import type { LoadedPhase, TargetsByMateria } from "@/lib/projects/load-project";
import { PhaseSection } from "./phase-section";
import {
  setPhaseCompleted,
  setProjectStatus,
  setSeEnsenoBien,
} from "./actions";

type Status = ProjectStatus;

type ShareKebabState = HandlerShareKebabState;

export type ViewProject = {
  id: string;
  titulo: string;
  pregunta_guia: string;
  tarea_previa: string | null;
  status: Status;
  se_enseno_bien: boolean | null;
};

type Meta = {
  grados: number[];
  materias: Array<{ id: string; slug: string; nombre: string }>;
  studentCount: number;
};

/**
 * Clase Viva project view. One anchor per status (DR1):
 *
 *               generado              en_ensenanza                    completado
 *   1st  Título                       Título                          Título
 *   2nd  Pregunta guía box            Pregunta guía box               Pregunta guía box
 *   3rd  bubble "Empezar a enseñar"   strip + "Siguiente: Fase N"     feedback bubble
 *   4th  tarea previa callout above Fase 1 while Fase 1 is pending, else a disclosure
 *   5th  Las 5 fases (current fase open only while teaching; one primary: its Completar)
 *   6th  DBA por grado · Materiales · Completar proyecto / Volver a enseñar
 */
export function ProjectView({
  project,
  meta,
  targetsByMateria,
  phases,
  materiales,
  invalidoCount = 0,
}: {
  project: ViewProject;
  meta: Meta;
  targetsByMateria: TargetsByMateria;
  phases: LoadedPhase[];
  materiales: string[];
  invalidoCount?: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const teaching = project.status === "en_ensenanza";

  const currentPhase = useMemo(() => phases.find((p) => !p.completed_at) ?? null, [phases]);
  const currentPhaseId = currentPhase?.id ?? null;

  // Open state is derived: while teaching, the current (first-incomplete) fase
  // is open by default; otherwise all start collapsed. User clicks override.
  const [userToggled, setUserToggled] = useState<Map<string, boolean>>(() => new Map());
  const [announcement, setAnnouncement] = useState("");

  const isPhaseOpen = (id: string): boolean => {
    if (userToggled.has(id)) return userToggled.get(id)!;
    return teaching && id === currentPhaseId;
  };

  const togglePhase = (id: string) => {
    setUserToggled((prev) => {
      const next = new Map(prev);
      next.set(id, !isPhaseOpen(id));
      return next;
    });
  };

  const openAndScroll = (phase: LoadedPhase) => {
    setUserToggled((prev) => new Map(prev).set(phase.id, true));
    requestAnimationFrame(() => {
      document.getElementById(`fase-${phase.orden}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  // Deep link from cards/dashboard: /proyectos/[id]#fase-N opens and scrolls to it.
  useEffect(() => {
    const m = /^#fase-(\d)$/.exec(window.location.hash);
    if (!m) return;
    const target = phases.find((p) => p.orden === Number(m[1]));
    // Deferred a frame: open after the first paint instead of a cascading render.
    if (target) requestAnimationFrame(() => openAndScroll(target));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

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

  const handlePhaseComplete = (phase: LoadedPhase, completed: boolean) => {
    setAnnouncement(completed ? `Fase ${phase.orden} completada` : `Fase ${phase.orden} marcada como pendiente`);
    startTransition(async () => {
      await setPhaseCompleted(project.id, phase.id, completed);
      router.refresh();
    });
  };

  const handleCompleteProject = () => {
    if (!window.confirm("¿Completar este proyecto? Podrás volver a enseñarlo después si quieres.")) return;
    handleStatus("completado");
  };

  const [shareState, setShareState] = useState<ShareKebabState>("default");
  const [pdfState, setPdfState] = useState<ShareKebabState>("default");

  const handleShareImage = () => {
    if (shareState === "loading") return;
    void shareImage({ projectId: project.id, titulo: project.titulo, setState: setShareState });
  };

  const handleDownloadPdf = () => {
    if (pdfState === "loading") return;
    void downloadPdf({ projectId: project.id, titulo: project.titulo, setState: setPdfState });
  };

  const header = (
    <Header
      project={project}
      meta={meta}
      // An overview image that silently skips a damaged block is worse than none (DR6).
      onShareImage={invalidoCount > 0 ? undefined : handleShareImage}
      onDownloadPdf={handleDownloadPdf}
      shareState={shareState}
      pdfState={pdfState}
      onArchive={() => handleStatus("archivado")}
      onUnarchive={() => handleStatus("generado")}
    />
  );

  // Empty / recovery state — legacy (pbl-v1) project or a half-failed generation.
  if (phases.length === 0) {
    return (
      <div>
        <BackLink />
        {header}
        <Callout variant="warning" className="my-6">
          <p className="font-semibold">Este proyecto no tiene un plan Clase Viva.</p>
          <p className="text-sm">
            Fue creado con una versión anterior o la generación quedó incompleta. Puedes crear uno nuevo con
            las mismas preferencias.
          </p>
          <Button variant="primary" onClick={() => router.push("/proyectos/nuevo")} className="mt-2 w-full">
            Volver a generar
          </Button>
        </Callout>
      </div>
    );
  }

  const fase1Pending = !phases[0]?.completed_at;
  const showTareaAboveFase1 = !!project.tarea_previa && fase1Pending;

  return (
    <div>
      <BackLink />
      {header}

      {project.tarea_previa && !fase1Pending ? (
        <DisclosureSection title="Tarea previa">
          <div className="space-y-2 text-sm leading-relaxed">
            {splitParagraphs(project.tarea_previa).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </DisclosureSection>
      ) : null}

      <NextStepHero
        status={project.status}
        seEnsenoBien={project.se_enseno_bien}
        isPending={isPending}
        onStart={() => handleStatus("en_ensenanza")}
        onChooseFeedback={handleFeedback}
      />

      {project.status !== "archivado" ? (
        <ProgressStrip
          phases={phases}
          showNext={teaching}
          onSelect={openAndScroll}
        />
      ) : null}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <section className="mb-6">
        <h2 className="mb-3 text-2xl font-bold text-brand-blue">Las {TOTAL_FASES} fases</h2>
        <div className="space-y-3">
          {phases.map((phase, i) => (
            <div key={phase.id} className="space-y-3">
              {i === 0 && showTareaAboveFase1 ? <TareaPreviaCallout text={project.tarea_previa!} /> : null}
              <PhaseSection
                phase={phase}
                isOpen={isPhaseOpen(phase.id)}
                isCurrent={phase.id === currentPhaseId}
                canComplete={teaching && phase.id === currentPhaseId}
                isPending={isPending}
                onToggle={() => togglePhase(phase.id)}
                onComplete={(done) => handlePhaseComplete(phase, done)}
              />
            </div>
          ))}
        </div>
      </section>

      <DisclosureSection title="DBA por grado">
        {targetsByMateria.map((m) => (
          <div key={m.materia_id} className="mb-4">
            <h3 className="mb-2 text-base font-semibold">{m.materia_nombre}</h3>
            <ul className="space-y-3">
              {m.rows.map((r, i) => (
                <li key={`${m.materia_id}-${r.grado}-${i}`} className="text-sm">
                  <GradeBadge grade={r.grado} />
                  <p className="mt-1">
                    DBA #{r.dba_numero} — {r.enunciado}
                  </p>
                  {r.evidencia && m.materia_slug !== "ingles" ? (
                    <p className="mt-1 pl-3 text-xs text-text-secondary">Evidencia: {r.evidencia}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
        {targetsByMateria.length === 0 ? <p className="text-sm text-text-secondary">(sin elementos)</p> : null}
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

      {teaching ? (
        <div className="my-8 no-print">
          <Button variant="ghost" onClick={handleCompleteProject} disabled={isPending} className="w-full">
            Completar proyecto
          </Button>
        </div>
      ) : null}

      {project.status === "completado" && project.se_enseno_bien !== null ? (
        <div className="my-8 no-print">
          <Button variant="ghost" onClick={() => handleStatus("en_ensenanza")} disabled={isPending} className="w-full">
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
// Header (back link, title with kebab, pregunta guía box, meta strip)
// =============================================================================

function BackLink() {
  const router = useRouter();
  return (
    <div className="mb-4 no-print">
      <button
        type="button"
        onClick={() => router.back()}
        className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-brand-blue"
      >
        <ChevronLeft size={16} aria-hidden /> Mis proyectos
      </button>
    </div>
  );
}

function Header({
  project,
  meta,
  onShareImage,
  onDownloadPdf,
  shareState,
  pdfState,
  onArchive,
  onUnarchive,
}: {
  project: ViewProject;
  meta: Meta;
  onShareImage?: () => void;
  onDownloadPdf: () => void;
  shareState: ShareKebabState;
  pdfState: ShareKebabState;
  onArchive: () => void;
  onUnarchive: () => void;
}) {
  return (
    <header className="mb-4">
      <div className="mb-4 h-1 w-12 rounded-full bg-brand-yellow" />
      <div className="mb-3 flex items-start justify-between gap-3">
        <h1 className="text-2xl font-bold leading-tight">{project.titulo}</h1>
        <div className="no-print">
          <KebabMenu
            isArchived={project.status === "archivado"}
            onShareImage={onShareImage}
            onDownloadPdf={onDownloadPdf}
            shareState={shareState}
            pdfState={pdfState}
            onArchive={onArchive}
            onUnarchive={onUnarchive}
          />
        </div>
      </div>
      <QuestionBox eyebrow="Pregunta guía" question={project.pregunta_guia} />
      <MetaRow meta={meta} />
    </header>
  );
}

function MetaRow({ meta }: { meta: Meta }) {
  const materiasLabel = meta.materias.map((m) => m.nombre).join(", ");
  return (
    <p className="mt-2 text-sm text-text-secondary">
      {TOTAL_FASES} fases · {meta.studentCount} estudiante{meta.studentCount === 1 ? "" : "s"} ·{" "}
      {formatGradosList(meta.grados)}
      {materiasLabel ? ` · ${materiasLabel}` : ""}
    </p>
  );
}

// =============================================================================
// Progress strip — 5 circles (28px visual, 44px hit area). While teaching it
// also carries the "Siguiente: Fase N" anchor row (DR1).
// =============================================================================

function ProgressStrip({
  phases,
  showNext,
  onSelect,
}: {
  phases: LoadedPhase[];
  showNext: boolean;
  onSelect: (phase: LoadedPhase) => void;
}) {
  const completedCount = phases.filter((p) => p.completed_at).length;
  const total = phases.length;
  const currentIdx = phases.findIndex((p) => !p.completed_at);
  const next = currentIdx >= 0 ? phases[currentIdx] : null;
  return (
    <section className="mb-6 no-print" aria-label="Progreso del proyecto">
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">Progreso</h2>
        <p className="text-xs text-text-secondary">
          <strong className="text-text-primary">{completedCount}</strong> de {total} fases completada
          {completedCount === 1 ? "" : "s"}
        </p>
      </div>
      <div className="flex items-center">
        {phases.map((p, i) => {
          const done = !!p.completed_at;
          const current = i === currentIdx;
          return (
            <div key={p.id} className="flex flex-1 items-center last:flex-none">
              <button
                type="button"
                onClick={() => onSelect(p)}
                aria-label={`Ir a Fase ${p.orden}: ${p.nombre}${done ? " (completada)" : current ? " (actual)" : ""}`}
                className="flex h-11 w-11 shrink-0 items-center justify-center"
              >
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                    done
                      ? "border-brand-blue bg-brand-blue text-white"
                      : current
                        ? "border-black bg-brand-yellow text-black"
                        : "border-border bg-card-bg text-text-placeholder"
                  }`}
                >
                  {done ? <Check size={14} aria-hidden /> : p.orden}
                </span>
              </button>
              {i < phases.length - 1 ? (
                <div className={`h-1 flex-1 rounded-full ${done ? "bg-brand-blue" : "bg-border"}`} />
              ) : null}
            </div>
          );
        })}
      </div>
      {showNext ? (
        next ? (
          <button
            type="button"
            onClick={() => onSelect(next)}
            className="mt-1 flex min-h-11 w-full items-center justify-between rounded-xl px-1 text-left text-sm font-semibold text-brand-blue"
          >
            <span>
              Siguiente: Fase {next.orden} · {next.nombre}
            </span>
            <ChevronRight size={18} aria-hidden />
          </button>
        ) : (
          <p className="mt-2 text-sm font-semibold text-text-secondary">Todas las fases completadas</p>
        )
      ) : null}
    </section>
  );
}

// =============================================================================
// Next-step hero (status-aware, speech-bubble style)
// Shown for "generado" (start CTA) and "completado" (feedback prompt /
// thank-you). Hidden mid-teaching to keep the in-progress view focused on
// the plan itself.
// =============================================================================

function NextStepHero({
  status,
  seEnsenoBien,
  isPending,
  onStart,
  onChooseFeedback,
}: {
  status: Status;
  seEnsenoBien: boolean | null;
  isPending: boolean;
  onStart: () => void;
  onChooseFeedback: (value: boolean) => void;
}) {
  if (status === "archivado" || status === "en_ensenanza") return null;

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
        className="flex min-h-11 w-full items-center justify-between py-3 text-left no-print"
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
  onShareImage,
  onDownloadPdf,
  shareState,
  pdfState,
  onArchive,
  onUnarchive,
}: {
  isArchived: boolean;
  /** Omitted when the plan has damaged blocks (DR6): the share-image item is hidden. */
  onShareImage?: () => void;
  onDownloadPdf: () => void;
  shareState: ShareKebabState;
  pdfState: ShareKebabState;
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

  const handleArchiveClick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  // For share/pdf, keep the menu open during loading so the user sees the
  // inline state change, but close on terminal states.
  const handleShareClick = () => {
    onShareImage?.();
  };
  const handlePdfClick = () => {
    onDownloadPdf();
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Más opciones"
        className="flex h-11 w-11 items-center justify-center rounded-full text-text-secondary hover:bg-input-bg"
      >
        <MoreVertical size={20} aria-hidden />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-10 mt-1 w-72 rounded-xl border border-border bg-card-bg py-1 shadow-lg"
        >
          {onShareImage ? (
            <ShareMenuItem kind="image" state={shareState} onClick={handleShareClick} />
          ) : null}
          <ShareMenuItem
            kind="pdf"
            state={pdfState}
            onClick={handlePdfClick}
          />
          {isArchived ? (
            <MenuItem
              onClick={handleArchiveClick(onUnarchive)}
              icon={<RotateCcw size={16} />}
            >
              Restaurar proyecto
            </MenuItem>
          ) : (
            <MenuItem
              onClick={handleArchiveClick(onArchive)}
              icon={<Archive size={16} />}
            >
              Archivar proyecto
            </MenuItem>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ShareMenuItem({
  kind,
  state,
  onClick,
}: {
  kind: "image" | "pdf";
  state: ShareKebabState;
  onClick: () => void;
}) {
  const baseLabel = kind === "image" ? "Compartir como imagen" : "Descargar PDF";
  const baseIcon =
    kind === "image" ? <Share2 size={16} /> : <FileDown size={16} />;
  const loadingLabel = kind === "image" ? "Generando…" : "Generando PDF…";
  const successLabel =
    kind === "image" ? "Descargado — adjúntalo en WhatsApp" : "Descargado";

  let icon = baseIcon;
  let label = baseLabel;
  let sublabel: string | null = null;
  let tone: "default" | "success" | "error" | "muted" = "default";
  const isBusy = state === "loading";
  const ariaLive: "polite" | undefined =
    state === "loading" || state === "success" || state === "error" || state === "error_no_phases"
      ? "polite"
      : undefined;

  if (state === "loading") {
    icon = <Loader2 size={16} className="animate-spin" aria-hidden />;
    label = loadingLabel;
    sublabel =
      "Esto puede tardar unos segundos — estamos preparando una versión bonita.";
    tone = "muted";
  } else if (state === "success") {
    icon = <Check size={16} className="text-brand-green" aria-hidden />;
    label = successLabel;
    tone = "success";
  } else if (state === "error_no_phases") {
    icon = <X size={16} className="text-brand-red" aria-hidden />;
    label = "Proyecto sin plan generado — vuelve a generarlo";
    tone = "error";
  } else if (state === "error") {
    icon = <X size={16} className="text-brand-red" aria-hidden />;
    label = "No se pudo generar — reintentar";
    tone = "error";
  }

  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={isBusy}
      aria-busy={isBusy || undefined}
      aria-live={ariaLive}
      className={`flex min-h-11 w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-input-bg disabled:cursor-wait ${
        tone === "error" ? "text-brand-red" : ""
      } ${tone === "success" ? "text-brand-green" : ""}`}
    >
      <span
        className={
          tone === "default" || tone === "muted" ? "mt-0.5 text-text-secondary" : "mt-0.5"
        }
      >
        {icon}
      </span>
      <span className="flex-1">
        <span className={tone === "muted" ? "text-text-secondary" : ""}>
          {label}
        </span>
        {sublabel ? (
          <span className="mt-0.5 block text-[11px] leading-snug text-text-secondary">
            {sublabel}
          </span>
        ) : null}
      </span>
    </button>
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
      className="flex min-h-11 w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-input-bg"
    >
      <span className="text-text-secondary">{icon}</span>
      <span>{children}</span>
    </button>
  );
}
