"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function addStudent(prevState: { error: string } | null, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: school } = await supabase.from("schools").select("id").single();
  if (!school) redirect("/onboarding/school");

  const firstName = formData.get("first_name") as string;
  const grade = Number(formData.get("grade"));

  if (!firstName || !grade) {
    return { error: "Todos los campos son obligatorios." };
  }

  if (grade < 1 || grade > 5) {
    return { error: "El grado debe estar entre 1 y 5." };
  }

  const { error } = await supabase.from("students").insert({
    school_id: school.id,
    first_name: firstName,
    grade,
  });

  if (error) {
    return { error: "No pudimos guardar el estudiante. Intenta de nuevo." };
  }

  revalidatePath("/onboarding/students");
  return null;
}

export async function deleteStudent(studentId: string) {
  const supabase = await createClient();
  await supabase.from("students").delete().eq("id", studentId);
  revalidatePath("/onboarding/students");
}

export async function continueToComplete() {
  redirect("/onboarding/complete");
}
