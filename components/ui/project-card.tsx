import Link from "next/link";
import { GradeBadge } from "@/components/ui/badge";
import { TOTAL_FASES, faseProgressLabel } from "@/lib/clase-viva/etapas";

export type ProjectCardData = {
  id: string;
  titulo: string;
  status: "generado" | "en_ensenanza" | "completado" | "archivado";
  created_at: string;
  grados: number[];
  /** Fases with completed_at set (0..5). */
  phasesCompleted: number;
};

const STATUS_LABEL: Record<ProjectCardData["status"], string> = {
  generado: "Por empezar",
  en_ensenanza: "Activo",
  completado: "Completado",
  archivado: "Archivado",
};

const STATUS_STYLES: Record<ProjectCardData["status"], string> = {
  generado: "bg-brand-blue/10 text-brand-blue",
  en_ensenanza: "bg-brand-yellow/20 text-[var(--grade-1-text)]",
  completado: "bg-brand-green/20 text-[var(--grade-5-text)]",
  archivado: "bg-input-bg text-text-placeholder",
};

/** Deep link to the fase the teacher is on (first incomplete), or the page top. */
export function projectHref(id: string, status: ProjectCardData["status"], phasesCompleted: number): string {
  if (status === "en_ensenanza" && phasesCompleted < TOTAL_FASES) {
    return `/proyectos/${id}#fase-${phasesCompleted + 1}`;
  }
  return `/proyectos/${id}`;
}

/** One status line per card (DR7): no chip + fase label saying the same thing. */
export function cardStatusLine(status: ProjectCardData["status"], phasesCompleted: number): string | null {
  if (status === "en_ensenanza") return faseProgressLabel(status, phasesCompleted);
  if (status === "generado") return `${TOTAL_FASES} fases · Listo para empezar`;
  return null;
}

export function ProjectCard({
  project,
  href,
}: {
  project: ProjectCardData;
  href?: string;
}) {
  const target = href ?? projectHref(project.id, project.status, project.phasesCompleted);
  const when = formatRelativeEs(project.created_at);
  const statusLine = cardStatusLine(project.status, project.phasesCompleted);

  return (
    <Link
      href={target}
      className="block rounded-2xl border-[1.5px] border-border bg-card-bg p-3 transition-colors hover:border-brand-blue/40"
    >
      <p className="mb-1 line-clamp-2 text-sm font-semibold leading-snug">{project.titulo}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-secondary">
        <span className="flex flex-wrap gap-0.5">
          {project.grados.map((g) => (
            <GradeBadge key={g} grade={g} className="text-[9px] leading-none" />
          ))}
        </span>
        <span>·</span>
        <span>{when}</span>
      </div>
      {statusLine ? (
        <p className="mt-2 text-xs font-semibold text-text-primary">{statusLine}</p>
      ) : (
        <span
          className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[project.status]}`}
        >
          {STATUS_LABEL[project.status]}
        </span>
      )}
    </Link>
  );
}

function formatRelativeEs(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.round((now - then) / 60_000);
  if (diffMin < 1) return "hace un momento";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  if (diffD === 1) return "hace 1 día";
  if (diffD < 7) return `hace ${diffD} días`;
  const diffW = Math.round(diffD / 7);
  if (diffW === 1) return "hace 1 semana";
  if (diffW < 5) return `hace ${diffW} semanas`;
  const d = new Date(iso);
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}
