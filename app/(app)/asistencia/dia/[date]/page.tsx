import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/ui/bottom-nav";
import { LinkButton } from "@/components/ui/button";
import { GradeBadge } from "@/components/ui/badge";
import { bogotaToday } from "@/lib/asistencia/date";
import { monthOfDate } from "@/lib/asistencia/calendar";
import type { AttendanceStatus } from "@/lib/asistencia/types";

const DATE_PARAM_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const DAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const STATUS_LABELS: Record<AttendanceStatus, string> = {
  presente: "Presente",
  tardanza: "Tardanza",
  ausente: "Ausente",
};

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  presente: "bg-[var(--grade-5-bg)] text-[var(--grade-5-text)]",
  tardanza: "bg-[var(--grade-1-bg)] text-[var(--grade-1-text)]",
  ausente: "bg-[var(--grade-3-bg)] text-[var(--grade-3-text)]",
};

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatLongDate(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  return `${d} de ${MONTH_NAMES[m - 1]} de ${y}`;
}

function formatWeekday(dateIso: string): string {
  const [y, m, d] = dateIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return DAY_NAMES[dt.getUTCDay()];
}

type PageProps = {
  params: Promise<{ date: string }>;
};

export default async function DiaPage({ params }: PageProps) {
  const { date } = await params;
  if (!DATE_PARAM_RE.test(date)) notFound();

  const today = bogotaToday();
  if (date > today) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: school } = await supabase.from("schools").select("id").single();
  if (!school) redirect("/onboarding/school");

  const { data: studentsRaw } = await supabase
    .from("students")
    .select("id, first_name, last_name, grade")
    .eq("school_id", school.id);

  type Student = { id: string; first_name: string; last_name: string; grade: number };
  const students = ((studentsRaw ?? []) as Student[]).slice().sort((a, b) =>
    a.grade - b.grade
    || a.last_name.localeCompare(b.last_name, "es")
    || a.first_name.localeCompare(b.first_name, "es"),
  );

  const studentIds = students.map((s) => s.id);
  const { data: recordsRaw } = studentIds.length
    ? await supabase
        .from("attendance_records")
        .select("student_id, status, justified, note")
        .eq("attendance_date", date)
        .in("student_id", studentIds)
    : { data: [] };

  type Record = {
    student_id: string;
    status: AttendanceStatus;
    justified: boolean;
    note: string | null;
  };
  const records = (recordsRaw ?? []) as Record[];
  const recordByStudent = new Map(records.map((r) => [r.student_id, r]));

  const isToday = date === today;
  const hasRecords = records.length > 0;
  const presentCount = records.filter((r) => r.status === "presente" || r.status === "tardanza").length;
  const monthIso = monthOfDate(date);

  return (
    <div className="py-6">
      <Link
        href={`/asistencia?month=${monthIso}`}
        className="mb-3 inline-flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
      >
        <ChevronLeft size={16} aria-hidden />
        Resumen
      </Link>

      <p className="text-xs font-medium uppercase tracking-wide text-text-secondary">
        {isToday ? "Hoy" : cap(formatWeekday(date))}
      </p>
      <h1 className="text-2xl font-bold">{formatLongDate(date)}</h1>

      {hasRecords ? (
        <p className="mb-5 mt-1 text-sm text-text-secondary">
          {presentCount} de {students.length} presentes
        </p>
      ) : (
        <p className="mb-5 mt-1 text-sm text-text-secondary">Sin registro</p>
      )}

      {!hasRecords && isToday && students.length > 0 ? (
        <div className="mb-5">
          <LinkButton href="/asistencia/hoy" size="sm">
            Pasar lista de hoy
          </LinkButton>
        </div>
      ) : null}

      {hasRecords ? (
        <ul className="space-y-2">
          {students.map((s) => {
            const r = recordByStudent.get(s.id);
            return (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <GradeBadge grade={s.grade} />
                  <span className="truncate text-sm font-medium">
                    {s.first_name} {s.last_name}
                  </span>
                </div>
                {r ? (
                  <StatusPill record={r} />
                ) : (
                  <span className="shrink-0 text-xs text-text-placeholder">Sin marcar</span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-input-bg p-6 text-center">
          <p className="text-sm text-text-secondary">
            {isToday ? "Aún no has tomado lista hoy." : "No se tomó asistencia este día."}
          </p>
        </div>
      )}

      <BottomNav />
    </div>
  );
}

function StatusPill({
  record,
}: {
  record: { status: AttendanceStatus; justified: boolean; note: string | null };
}) {
  const showJustified = record.status === "ausente" && record.justified;
  return (
    <span className="flex shrink-0 flex-col items-end gap-0.5">
      <span
        className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_STYLES[record.status]}`}
      >
        {STATUS_LABELS[record.status]}
      </span>
      {showJustified ? (
        <span className="text-[10px] uppercase tracking-wide text-text-secondary">
          Justificada
        </span>
      ) : null}
    </span>
  );
}
