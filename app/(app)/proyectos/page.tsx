import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { BottomNav } from "@/components/ui/bottom-nav";
import { ProjectCard, type ProjectCardData } from "@/components/ui/project-card";
import { SegmentedTabs, SegmentedTabLink } from "@/components/ui/segmented-tabs";

type TabKey = "activos" | "por-empezar" | "completados";

const TAB_TO_STATUS: Record<TabKey, ProjectCardData["status"]> = {
  activos: "en_ensenanza",
  "por-empezar": "generado",
  completados: "completado",
};

const TAB_LABEL: Record<TabKey, string> = {
  activos: "Activos",
  "por-empezar": "Por empezar",
  completados: "Completados",
};

const TAB_EMPTY_COPY: Record<TabKey, { title: string; body: string }> = {
  activos: {
    title: "Sin proyectos activos",
    body: "Cuando inicies un proyecto en enseñanza, aparecerá aquí.",
  },
  "por-empezar": {
    title: "Sin proyectos por empezar",
    body: "Crea uno nuevo para tener proyectos listos para enseñar.",
  },
  completados: {
    title: "Sin proyectos completados",
    body: "Los proyectos que termines aparecerán aquí.",
  },
};

const TAB_ORDER: TabKey[] = ["activos", "por-empezar", "completados"];

function parseTab(raw: string | undefined): TabKey {
  return raw === "por-empezar" || raw === "completados" ? raw : "activos";
}

type PageProps = {
  searchParams: Promise<{ archivados?: string; tab?: string }>;
};

export default async function ProyectosPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const showArchived = params.archivados === "1";
  const activeTab = parseTab(params.tab);

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

  const allProjects: ProjectCardData[] = ((projectsRaw as ProjectRow[] | null) ?? []).map((p) => ({
    id: p.id,
    titulo: p.titulo,
    duracion_semanas: p.duracion_semanas,
    status: p.status as ProjectCardData["status"],
    created_at: p.created_at,
    grados: (p.project_grados ?? []).map((g) => g.grado).sort((a, b) => a - b),
  }));

  // Per-tab counts derived from the same query so the tab strip is informative
  // without extra round trips. Counts only matter on the non-archived view.
  const counts: Record<TabKey, number> = {
    activos: 0,
    "por-empezar": 0,
    completados: 0,
  };
  if (!showArchived) {
    for (const p of allProjects) {
      if (p.status === "en_ensenanza") counts.activos++;
      else if (p.status === "generado") counts["por-empezar"]++;
      else if (p.status === "completado") counts.completados++;
    }
  }

  const visibleProjects = showArchived
    ? allProjects
    : allProjects.filter((p) => p.status === TAB_TO_STATUS[activeTab]);

  const emptyCopy = showArchived
    ? {
        title: "Sin proyectos archivados",
        body: "Los proyectos que archives aparecerán aquí.",
      }
    : TAB_EMPTY_COPY[activeTab];

  return (
    <div className="relative py-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Mis proyectos</h1>
        <Link
          href={showArchived ? "/proyectos" : "/proyectos?archivados=1"}
          className="text-sm font-medium text-brand-blue"
        >
          {showArchived ? "Volver" : "Ver archivados"}
        </Link>
      </div>

      {!showArchived ? (
        <div className="mb-4">
          <SegmentedTabs>
            {TAB_ORDER.map((key) => (
              <SegmentedTabLink
                key={key}
                active={key === activeTab}
                label={TAB_LABEL[key]}
                count={counts[key]}
                href={key === "activos" ? "/proyectos" : `/proyectos?tab=${key}`}
              />
            ))}
          </SegmentedTabs>
        </div>
      ) : null}

      {visibleProjects.length > 0 ? (
        <div className="space-y-2 pb-8">
          {visibleProjects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      ) : (
        <div className="mt-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-input-bg">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
            </svg>
          </div>
          <h2 className="mb-1 text-lg font-bold">{emptyCopy.title}</h2>
          <p className="mb-6 text-sm text-text-secondary">{emptyCopy.body}</p>
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

      {/* FAB — only on the active tabs view, not when viewing archivados */}
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
