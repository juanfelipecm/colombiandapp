import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/ui/bottom-nav";
import { LinkButton } from "@/components/ui/button";
import { bogotaToday } from "@/lib/asistencia/date";
import {
  bucketForDay,
  monthBoundaries,
  monthOfDate,
  nextMonthIso,
  prevMonth,
  weekdayIndex,
  weekdaysInMonth,
} from "@/lib/asistencia/calendar";
import { AttendanceCalendar, type CalendarCell } from "./calendar";

type PageProps = {
  searchParams: Promise<{ month?: string }>;
};

const MONTH_PARAM_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export default async function AsistenciaPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: school } = await supabase.from("schools").select("id").single();
  if (!school) redirect("/onboarding/school");

  const today = bogotaToday();
  const params = await searchParams;
  const monthIso =
    params.month && MONTH_PARAM_RE.test(params.month) ? params.month : monthOfDate(today);

  const { count: totalStudents } = await supabase
    .from("students")
    .select("id", { count: "exact", head: true })
    .eq("school_id", school.id);

  const { start, end } = monthBoundaries(monthIso);

  // attendance_records has no school_id column, but RLS scopes the query to
  // students belonging to the teacher's school, so a date-bounded select is
  // safe. Still inner-join through students to be explicit.
  const [{ data: recordsRaw }, { count: todayRecordCount }] = await Promise.all([
    supabase
      .from("attendance_records")
      .select("attendance_date, student_id, status, students!inner(school_id)")
      .eq("students.school_id", school.id)
      .gte("attendance_date", start)
      .lte("attendance_date", end),
    // The CTA must reflect today's state regardless of which month is being
    // viewed, so query for today independently of the month-bounded fetch.
    supabase
      .from("attendance_records")
      .select("id, students!inner(school_id)", { count: "exact", head: true })
      .eq("students.school_id", school.id)
      .eq("attendance_date", today),
  ]);

  type RecordRow = {
    attendance_date: string;
    student_id: string;
    status: "presente" | "ausente" | "tardanza";
  };
  const records = (recordsRaw ?? []) as RecordRow[];

  // Per-day distinct students who attended (presente or tardanza).
  const presentByDate = new Map<string, Set<string>>();
  const recordedDates = new Set<string>();
  for (const r of records) {
    recordedDates.add(r.attendance_date);
    if (r.status === "presente" || r.status === "tardanza") {
      let bucket = presentByDate.get(r.attendance_date);
      if (!bucket) {
        bucket = new Set();
        presentByDate.set(r.attendance_date, bucket);
      }
      bucket.add(r.student_id);
    }
  }

  const total = totalStudents ?? 0;
  const cells: CalendarCell[] = weekdaysInMonth(monthIso).map((dateIso) => {
    const presentSet = presentByDate.get(dateIso);
    const presentCount = presentSet ? presentSet.size : 0;
    const hasRecords = recordedDates.has(dateIso);
    const dow = weekdayIndex(dateIso); // 1..5 for weekdays
    return {
      dateIso,
      dayOfMonth: Number(dateIso.slice(8, 10)),
      weekdayCol: dow as 1 | 2 | 3 | 4 | 5,
      presentCount,
      totalStudents: total,
      bucket: bucketForDay(presentCount, total, hasRecords),
    };
  });

  const todayHasRecords = (todayRecordCount ?? 0) > 0;

  return (
    <div className="py-6">
      <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
        Asistencia
      </p>
      <h1 className="mb-5 text-2xl font-bold">Resumen del mes</h1>

      {total === 0 ? (
        <div className="mb-5 rounded-2xl border border-dashed border-border bg-input-bg p-6 text-center">
          <p className="mb-3 text-sm font-semibold">Aún no tienes estudiantes</p>
          <p className="mb-4 text-sm text-text-secondary">
            Agrega estudiantes para empezar a tomar asistencia.
          </p>
          <LinkButton href="/onboarding/students" size="sm">
            Agregar estudiantes
          </LinkButton>
        </div>
      ) : (
        <div className="mb-5">
          <LinkButton
            href="/asistencia/hoy"
            variant={todayHasRecords ? "ghost" : "primary"}
            size="sm"
          >
            {todayHasRecords ? "Ver asistencia de hoy" : "Pasar lista de hoy"}
          </LinkButton>
        </div>
      )}

      <AttendanceCalendar
        monthIso={monthIso}
        todayIso={today}
        cells={cells}
        prevMonthIso={prevMonth(monthIso)}
        nextMonthIso={nextMonthIso(monthIso, today)}
      />

      <BottomNav />
    </div>
  );
}
