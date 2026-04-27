"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

type Status = "generado" | "en_ensenanza" | "completado" | "archivado";

export async function setProjectStatus(projectId: string, status: Status) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");

  // Reset feedback only when going back to "not yet started". Going from
  // completado → en_ensenanza ("Volver a enseñar") preserves the prior answer
  // so the teacher's feedback isn't silently lost.
  const update: { status: Status; se_enseno_bien?: null } =
    status === "generado" ? { status, se_enseno_bien: null } : { status };

  const { error } = await supabase
    .from("projects")
    .update(update)
    .eq("id", projectId)
    .eq("teacher_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath(`/proyectos/${projectId}`);
  revalidatePath("/proyectos");
  revalidatePath("/dashboard");
}

export async function setSeEnsenoBien(projectId: string, value: boolean | null) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");

  const { error } = await supabase
    .from("projects")
    .update({ se_enseno_bien: value })
    .eq("id", projectId)
    .eq("teacher_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath(`/proyectos/${projectId}`);
}

export async function setPhaseCompleted(
  projectId: string,
  phaseId: string,
  completed: boolean,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("unauthorized");

  // RLS guarantees the teacher only sees/updates phases of projects they own,
  // but we still scope by project_id for an extra defence-in-depth filter.
  const { error } = await supabase
    .from("project_phases")
    .update({ completed_at: completed ? new Date().toISOString() : null })
    .eq("id", phaseId)
    .eq("project_id", projectId);

  if (error) throw new Error(error.message);
  revalidatePath(`/proyectos/${projectId}`);
}
