import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BottomNav } from "@/components/ui/bottom-nav";
import { LinkButton } from "@/components/ui/button";
import { GradeBadge } from "@/components/ui/badge";
import { groupResumenRows } from "@/lib/asistencia/group";
import type { SummaryRow } from "@/lib/asistencia/types";
import { bogotaToday } from "@/lib/asistencia/date";

export default async function ResumenPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: school } = await supabase.from("schools").select("id").single();
  if (!school) redirect("/onboarding/school");

  const { data: rowsRaw } = await supabase
    .from("student_attendance_summary")
    .select("*")
    .eq("school_id", school.id);

  const rows = (rowsRaw ?? []) as SummaryRow[];
  const buckets = groupResumenRows(rows);

  const totalStudents = rows.length;
  const today = bogotaToday();

  if (totalStudents === 0) {
    return (
      <div className="py-6">
        <h1 className="mb-2 text-xl font-bold">Resumen de asistencia</h1>
        <p className="mb-5 text-sm text-text-secondary">Últimos 30 días</p>
        <div className="rounded-2xl border border-dashed border-border bg-input-bg p-6 text-center">
          <p className="mb-3 text-sm font-semibold">Aún no tienes estudiantes</p>
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
      <h1 className="mb-1 text-xl font-bold">Resumen de asistencia</h1>
      <p className="mb-5 text-sm text-text-secondary">Últimos 30 días</p>

      <BucketSection title="Con ausencias" rows={buckets.con_ausencias} kind="con" today={today} />
      <BucketSection title="Sin ausencias" rows={buckets.sin_ausencias} kind="sin_ausencias" today={today} />
      <BucketSection title="Sin datos" rows={buckets.sin_datos} kind="sin_datos" today={today} />

      <BottomNav />
    </div>
  );
}

interface BucketSectionProps {
  title: string;
  rows: SummaryRow[];
  kind: "con" | "sin_ausencias" | "sin_datos";
  today: string;
}

function BucketSection({ title, rows, kind, today }: BucketSectionProps) {
  if (rows.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold text-text-secondary">
        {title} <span className="font-normal">({rows.length})</span>
      </h2>
      <div>
        {rows.map((r) => (
          <ResumenRow key={r.student_id} row={r} kind={kind} today={today} />
        ))}
      </div>
    </section>
  );
}

interface RowProps {
  row: SummaryRow;
  kind: "con" | "sin_ausencias" | "sin_datos";
  today: string;
}

// Static class names — Tailwind v4 can't extract dynamic interpolations.
const GRADE_BG: Record<number, string> = {
  1: "bg-[var(--grade-1-bg)]",
  2: "bg-[var(--grade-2-bg)]",
  3: "bg-[var(--grade-3-bg)]",
  4: "bg-[var(--grade-4-bg)]",
  5: "bg-[var(--grade-5-bg)]",
};

const GRADE_TEXT: Record<number, string> = {
  1: "text-[var(--grade-1-text)]",
  2: "text-[var(--grade-2-text)]",
  3: "text-[var(--grade-3-text)]",
  4: "text-[var(--grade-4-text)]",
  5: "text-[var(--grade-5-text)]",
};

function ResumenRow({ row, kind, today }: RowProps) {
  const initials = `${row.first_name.charAt(0)}${row.last_name.charAt(0)}`.toUpperCase();
  const bgClass = GRADE_BG[row.grade] ?? "bg-input-bg";
  const textClass = GRADE_TEXT[row.grade] ?? "text-text-primary";

  // "Recién agregado" copy when the student was created today and has no
  // attendance yet — better than a generic "Sin datos."
  const createdToday = row.student_created_at?.slice(0, 10) === today;

  return (
    <div className="flex items-center gap-3 border-b border-border py-3">
      <div className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold ${bgClass} ${textClass}`}>
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <p className="truncate text-[15px] font-semibold">
            {row.first_name} {row.last_name}
          </p>
          <GradeBadge grade={row.grade} />
        </div>
        {kind === "con" && (
          <>
            <p className="text-xs text-text-secondary">
              {row.absences_30} ausencia{row.absences_30 === 1 ? "" : "s"} · {row.days_marked_30} día{row.days_marked_30 === 1 ? "" : "s"} registrado{row.days_marked_30 === 1 ? "" : "s"}
            </p>
            <AbsenceBar absences={row.absences_30} marked={row.days_marked_30} />
          </>
        )}
        {kind === "sin_ausencias" && (
          <p className="text-xs text-text-secondary">
            Sin ausencias · {row.days_marked_30} día{row.days_marked_30 === 1 ? "" : "s"} registrado{row.days_marked_30 === 1 ? "" : "s"}
          </p>
        )}
        {kind === "sin_datos" && (
          <p className="text-xs text-text-placeholder">
            {createdToday
              ? `Recién agregado · marca su asistencia`
              : `Aún no se ha tomado asistencia para ${row.first_name}`}
          </p>
        )}
      </div>
    </div>
  );
}

function AbsenceBar({ absences, marked }: { absences: number; marked: number }) {
  const pct = marked === 0 ? 0 : Math.round((absences / marked) * 100);
  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-input-bg">
        <div
          className="h-full bg-brand-yellow"
          style={{ width: `${Math.min(100, pct)}%` }}
          aria-hidden
        />
      </div>
      <span className="text-xs font-semibold text-text-secondary">{pct}%</span>
    </div>
  );
}
