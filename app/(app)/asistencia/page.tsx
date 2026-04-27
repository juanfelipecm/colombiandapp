import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/ui/bottom-nav";
import { LinkButton } from "@/components/ui/button";
import { TakeAttendanceForm } from "./take-attendance-form";
import { bogotaToday } from "@/lib/asistencia/date";
import type { AttendanceStatus } from "@/lib/asistencia/types";

const DAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function formatBogotaHeader(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayName = DAY_NAMES[dt.getUTCDay()];
  const monthName = MONTH_NAMES[dt.getUTCMonth()];
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  return `${cap(dayName)} ${dt.getUTCDate()} de ${monthName}`;
}

export default async function AsistenciaPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: school } = await supabase.from("schools").select("id").single();
  if (!school) redirect("/onboarding/school");

  const { data: students } = await supabase
    .from("students")
    .select("id, first_name, last_name, grade")
    .eq("school_id", school.id);

  const today = bogotaToday();

  // Pre-fill from anything already saved today (partial-resume case).
  const studentList = students ?? [];
  const studentIds = studentList.map((s) => s.id);
  const { data: existingRaw } = studentIds.length
    ? await supabase
        .from("attendance_records")
        .select("student_id, status, justified, note")
        .eq("attendance_date", today)
        .in("student_id", studentIds)
    : { data: [] };

  const existing = (existingRaw ?? []) as Array<{
    student_id: string;
    status: AttendanceStatus;
    justified: boolean;
    note: string | null;
  }>;
  const hasExistingForToday = existing.length > 0;

  if (studentList.length === 0) {
    return (
      <div className="py-6">
        <h1 className="mb-2 text-xl font-bold">Pasemos lista</h1>
        <p className="mb-5 text-sm text-text-secondary">{formatBogotaHeader(today)}</p>
        <div className="rounded-2xl border border-dashed border-border bg-input-bg p-6 text-center">
          <p className="mb-3 text-sm text-text-primary font-semibold">Aún no tienes estudiantes</p>
          <p className="mb-4 text-sm text-text-secondary">
            Agrega estudiantes a tu escuela para empezar a tomar asistencia.
          </p>
          <LinkButton href="/onboarding/students" size="sm">
            Agregar estudiantes
          </LinkButton>
        </div>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="py-6">
      {/* Eyebrow + date H1 (design-review: date is the anchor) */}
      <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
        Pasemos lista
      </p>
      <h1 className="mb-5 text-2xl font-bold">{formatBogotaHeader(today)}</h1>

      <TakeAttendanceForm
        students={studentList}
        existingRecords={existing}
        hasExistingForToday={hasExistingForToday}
      />

      <BottomNav />
    </div>
  );
}
