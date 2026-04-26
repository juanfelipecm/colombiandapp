import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/ui/bottom-nav";
import { StudentsManager, type Student } from "./students-manager";

export default async function EstudiantesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: studentsRaw } = await supabase
    .from("students")
    .select("id, first_name, last_name, birth_date, grade")
    .order("grade", { ascending: true })
    .order("last_name", { ascending: true });

  const students: Student[] = studentsRaw ?? [];

  return (
    <div className="relative py-6">
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Mis estudiantes</h1>
        {students.length > 0 && (
          <span className="text-sm text-text-secondary">
            {students.length} {students.length === 1 ? "estudiante" : "estudiantes"}
          </span>
        )}
      </div>

      <StudentsManager students={students} />

      <BottomNav />
    </div>
  );
}
