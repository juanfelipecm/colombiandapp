import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { BottomNav } from "@/components/ui/bottom-nav";
import { type ProjectCardData } from "@/components/ui/project-card";
import { DashboardActions } from "./actions-client";
import { InFlightGenerationCard, type InFlightGeneration } from "./in-flight-card";
import { RecentProjectsClient } from "./recent-projects-client";

const IN_FLIGHT_WINDOW_MS = 10 * 60 * 1000;

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: teacher } = await supabase
    .from("teachers")
    .select("first_name")
    .eq("id", user.id)
    .single();

  const { data: school } = await supabase.from("schools").select("*").single();
  if (!school) redirect("/onboarding/school");

  const { data: students } = await supabase
    .from("students")
    .select("id, grade")
    .eq("school_id", school.id);

  const hasStudents = (students?.length ?? 0) > 0;

  // Project counts + 3 most recent non-archived
  const { count: projectCount } = await supabase
    .from("projects")
    .select("*", { head: true, count: "exact" })
    .neq("status", "archivado");

  const { data: recentProjectsRaw } = await supabase
    .from("projects")
    .select(
      "id, titulo, duracion_semanas, status, created_at, project_grados(grado)",
    )
    .neq("status", "archivado")
    .order("created_at", { ascending: false })
    .limit(3);

  type ProjectRow = {
    id: string;
    titulo: string;
    duracion_semanas: number;
    status: string;
    created_at: string;
    project_grados: Array<{ grado: number }>;
  };

  const recentProjects: ProjectCardData[] = ((recentProjectsRaw as ProjectRow[] | null) ?? []).map(
    (p) => ({
      id: p.id,
      titulo: p.titulo,
      duracion_semanas: p.duracion_semanas,
      status: p.status as ProjectCardData["status"],
      created_at: p.created_at,
      grados: (p.project_grados ?? [])
        .map((g) => g.grado)
        .sort((a, b) => a - b),
    }),
  );

  // Pending generations from the last 10 minutes. After that we assume the
  // server died mid-after() and stop surfacing them as "en curso" — the row
  // stays as-is for audit, but the teacher isn't left staring at a ghost.
  // eslint-disable-next-line react-hooks/purity -- wall-clock cutoff is the whole point
  const sinceIso = new Date(Date.now() - IN_FLIGHT_WINDOW_MS).toISOString();
  const { data: inFlightRaw } = await supabase
    .from("project_generation_logs")
    .select("id, inputs_jsonb, created_at")
    .eq("status", "pending")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false });

  type InFlightRow = {
    id: string;
    inputs_jsonb: {
      grados?: number[];
      materia_ids?: string[];
      duracion_semanas?: number;
    } | null;
    created_at: string;
  };

  const inFlight: InFlightGeneration[] = ((inFlightRaw as InFlightRow[] | null) ?? []).map((r) => ({
    id: r.id,
    grados: (r.inputs_jsonb?.grados ?? []).slice().sort((a, b) => a - b),
    materiaCount: r.inputs_jsonb?.materia_ids?.length ?? 0,
    duracion: r.inputs_jsonb?.duracion_semanas ?? 1,
    createdAt: r.created_at,
  }));

  const firstName = teacher?.first_name || "";
  const uniqueGrades = hasStudents ? [...new Set(students!.map((s) => s.grade))].sort() : [];
  const studentCount = students?.length ?? 0;

  return (
    <div className="py-6">
      {/* Warm greeting */}
      <h1 className="text-xl font-bold">Hola, {firstName}.</h1>
      <p className="mb-5 text-sm text-text-secondary">
        {school.name}, {school.department}
      </p>

      {/* In-flight generations — shown first so an in-progress project is the
          most obvious thing to pick up. */}
      {inFlight.length > 0 ? (
        <section className="mb-5 space-y-2">
          {inFlight.map((g) => (
            <InFlightGenerationCard key={g.id} generation={g} />
          ))}
        </section>
      ) : null}

      {/* Primary CTA */}
      {hasStudents ? (
        <Card highlight className="mb-5">
          <div className="py-2 text-center">
            <h2 className="mb-1 text-lg font-bold">¿Creamos un proyecto para esta semana?</h2>
            <p className="mb-4 text-sm text-text-secondary">
              Diseñamos actividades adaptadas a cada grado.
            </p>
            <DashboardActions />
          </div>
        </Card>
      ) : (
        <Card className="mb-5">
          <div className="py-2 text-center">
            <h2 className="mb-1 text-lg font-bold">Antes de crear proyectos…</h2>
            <p className="mb-4 text-sm text-text-secondary">
              Agreguemos a tus estudiantes.
            </p>
            <Link
              href="/onboarding/students"
              className="inline-block rounded-xl bg-brand-blue px-5 py-3 text-sm font-semibold text-white"
            >
              Agregar estudiantes
            </Link>
          </div>
        </Card>
      )}

      {/* One-line stats — replaces the earlier 3-card row per design review Issue 4B */}
      {hasStudents ? (
        <p className="mb-6 text-sm text-text-secondary">
          <strong className="text-text-primary">{studentCount}</strong> estudiante
          {studentCount === 1 ? "" : "s"} ·{" "}
          <strong className="text-text-primary">{uniqueGrades.length}</strong> grado
          {uniqueGrades.length === 1 ? "" : "s"} ·{" "}
          <strong className="text-text-primary">{projectCount ?? 0}</strong> proyecto
          {(projectCount ?? 0) === 1 ? "" : "s"}
        </p>
      ) : null}

      {/* Mis proyectos — 3 most recent */}
      {hasStudents ? (
        <section className="mb-6">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-base font-semibold">Mis proyectos</h2>
            {(projectCount ?? 0) > 3 ? (
              <Link href="/proyectos" className="text-xs font-medium text-brand-blue">
                Ver todos
              </Link>
            ) : null}
          </div>
          {recentProjects.length > 0 ? (
            <RecentProjectsClient projects={recentProjects} />
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-input-bg p-5 text-center">
              <p className="text-sm text-text-secondary">
                Aún no has creado proyectos. Empecemos con el primero.
              </p>
            </div>
          )}
        </section>
      ) : null}

      <BottomNav />
    </div>
  );
}
