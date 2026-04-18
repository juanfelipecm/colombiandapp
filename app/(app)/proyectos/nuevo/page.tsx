import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { WizardClient } from "./wizard-client";

export default async function WizardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: school } = await supabase.from("schools").select("id").single();
  if (!school) redirect("/onboarding/school");

  const { data: students } = await supabase
    .from("students")
    .select("id, first_name, last_name, grade")
    .eq("school_id", school.id)
    .order("grade", { ascending: true })
    .order("first_name", { ascending: true });

  if (!students || students.length === 0) redirect("/onboarding/students");

  const { data: materias } = await supabase
    .from("materias")
    .select("id, slug, nombre, orden")
    .order("orden", { ascending: true });

  return (
    <div className="py-6">
      <WizardClient students={students} materias={materias ?? []} />
    </div>
  );
}
