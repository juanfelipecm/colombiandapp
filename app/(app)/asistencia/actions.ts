"use server";

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { bogotaToday } from "@/lib/asistencia/date";
import type { AttendanceStatus } from "@/lib/asistencia/types";

export type SaveAttendanceState = { error: string } | null;

const VALID_STATUSES: ReadonlySet<string> = new Set(["presente", "ausente", "tardanza"]);
const NOTE_MAX = 1000;

interface ParsedRow {
  student_id: string;
  status: AttendanceStatus;
  justified: boolean;
  note: string | null;
}

function parseFormData(formData: FormData): { rows: ParsedRow[]; error: string | null } {
  // FormData shape (one set of fields per student):
  //   status[<studentId>]    = "presente" | "ausente" | "tardanza"
  //   justified[<studentId>] = "true" | "false" (only when ausente)
  //   note[<studentId>]      = string (only when ausente)
  const rows: ParsedRow[] = [];
  for (const [key, value] of formData.entries()) {
    const match = /^status\[(.+)\]$/.exec(key);
    if (!match) continue;
    const studentId = match[1];
    const status = String(value);
    if (!VALID_STATUSES.has(status)) {
      return { rows: [], error: `Estado inválido para un estudiante.` };
    }
    const justified = formData.get(`justified[${studentId}]`) === "true";
    const noteRaw = formData.get(`note[${studentId}]`);
    const note = typeof noteRaw === "string" && noteRaw.trim().length > 0
      ? noteRaw.trim().slice(0, NOTE_MAX)
      : null;
    if (justified && status !== "ausente") {
      return { rows: [], error: "Solo las ausencias pueden estar justificadas." };
    }
    rows.push({
      student_id: studentId,
      status: status as AttendanceStatus,
      justified,
      note,
    });
  }
  return { rows, error: null };
}

export async function saveAttendance(
  _prevState: SaveAttendanceState,
  formData: FormData,
): Promise<SaveAttendanceState> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: school } = await supabase
    .from("schools")
    .select("id")
    .single();
  if (!school) redirect("/onboarding/school");

  const { rows, error: parseError } = parseFormData(formData);
  if (parseError) return { error: parseError };
  if (rows.length === 0) {
    return { error: "No marcaste a ningún estudiante." };
  }

  // Defense in depth: confirm every studentId belongs to this teacher's school
  // before we hit the upsert. RLS would catch it, but the error UX is better
  // when we name the failure here.
  const studentIds = rows.map((r) => r.student_id);
  const { data: ownedStudents, error: lookupError } = await supabase
    .from("students")
    .select("id")
    .eq("school_id", school.id)
    .in("id", studentIds);
  if (lookupError) {
    return { error: "No pudimos verificar a tus estudiantes. Intenta de nuevo." };
  }
  if ((ownedStudents?.length ?? 0) !== studentIds.length) {
    return { error: "Algunos estudiantes no pertenecen a tu escuela." };
  }

  // Date is server-derived. NEVER trust client-supplied date — a wrong device
  // clock would corrupt data.
  const today = bogotaToday();

  const upsertRows = rows.map((r) => ({
    student_id: r.student_id,
    attendance_date: today,
    status: r.status,
    justified: r.justified,
    note: r.note,
    recorded_by: user.id,
  }));

  const { error: upsertError } = await supabase
    .from("attendance_records")
    .upsert(upsertRows, { onConflict: "student_id,attendance_date" });

  if (upsertError) {
    return { error: "No pudimos guardar la lista. Intenta de nuevo." };
  }

  revalidatePath("/asistencia");
  revalidatePath("/asistencia/hoy");
  revalidatePath("/dashboard");
  return null;
}
