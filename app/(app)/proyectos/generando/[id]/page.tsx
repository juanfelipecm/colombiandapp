import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResumeClient } from "./resume-client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function GenerandoPage({ params }: PageProps) {
  const { id } = await params;

  if (!UUID_RE.test(id)) redirect("/dashboard");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS scopes this to the teacher's own logs.
  const { data: row } = await supabase
    .from("project_generation_logs")
    .select("id, status, project_id")
    .eq("id", id)
    .maybeSingle();

  if (!row) redirect("/dashboard");

  if (row.status === "success" && row.project_id) {
    redirect(`/proyectos/${row.project_id}`);
  }

  if (row.status !== "pending") {
    // Already terminal and failed — nothing to resume. Send back with a hint so
    // the dashboard can surface a gentle error banner if we ever wire one up.
    redirect("/dashboard?gen_failed=1");
  }

  return <ResumeClient generationId={row.id} />;
}
