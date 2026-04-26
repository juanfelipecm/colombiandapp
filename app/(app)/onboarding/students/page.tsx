import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { StudentList } from "./student-list";

export default async function StudentsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: school } = await supabase.from("schools").select("id").single();
  if (!school) redirect("/onboarding/school");

  const { data: students } = await supabase
    .from("students")
    .select("id, first_name, grade")
    .eq("school_id", school.id)
    .order("created_at", { ascending: true });

  return (
    <div>
      <StepIndicator step={2} />
      <h1 className="mb-1 text-2xl font-bold">Tus estudiantes</h1>
      <p className="mb-2 text-sm text-text-secondary">
        Agrega los estudiantes de tu escuela
      </p>
      <p className="mb-6 text-xs text-text-placeholder">
        Los datos de tus estudiantes son privados y solo tu puedes verlos.
      </p>
      <StudentList students={students || []} />
    </div>
  );
}

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="mb-6">
      <p className="mb-2 text-xs font-medium text-text-secondary">Paso {step} de 3</p>
      <div className="flex gap-1.5">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full ${
              s < step ? "bg-brand-yellow" : s === step ? "bg-brand-blue" : "bg-border"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
