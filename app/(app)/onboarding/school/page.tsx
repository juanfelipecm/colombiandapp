import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { SchoolForm } from "./form";

export default async function SchoolPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // If school already exists, skip to students
  const { data: school } = await supabase.from("schools").select("id").single();
  if (school) redirect("/onboarding/students");

  return (
    <div>
      <StepIndicator step={1} />
      <h1 className="mb-1 text-2xl font-bold">Tu escuela</h1>
      <p className="mb-6 text-sm text-text-secondary">
        Cuentanos sobre tu escuela para personalizar tu experiencia
      </p>
      <SchoolForm />
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
