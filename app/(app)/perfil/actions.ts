"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function deleteAccount() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Cascade: students -> school -> teacher are handled by ON DELETE CASCADE in the schema.
  // We just need to delete the teacher record and sign out.
  // The FK cascade handles: school deletion cascades to students.
  // Teacher deletion cascades to schools (which cascades to students).
  const { error } = await supabase.from("teachers").delete().eq("id", user.id);

  if (error) {
    return { error: "No pudimos eliminar tu cuenta. Intenta de nuevo." };
  }

  await supabase.auth.signOut();
  redirect("/login");
}
