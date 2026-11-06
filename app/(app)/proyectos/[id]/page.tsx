import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadProjectPlan } from "@/lib/projects/load-project";
import { ProjectView } from "./project-view";

type PageProps = {
  params: Promise<{ id: string }>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ProjectPage({ params }: PageProps) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS gates this to the owning teacher. Cross-teacher lookup returns null.
  const plan = await loadProjectPlan(supabase, id);
  if (!plan) notFound();

  return (
    <ProjectView
      project={{
        id: plan.project.id,
        titulo: plan.project.titulo,
        pregunta_guia: plan.project.pregunta_guia,
        tarea_previa: plan.project.tarea_previa,
        status: plan.project.status,
        se_enseno_bien: plan.project.se_enseno_bien,
      }}
      meta={{
        grados: plan.grados,
        materias: plan.materias.map(({ id: mid, slug, nombre }) => ({ id: mid, slug, nombre })),
        studentCount: plan.studentCount,
      }}
      targetsByMateria={plan.targetsByMateria}
      phases={plan.phases}
      materiales={plan.materiales}
      invalidoCount={plan.invalidoCount}
    />
  );
}
