"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function createSchool(prevState: { error: string } | null, formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const name = formData.get("name") as string;
  const department = formData.get("department") as string;
  const municipality = formData.get("municipality") as string;
  const vereda = formData.get("vereda") as string;
  const gradesRaw = formData.getAll("grades") as string[];
  const grades = gradesRaw.map(Number).filter((n) => n >= 1 && n <= 5);

  if (!name || !department || !municipality) {
    return { error: "Nombre, departamento y municipio son obligatorios." };
  }

  if (grades.length === 0) {
    return { error: "Selecciona al menos un grado." };
  }

  const { error } = await supabase.from("schools").insert({
    teacher_id: user.id,
    name,
    department,
    municipality,
    vereda: vereda || null,
    grades,
  });

  if (error) {
    if (error.code === "23505") {
      // Duplicate — school already exists, just redirect
      redirect("/onboarding/students");
    }
    return { error: "No pudimos guardar tu escuela. Intenta de nuevo." };
  }

  redirect("/onboarding/students");
}
