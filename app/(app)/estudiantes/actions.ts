"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

type FormState = { error: string } | null;

function parseFields(formData: FormData) {
  const firstName = (formData.get("first_name") as string | null)?.trim() ?? "";
  const lastName = (formData.get("last_name") as string | null)?.trim() ?? "";
  const birthDate = (formData.get("birth_date") as string | null) ?? "";
  const grade = Number(formData.get("grade"));
  return { firstName, lastName, birthDate, grade };
}

function validate({ firstName, lastName, birthDate, grade }: ReturnType<typeof parseFields>): FormState {
  if (!firstName || !lastName || !birthDate || !grade) {
    return { error: "Todos los campos son obligatorios." };
  }
  if (grade < 1 || grade > 5) {
    return { error: "El grado debe estar entre 1 y 5." };
  }
  return null;
}

export async function addStudent(_prevState: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: school } = await supabase.from("schools").select("id").single();
  if (!school) redirect("/onboarding/school");

  const fields = parseFields(formData);
  const invalid = validate(fields);
  if (invalid) return invalid;

  const { error } = await supabase.from("students").insert({
    school_id: school.id,
    first_name: fields.firstName,
    last_name: fields.lastName,
    birth_date: fields.birthDate,
    grade: fields.grade,
  });

  if (error) {
    return { error: "No pudimos guardar el estudiante. Intenta de nuevo." };
  }

  revalidatePath("/estudiantes");
  return null;
}

export async function updateStudent(_prevState: FormState, formData: FormData): Promise<FormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const id = formData.get("id") as string | null;
  if (!id) return { error: "Estudiante no encontrado." };

  const fields = parseFields(formData);
  const invalid = validate(fields);
  if (invalid) return invalid;

  const { error } = await supabase
    .from("students")
    .update({
      first_name: fields.firstName,
      last_name: fields.lastName,
      birth_date: fields.birthDate,
      grade: fields.grade,
    })
    .eq("id", id);

  if (error) {
    return { error: "No pudimos actualizar el estudiante. Intenta de nuevo." };
  }

  revalidatePath("/estudiantes");
  return null;
}

export async function deleteStudent(studentId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  await supabase.from("students").delete().eq("id", studentId);
  revalidatePath("/estudiantes");
}
