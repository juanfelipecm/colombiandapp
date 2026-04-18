import type { SupabaseClient } from "@supabase/supabase-js";

/** Hard daily cap on successful generations per teacher. */
export const DAILY_CAP_SUCCESS = 5;

/** Max materias selectable per project in v1. */
export const MAX_MATERIAS = 3;

/** Total-token monthly budget across all teachers. Defaults to 5M unless overridden. */
export function getMonthlyTokenBudget(): number {
  const raw = process.env.PBL_MONTHLY_TOKEN_BUDGET;
  if (!raw) return 5_000_000;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 5_000_000;
  return parsed;
}

export function isKillSwitchOn(): boolean {
  return process.env.PBL_KILL_SWITCH === "true";
}

export type GateResult =
  | { ok: true }
  | { ok: false; status: 400 | 403 | 429 | 503; code: string; message: string };

/** Kill switch (503). */
export function checkKillSwitch(): GateResult {
  if (isKillSwitchOn()) {
    return {
      ok: false,
      status: 503,
      code: "kill_switch",
      message: "Estamos haciendo mantenimiento. Intenta más tarde.",
    };
  }
  return { ok: true };
}

/** Monthly spend budget (503). */
export async function checkMonthlyBudget(admin: SupabaseClient): Promise<GateResult> {
  const budget = getMonthlyTokenBudget();
  // Sum (tokens_input + tokens_output) for success rows in the current calendar month.
  const firstOfMonth = new Date();
  firstOfMonth.setUTCDate(1);
  firstOfMonth.setUTCHours(0, 0, 0, 0);

  const { data, error } = await admin
    .from("project_generation_logs")
    .select("tokens_input, tokens_output")
    .eq("status", "success")
    .gte("created_at", firstOfMonth.toISOString());

  if (error) {
    // Fail-open on budget-read errors — better than blocking the feature on a transient query issue.
    return { ok: true };
  }

  const total = (data ?? []).reduce(
    (sum, row) => sum + (row.tokens_input ?? 0) + (row.tokens_output ?? 0),
    0,
  );
  if (total >= budget) {
    return {
      ok: false,
      status: 503,
      code: "monthly_budget_exhausted",
      message: "Estamos haciendo mantenimiento. Intenta más tarde.",
    };
  }
  return { ok: true };
}

/** Per-teacher daily cap on DISTINCT successful idempotency_keys (429). */
export async function checkDailyCap(admin: SupabaseClient, teacherId: string): Promise<GateResult> {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const { data, error } = await admin
    .from("project_generation_logs")
    .select("idempotency_key")
    .eq("teacher_id", teacherId)
    .eq("status", "success")
    .gte("created_at", startOfDay.toISOString());

  if (error) {
    return { ok: true }; // fail-open on a transient read
  }

  const distinctKeys = new Set((data ?? []).map((r) => r.idempotency_key));
  if (distinctKeys.size >= DAILY_CAP_SUCCESS) {
    return {
      ok: false,
      status: 429,
      code: "daily_cap_reached",
      message: "Has alcanzado tu límite diario de proyectos. Vuelve mañana.",
    };
  }
  return { ok: true };
}

export type WizardInputsRaw = {
  grados: unknown;
  materia_ids: unknown;
  student_ids: unknown;
  duracion_semanas: unknown;
  tema_contexto: unknown;
};

export type ValidatedInputs = {
  grados: number[];
  materia_ids: string[];
  student_ids: string[];
  duracion_semanas: 1 | 2;
  tema_contexto: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Pure input-shape validator. Does NOT check DB ownership. */
export function assertInputs(body: unknown): ValidatedInputs | { error: string } {
  if (!body || typeof body !== "object") return { error: "Body must be a JSON object" };
  const raw = body as WizardInputsRaw;

  if (!Array.isArray(raw.grados)) return { error: "grados must be an array" };
  const grados = raw.grados.map(Number);
  if (grados.length === 0) return { error: "grados must be non-empty" };
  if (grados.length > 6) return { error: "grados must have at most 6 entries" };
  if (!grados.every((g) => Number.isInteger(g) && g >= 0 && g <= 5)) {
    return { error: "Each grado must be an integer 0-5" };
  }

  if (!Array.isArray(raw.materia_ids)) return { error: "materia_ids must be an array" };
  const materia_ids = raw.materia_ids.map(String);
  if (materia_ids.length === 0) return { error: "materia_ids must be non-empty" };
  if (materia_ids.length > MAX_MATERIAS) {
    return { error: `materia_ids exceeds v1 cap of ${MAX_MATERIAS}` };
  }
  if (!materia_ids.every((m) => UUID_RE.test(m))) return { error: "Each materia_id must be a UUID" };

  if (!Array.isArray(raw.student_ids)) return { error: "student_ids must be an array" };
  const student_ids = raw.student_ids.map(String);
  if (student_ids.length === 0) return { error: "student_ids must be non-empty" };
  if (!student_ids.every((s) => UUID_RE.test(s))) return { error: "Each student_id must be a UUID" };

  const duracion = Number(raw.duracion_semanas);
  if (duracion !== 1 && duracion !== 2) return { error: "duracion_semanas must be 1 or 2" };

  let tema: string | null = null;
  if (raw.tema_contexto !== undefined && raw.tema_contexto !== null) {
    if (typeof raw.tema_contexto !== "string") {
      return { error: "tema_contexto must be a string" };
    }
    const trimmed = raw.tema_contexto.trim();
    if (trimmed.length > 0) {
      if (trimmed.length > 500) return { error: "tema_contexto exceeds 500 chars" };
      tema = trimmed;
    }
  }

  return {
    grados: [...new Set(grados)].sort((a, b) => a - b),
    materia_ids: [...new Set(materia_ids)],
    student_ids: [...new Set(student_ids)],
    duracion_semanas: duracion as 1 | 2,
    tema_contexto: tema,
  };
}

/**
 * Verify every submitted student belongs to the teacher's school AND is in a selected grade.
 * Returns resolved student rows or an error.
 */
export async function verifyStudentsOwnedByTeacher(
  admin: SupabaseClient,
  teacherId: string,
  studentIds: string[],
  grados: number[],
): Promise<
  | { ok: true; studentCountsByGrade: Record<number, number> }
  | { ok: false; status: 400 | 404; code: string; message: string }
> {
  // Find the teacher's school
  const { data: schoolRow, error: schoolErr } = await admin
    .from("schools")
    .select("id")
    .eq("teacher_id", teacherId)
    .maybeSingle();

  if (schoolErr) {
    return { ok: false, status: 400, code: "school_lookup_failed", message: schoolErr.message };
  }
  if (!schoolRow) {
    return {
      ok: false,
      status: 404,
      code: "no_school",
      message: "Agrega tu escuela antes de crear proyectos.",
    };
  }

  const { data: students, error: studentsErr } = await admin
    .from("students")
    .select("id, grade")
    .in("id", studentIds)
    .eq("school_id", schoolRow.id);

  if (studentsErr) {
    return { ok: false, status: 400, code: "students_lookup_failed", message: studentsErr.message };
  }

  if (!students || students.length !== studentIds.length) {
    return {
      ok: false,
      status: 400,
      code: "students_not_owned",
      message: "Algunos estudiantes no pertenecen a tu aula.",
    };
  }

  const gradoSet = new Set(grados);
  const wrongGrade = students.filter((s) => !gradoSet.has(s.grade));
  if (wrongGrade.length > 0) {
    return {
      ok: false,
      status: 400,
      code: "students_wrong_grade",
      message: "Algunos estudiantes están en un grado no seleccionado.",
    };
  }

  const counts: Record<number, number> = {};
  for (const s of students) counts[s.grade] = (counts[s.grade] ?? 0) + 1;

  return { ok: true, studentCountsByGrade: counts };
}

export async function resolveSchoolId(
  admin: SupabaseClient,
  teacherId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("schools")
    .select("id")
    .eq("teacher_id", teacherId)
    .maybeSingle();
  return data?.id ?? null;
}
