import Link from "next/link";

export type InFlightGeneration = {
  id: string;
  grados: number[];
  materiaCount: number;
  duracion: number;
  createdAt: string;
};

export function InFlightGenerationCard({ generation }: { generation: InFlightGeneration }) {
  const when = formatRelativeEs(generation.createdAt);
  const gradosLabel =
    generation.grados.length > 0
      ? `Grado${generation.grados.length === 1 ? "" : "s"} ${generation.grados.join(", ")}`
      : "Proyecto";
  const materiasLabel = `${generation.materiaCount} materia${generation.materiaCount === 1 ? "" : "s"}`;
  const duracionLabel = `${generation.duracion} semana${generation.duracion === 1 ? "" : "s"}`;

  return (
    <Link
      href={`/proyectos/generando/${generation.id}`}
      className="flex items-center gap-3 rounded-2xl border-[1.5px] border-brand-blue/40 bg-brand-blue/5 p-3 transition-colors hover:border-brand-blue"
    >
      <span
        aria-hidden
        className="inline-block h-3 w-3 shrink-0 animate-pulse rounded-full bg-brand-blue"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text-primary">Generando proyecto…</p>
        <p className="mt-0.5 truncate text-[11px] text-text-secondary">
          {gradosLabel} · {materiasLabel} · {duracionLabel} · {when}
        </p>
      </div>
      <span className="shrink-0 text-xs font-semibold text-brand-blue">Ver progreso ▶</span>
    </Link>
  );
}

function formatRelativeEs(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.round((now - then) / 1000);
  if (diffSec < 60) return "hace un momento";
  const diffMin = Math.round(diffSec / 60);
  return `hace ${diffMin} min`;
}
