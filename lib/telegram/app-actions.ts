import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { bogotaToday } from "@/lib/asistencia/date";
import type { AttendanceStatus } from "@/lib/asistencia/types";
import {
  checkDailyCap,
  checkKillSwitch,
  checkMonthlyBudget,
  resolveSchoolId,
  verifyStudentsOwnedByTeacher,
} from "@/lib/api/pbl-gate";
import { PROMPT_MODEL, PROMPT_VERSION } from "@/lib/ai/plan-schema";
import { runProjectGeneration } from "@/lib/api/project-generation-runner";

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string | null;
  grade: number;
};

type MateriaRow = {
  id: string;
  slug: string;
  nombre: string;
  orden: number;
};

type ProjectStudentRow = {
  id: string;
  grade: number;
};

const EXAMPLE_STUDENT_FIRST_NAMES = [
  "Ana",
  "Luis",
  "Marta",
  "Carlos",
  "Sofia",
  "Diego",
  "Lina",
  "Mateo",
  "Sara",
  "Juan",
];

export function appBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

export async function createTeacherFromTelegram(firstName: string, lastName: string): Promise<{ teacherId: string } | null> {
  const admin = createAdminClient();
  const fakeEmail = `tg-${randomUUID().slice(0, 8)}@telegram.local`;
  const fakePassword = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({
    email: fakeEmail,
    password: fakePassword,
    email_confirm: true,
  });
  if (error || !data.user) {
    console.error("[telegram] createUser failed", error);
    return null;
  }
  const teacherId = data.user.id;
  const { error: profileError } = await admin
    .from("teachers")
    .insert({ id: teacherId, first_name: firstName, last_name: lastName });
  if (profileError) {
    console.error("[telegram] insert teacher failed", profileError);
    return null;
  }
  // Auto-create a school so the teacher can use all features immediately
  const { error: schoolError } = await admin
    .from("schools")
    .insert({
      teacher_id: teacherId,
      name: `Aula de ${firstName}`,
      department: "Por definir",
      municipality: "Por definir",
      grades: [3],
    });
  if (schoolError) {
    console.error("[telegram] insert school failed", schoolError);
    // Non-fatal — teacher exists, school can be added later
  }
  return { teacherId };
}

export async function resetTelegramUser(teacherId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(teacherId);
  if (error) {
    console.error("[telegram] deleteUser failed", error);
    return false;
  }
  return true;
}

export async function teacherExists(teacherId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin.from("teachers").select("id").eq("id", teacherId).maybeSingle();
  return Boolean(data);
}

export async function buildTeacherSummary(teacherId: string): Promise<string> {
  const admin = createAdminClient();
  const [{ data: teacher }, { data: school }, { data: projects }] = await Promise.all([
    admin.from("teachers").select("first_name, last_name").eq("id", teacherId).maybeSingle(),
    admin.from("schools").select("id, name, department, municipality").eq("teacher_id", teacherId).maybeSingle(),
    admin
      .from("projects")
      .select("id, titulo, status, created_at")
      .eq("teacher_id", teacherId)
      .neq("status", "archivado")
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  if (!teacher) return "No encuentro tu perfil de docente.";
  if (!school) return `Hola ${teacher.first_name}. Tu aula a\u00fan no tiene estudiantes. Env\u00eda /asistencia para empezar.`;

  const { data: students } = await admin
    .from("students")
    .select("id, grade")
    .eq("school_id", school.id);
  const studentIds = (students ?? []).map((s) => s.id);
  let attendanceLine = "Sin estudiantes para tomar asistencia.";
  if (studentIds.length > 0) {
    const { count } = await admin
      .from("attendance_records")
      .select("*", { head: true, count: "exact" })
      .eq("attendance_date", bogotaToday())
      .in("student_id", studentIds);
    attendanceLine = (count ?? 0) > 0 ? "Asistencia de hoy: tomada." : "Asistencia de hoy: pendiente.";
  }

  const grades = [...new Set((students ?? []).map((s) => s.grade))].sort((a, b) => a - b);
  const projectLines = (projects ?? []).length
    ? (projects ?? []).map((p) => `- ${p.titulo} (${statusLabel(p.status)})`).join("\n")
    : "- Aún no hay proyectos.";

  return [
    `Hola ${teacher.first_name}.`,
    `${school.name}, ${school.municipality}.`,
    `${students?.length ?? 0} estudiantes · ${grades.length} grados${grades.length ? ` (${grades.join(", ")})` : ""}.`,
    attendanceLine,
    "",
    "Proyectos recientes:",
    projectLines,
  ].join("\n");
}

export async function listMaterias(): Promise<MateriaRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("materias")
    .select("id, slug, nombre, orden")
    .order("orden", { ascending: true });
  return (data ?? []) as MateriaRow[];
}

export async function formatMateriaPrompt(): Promise<string> {
  const materias = await listMaterias();
  const options = materias.map((m, index) => `${index + 1}. ${m.nombre}`).join("\n");
  return `¿Qué materias quieres integrar? Responde con números o nombres, hasta 3.\n\n${options}\n\nEjemplo: 1, 3`;
}

export async function parseMateriaSelection(text: string): Promise<
  | { ok: true; materiaIds: string[]; labels: string[] }
  | { ok: false; message: string }
> {
  const materias = await listMaterias();
  const normalized = normalize(text);
  const selected = new Map<string, string>();

  for (const token of normalized.split(/[\s,;]+/).filter(Boolean)) {
    const maybeIndex = Number(token);
    if (Number.isInteger(maybeIndex) && maybeIndex >= 1 && maybeIndex <= materias.length) {
      const m = materias[maybeIndex - 1];
      selected.set(m.id, m.nombre);
    }
  }

  for (const m of materias) {
    if (normalized.includes(normalize(m.nombre)) || normalized.includes(normalize(m.slug))) {
      selected.set(m.id, m.nombre);
    }
  }

  if (selected.size === 0) return { ok: false, message: "No reconocí esas materias. Responde, por ejemplo: 1, 3" };
  if (selected.size > 3) return { ok: false, message: "Por ahora máximo 3 materias. Responde de nuevo con hasta 3." };
  return { ok: true, materiaIds: [...selected.keys()], labels: [...selected.values()] };
}

export async function saveAttendanceFromTelegram(
  teacherId: string,
  text: string,
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const admin = createAdminClient();
  const { school, students } = await loadSchoolAndStudents(teacherId);
  if (!school) return { ok: false, message: "Primero agrega estudiantes con /asistencia." };
  if (students.length === 0) return { ok: false, message: "No tienes estudiantes registrados todavía." };

  const parsed = parseAttendanceText(text, students);
  if (!parsed.ok) return parsed;

  const today = bogotaToday();
  const rows = students.map((student) => {
    const status = parsed.statusById.get(student.id) ?? "presente";
    return {
      student_id: student.id,
      attendance_date: today,
      status,
      justified: false,
      note: null,
      recorded_by: teacherId,
    };
  });

  const { error } = await admin
    .from("attendance_records")
    .upsert(rows, { onConflict: "student_id,attendance_date" });
  if (error) return { ok: false, message: "No pude guardar la asistencia. Intenta de nuevo." };

  const counts = countStatuses(rows.map((r) => r.status as AttendanceStatus));
  return {
    ok: true,
    message: `Asistencia guardada para ${today}: ${counts.presente} presentes, ${counts.ausente} ausentes, ${counts.tardanza} tarde.`,
  };
}

export async function startTelegramProjectGeneration(args: {
  teacherId: string;
  materiaIds: string[];
  duracionSemanas: 1 | 2;
  temaContexto: string | null;
}): Promise<
  | { ok: true; generationId: string; projectId?: string }
  | { ok: false; message: string }
> {
  const admin = createAdminClient();
  const killSwitch = checkKillSwitch();
  if (!killSwitch.ok) return { ok: false, message: killSwitch.message };
  const budget = await checkMonthlyBudget(admin);
  if (!budget.ok) return { ok: false, message: budget.message };
  const cap = await checkDailyCap(admin, args.teacherId);
  if (!cap.ok) return { ok: false, message: cap.message };

  const schoolId = await resolveSchoolId(admin, args.teacherId);
  if (!schoolId) return { ok: false, message: "Primero agrega estudiantes con /asistencia." };

  const { data: students } = await admin
    .from("students")
    .select("id, grade")
    .eq("school_id", schoolId);
  let projectStudents: ProjectStudentRow[] = (students ?? []) as ProjectStudentRow[];
  if (projectStudents.length === 0) {
    projectStudents = await createExampleStudentsForProject(admin, args.teacherId, schoolId);
  }
  if (projectStudents.length === 0) {
    return { ok: false, message: "No pude preparar estudiantes de ejemplo para crear el proyecto." };
  }

  const studentIds = projectStudents.map((s) => s.id);
  const grados = [...new Set(projectStudents.map((s) => s.grade))].sort((a, b) => a - b);
  const studentCheck = await verifyStudentsOwnedByTeacher(admin, args.teacherId, studentIds, grados);
  if (!studentCheck.ok) return { ok: false, message: studentCheck.message };

  const idempotencyKey = randomUUID();
  const pendingInputs = {
    grados,
    materia_ids: args.materiaIds,
    student_ids: studentIds,
    studentCountsByGrade: studentCheck.studentCountsByGrade,
    duracion_semanas: args.duracionSemanas,
    tema_contexto: args.temaContexto,
    source: "telegram",
  };

  const { data: pending, error } = await admin
    .from("project_generation_logs")
    .insert({
      teacher_id: args.teacherId,
      idempotency_key: idempotencyKey,
      attempt_number: 1,
      parent_attempt_id: null,
      status: "pending",
      prompt_version: PROMPT_VERSION,
      model: PROMPT_MODEL,
      inputs_jsonb: pendingInputs,
    })
    .select("id")
    .single();
  if (error || !pending) return { ok: false, message: "No pude iniciar la generación del proyecto." };

  const result = await runProjectGeneration({
    admin,
    teacherId: args.teacherId,
    schoolId,
    generationId: pending.id,
    idempotencyKey,
    inputs: {
      grados,
      materia_ids: args.materiaIds,
      studentCountsByGrade: studentCheck.studentCountsByGrade,
      duracion_semanas: args.duracionSemanas,
      tema_contexto: args.temaContexto,
    },
    studentIds,
  });

  if (result.status !== "success") {
    return { ok: false, message: `No pude terminar el proyecto: ${result.error}` };
  }

  return { ok: true, generationId: pending.id, projectId: result.projectId };
}

async function createExampleStudentsForProject(
  admin: SupabaseClient,
  teacherId: string,
  schoolId: string,
): Promise<ProjectStudentRow[]> {
  const { data: school, error: schoolErr } = await admin
    .from("schools")
    .select("id, grades")
    .eq("teacher_id", teacherId)
    .maybeSingle();

  if (schoolErr || !school || school.id !== schoolId) {
    console.error("[telegram] example student school lookup failed", schoolErr);
    return [];
  }

  const grades = normalizeSchoolGradesForExamples(school.grades);
  const rows = grades.flatMap((grade, gradeIndex) =>
    [0, 1].map((offset) => {
      const nameIndex = gradeIndex * 2 + offset;
      return {
        school_id: schoolId,
        first_name: EXAMPLE_STUDENT_FIRST_NAMES[nameIndex % EXAMPLE_STUDENT_FIRST_NAMES.length],
        last_name: "Ejemplo",
        grade,
      };
    }),
  );

  const { data, error } = await admin.from("students").insert(rows).select("id, grade");
  if (error || !data) {
    console.error("[telegram] example student insert failed", error);
    return [];
  }

  return data as ProjectStudentRow[];
}

function normalizeSchoolGradesForExamples(rawGrades: unknown): number[] {
  const grades = Array.isArray(rawGrades)
    ? rawGrades
        .map(Number)
        .filter((grade) => Number.isInteger(grade) && grade >= 1 && grade <= 5)
    : [];
  const unique = [...new Set(grades)].sort((a, b) => a - b);
  return unique.length > 0 ? unique : [3];
}

async function loadSchoolAndStudents(teacherId: string): Promise<{
  school: { id: string } | null;
  students: StudentRow[];
}> {
  const admin = createAdminClient();
  const { data: school } = await admin
    .from("schools")
    .select("id")
    .eq("teacher_id", teacherId)
    .maybeSingle();
  if (!school) return { school: null, students: [] };

  const { data: students } = await admin
    .from("students")
    .select("id, first_name, last_name, grade")
    .eq("school_id", school.id)
    .order("grade", { ascending: true })
    .order("first_name", { ascending: true });
  return { school, students: (students ?? []) as StudentRow[] };
}

function parseAttendanceText(
  text: string,
  students: StudentRow[],
): { ok: true; statusById: Map<string, AttendanceStatus> } | { ok: false; message: string } {
  const normalized = normalize(text);
  if (/\btodos?\b/.test(normalized) && /\bpresent/.test(normalized)) {
    return { ok: true, statusById: new Map() };
  }

  const statusById = new Map<string, AttendanceStatus>();
  const absent = extractNames(normalized, ["ausente", "ausentes", "faltaron", "falto"]);
  const late = extractNames(normalized, ["tarde", "tardanza", "tardanzas"]);

  const unknown: string[] = [];
  for (const name of absent) {
    const student = findStudentByName(name, students);
    if (!student) unknown.push(name);
    else statusById.set(student.id, "ausente");
  }
  for (const name of late) {
    const student = findStudentByName(name, students);
    if (!student) unknown.push(name);
    else statusById.set(student.id, "tardanza");
  }

  if (unknown.length > 0) {
    return {
      ok: false,
      message: `No reconocí: ${unknown.join(", ")}. Responde "todos presentes" o "ausentes: Maria; tarde: Pedro".`,
    };
  }
  if (absent.length === 0 && late.length === 0) {
    return {
      ok: false,
      message: `Responde "todos presentes" o usa este formato: "ausentes: Maria, Pedro; tarde: Ana".`,
    };
  }

  return { ok: true, statusById };
}

function extractNames(text: string, labels: string[]): string[] {
  for (const label of labels) {
    const match = new RegExp(`${label}\\s*:?\\s*([^;\\n]+)`).exec(text);
    if (!match) continue;
    return match[1]
      .split(/,|\by\b/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function findStudentByName(input: string, students: StudentRow[]): StudentRow | null {
  const needle = normalize(input);
  const exact = students.find((s) => normalize(fullName(s)) === needle || normalize(s.first_name) === needle);
  if (exact) return exact;
  const starts = students.filter((s) => normalize(fullName(s)).startsWith(needle) || normalize(s.first_name).startsWith(needle));
  return starts.length === 1 ? starts[0] : null;
}

function fullName(student: StudentRow): string {
  return `${student.first_name} ${student.last_name ?? ""}`.trim();
}

function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function countStatuses(statuses: AttendanceStatus[]): Record<AttendanceStatus, number> {
  return statuses.reduce(
    (acc, status) => {
      acc[status] += 1;
      return acc;
    },
    { presente: 0, ausente: 0, tardanza: 0 } as Record<AttendanceStatus, number>,
  );
}

function statusLabel(status: string): string {
  if (status === "generado") return "por empezar";
  if (status === "en_ensenanza") return "activo";
  if (status === "completado") return "completado";
  return status;
}
