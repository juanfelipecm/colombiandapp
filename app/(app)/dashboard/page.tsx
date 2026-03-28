import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { GradeBadge } from "@/components/ui/badge";
import { computeAge } from "@/lib/utils/age";
import { BottomNav } from "@/components/ui/bottom-nav";
import { DashboardActions } from "./actions-client";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: teacher } = await supabase
    .from("teachers")
    .select("first_name, last_name")
    .eq("id", user.id)
    .single();

  const { data: school } = await supabase.from("schools").select("*").single();
  if (!school) redirect("/onboarding/school");

  const { data: students } = await supabase
    .from("students")
    .select("*")
    .eq("school_id", school.id)
    .order("grade", { ascending: true });

  if (!students || students.length === 0) redirect("/onboarding/students");

  const firstName = teacher?.first_name || "";
  const uniqueGrades = [...new Set(students.map((s) => s.grade))].sort();

  // Grade distribution
  const gradeCounts: Record<number, number> = {};
  students.forEach((s) => {
    gradeCounts[s.grade] = (gradeCounts[s.grade] || 0) + 1;
  });

  return (
    <div className="py-6">
      {/* Welcome */}
      <h2 className="text-lg font-bold">Hola, {firstName}!</h2>
      <p className="mb-4 text-sm text-text-secondary">{school.name}, {school.department}</p>

      {/* Primary CTA */}
      <Card highlight className="mb-4">
        <div className="py-4 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-[#fff3d0] text-2xl">
            &#9830;
          </div>
          <h3 className="mb-1 text-lg font-bold">Crea tu primer proyecto</h3>
          <p className="mb-4 text-sm text-text-secondary">
            Disena actividades adaptadas a cada estudiante
          </p>
          <DashboardActions />
        </div>
      </Card>

      {/* Grade distribution */}
      <Card className="mb-4">
        <h3 className="mb-3 text-base font-semibold">Tu escuela en numeros</h3>
        <div className="flex gap-3">
          {uniqueGrades.map((grade) => (
            <div key={grade} className="flex-1 text-center">
              <div className="mb-1 flex justify-center gap-0.5">
                {Array.from({ length: gradeCounts[grade] }).map((_, i) => (
                  <GradeDot key={i} grade={grade} />
                ))}
              </div>
              <p className="text-xs text-text-secondary">{grade}° grado</p>
              <p className="text-xs text-text-placeholder">{gradeCounts[grade]} est.</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Stats */}
      <div className="mb-4 flex gap-3">
        <StatBox value={students.length} label="Estudiantes" color="text-brand-blue" />
        <StatBox value={uniqueGrades.length} label="Grados" color="text-brand-yellow" />
        <StatBox value={0} label="Proyectos" color="text-brand-red" />
      </div>

      {/* Student quick view */}
      <div className="mb-4">
        <h3 className="mb-3 text-base font-semibold">Mis estudiantes</h3>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {students.map((student) => (
            <div key={student.id} className="flex flex-shrink-0 flex-col items-center">
              <StudentAvatar firstName={student.first_name} lastName={student.last_name} grade={student.grade} />
              <p className="mt-1 text-[11px]">{student.first_name}</p>
              <p className="text-[10px] text-text-placeholder">{computeAge(student.birth_date)} anos</p>
            </div>
          ))}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}

function StatBox({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="flex-1 rounded-xl bg-input-bg p-3 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-[11px] text-text-secondary">{label}</p>
    </div>
  );
}

function GradeDot({ grade }: { grade: number }) {
  const colors: Record<number, string> = {
    1: "bg-brand-yellow",
    2: "bg-brand-blue",
    3: "bg-brand-red",
    4: "bg-brand-teal",
    5: "bg-brand-green",
  };
  return <div className={`h-3 w-3 rounded-full ${colors[grade] || "bg-border"}`} />;
}

function StudentAvatar({ firstName, lastName, grade }: { firstName: string; lastName: string; grade: number }) {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();

  const bgColors: Record<number, string> = {
    1: "bg-[var(--grade-1-bg)]",
    2: "bg-[var(--grade-2-bg)]",
    3: "bg-[var(--grade-3-bg)]",
    4: "bg-[var(--grade-4-bg)]",
    5: "bg-[var(--grade-5-bg)]",
  };

  return (
    <div
      className={`flex h-11 w-11 items-center justify-center rounded-full text-[13px] font-semibold text-text-secondary ${
        bgColors[grade] || "bg-border"
      }`}
    >
      {initials}
    </div>
  );
}
