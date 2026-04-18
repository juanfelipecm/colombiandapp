import Link from "next/link";
import { GradeBadge } from "@/components/ui/badge";

export type ProjectCardData = {
  id: string;
  titulo: string;
  duracion_semanas: number;
  status: "generado" | "en_ensenanza" | "completado" | "archivado";
  created_at: string;
  grados: number[];
};

const STATUS_LABEL: Record<ProjectCardData["status"], string> = {
  generado: "Generado",
  en_ensenanza: "En enseñanza",
  completado: "Completado",
  archivado: "Archivado",
};

const STATUS_STYLES: Record<ProjectCardData["status"], string> = {
  generado: "bg-brand-blue/10 text-brand-blue",
  en_ensenanza: "bg-brand-yellow/20 text-[var(--grade-1-text)]",
  completado: "bg-brand-green/20 text-[var(--grade-5-text)]",
  archivado: "bg-input-bg text-text-placeholder",
};

export function ProjectCard({
  project,
  href,
}: {
  project: ProjectCardData;
  href?: string;
}) {
  const target = href ?? `/proyectos/${project.id}`;
  const when = formatRelativeEs(project.created_at);

  return (
    <Link
      href={target}
      className="block rounded-2xl border-[1.5px] border-border bg-card-bg p-3 transition-colors hover:border-brand-blue/40"
    >
      <p className="mb-1 line-clamp-2 text-sm font-semibold leading-snug">{project.titulo}</p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-text-secondary">
        <span>
          {project.duracion_semanas} semana
          {project.duracion_semanas === 1 ? "" : "s"}
        </span>
        <span>·</span>
        <span className="flex gap-0.5">
          {project.grados.map((g) => (
            <GradeBadge key={g} grade={g} className="text-[9px] leading-none" />
          ))}
        </span>
        <span>·</span>
        <span>{when}</span>
      </div>
      <span
        className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_STYLES[project.status]}`}
      >
        {STATUS_LABEL[project.status]}
      </span>
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
