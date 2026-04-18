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

  const update: { status: Status; se_enseno_bien?: null } =
    status === "generado" || status === "en_ensenanza"
      ? { status, se_enseno_bien: null }
      : { status };

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
