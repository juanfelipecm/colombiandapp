import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BottomNav } from "@/components/ui/bottom-nav";
import { ProjectCard, type ProjectCardData } from "@/components/ui/project-card";

type PageProps = {
  searchParams: Promise<{ archivados?: string }>;
};

export default async function ProyectosPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const showArchived = params.archivados === "1";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const query = supabase
    .from("projects")
    .select("id, titulo, duracion_semanas, status, created_at, project_grados(grado)")
    .order("created_at", { ascending: false });

  const { data: projectsRaw } = await (showArchived
    ? query.eq("status", "archivado")
    : query.neq("status", "archivado"));

  type ProjectRow = {
    id: string;
    titulo: string;
    duracion_semanas: number;
    status: string;
    created_at: string;
    project_grados: Array<{ grado: number }>;
  };

  const projects: ProjectCardData[] = ((projectsRaw as ProjectRow[] | null) ?? []).map((p) => ({
    id: p.id,
    titulo: p.titulo,
    duracion_semanas: p.duracion_semanas,
    status: p.status as ProjectCardData["status"],
    created_at: p.created_at,
    grados: (p.project_grados ?? []).map((g) => g.grado).sort((a, b) => a - b),
  }));

  return (
    <div className="relative py-6">
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Mis proyectos</h1>
        <Link
          href={showArchived ? "/proyectos" : "/proyectos?archivados=1"}
          className="text-sm font-medium text-brand-blue"
        >
          {showArchived ? "Activos" : "Ver archivados"}
        </Link>
      </div>

      {projects.length > 0 ? (
        <div className="space-y-2 pb-8">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      ) : (
        <div className="mt-16 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-input-bg">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
            </svg>
          </div>
          <h2 className="mb-1 text-lg font-bold">
            {showArchived ? "Sin proyectos archivados" : "Aún no has creado proyectos"}
          </h2>
          <p className="mb-6 text-sm text-text-secondary">
            {showArchived
              ? "Los proyectos que archives aparecerán aquí."
              : "Empecemos con el primero."}
          </p>
          {!showArchived ? (
            <Link
              href="/proyectos/nuevo"
              className="inline-block rounded-xl bg-brand-blue px-5 py-3 text-sm font-semibold text-white"
            >
              Crear proyecto
            </Link>
          ) : null}
        </div>
      )}

      {/* FAB — only on the active tab, not when viewing archivados */}
      {!showArchived ? (
        <Link
          href="/proyectos/nuevo"
          className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand-yellow text-2xl font-bold text-text-primary shadow-lg"
          aria-label="Nuevo proyecto"
        >
          +
        </Link>
      ) : null}

      <BottomNav />
    </div>
  );
}
