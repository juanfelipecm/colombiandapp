"use client";

import { useActionState, useMemo, useState } from "react";
import { saveAttendance, type SaveAttendanceState } from "./actions";
import { Button, SubmitButton } from "@/components/ui/button";
import type { AttendanceStatus } from "@/lib/asistencia/types";

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  grade: number;
}

interface ExistingRecord {
  student_id: string;
  status: AttendanceStatus;
  justified: boolean;
  note: string | null;
}

interface FormState {
  status: AttendanceStatus | null;
  justified: boolean;
  note: string;
}

function emptyState(): FormState {
  return { status: null, justified: false, note: "" };
}

function fromExisting(rec: ExistingRecord): FormState {
  return {
    status: rec.status,
    justified: rec.justified,
    note: rec.note ?? "",
  };
}

interface Props {
  students: Student[];
  existingRecords: ExistingRecord[];
  hasExistingForToday: boolean;
}

export function TakeAttendanceForm({ students, existingRecords, hasExistingForToday }: Props) {
  const initial = useMemo<Record<string, FormState>>(() => {
    const out: Record<string, FormState> = {};
    for (const s of students) {
      const existing = existingRecords.find((r) => r.student_id === s.id);
      out[s.id] = existing ? fromExisting(existing) : emptyState();
    }
    return out;
  }, [students, existingRecords]);

  const [perStudent, setPerStudent] = useState<Record<string, FormState>>(initial);
  const [serverState, formAction] = useActionState<SaveAttendanceState, FormData>(
    saveAttendance,
    null,
  );

  const grouped = useMemo(() => {
    const byGrade = new Map<number, Student[]>();
    for (const s of students) {
      const arr = byGrade.get(s.grade) ?? [];
      arr.push(s);
      byGrade.set(s.grade, arr);
    }
    return [...byGrade.entries()]
      .sort(([a], [b]) => a - b)
      .map(([grade, list]) => ({
        grade,
        students: list.slice().sort((a, b) =>
          a.last_name.localeCompare(b.last_name, "es") ||
          a.first_name.localeCompare(b.first_name, "es"),
        ),
      }));
  }, [students]);

  const markedCount = students.filter((s) => perStudent[s.id]?.status !== null).length;
  const total = students.length;
  const allMarked = markedCount === total && total > 0;

  function setStatus(studentId: string, status: AttendanceStatus) {
    setPerStudent((prev) => ({
      ...prev,
      [studentId]: {
        ...prev[studentId],
        status,
        // If switching away from ausente, clear the justified flag.
        justified: status === "ausente" ? prev[studentId].justified : false,
        note: status === "ausente" ? prev[studentId].note : "",
      },
    }));
  }

  function setJustified(studentId: string, justified: boolean) {
    setPerStudent((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], justified },
    }));
  }

  function setNote(studentId: string, note: string) {
    setPerStudent((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], note: note.slice(0, 1000) },
    }));
  }

  function markAllPresent() {
    setPerStudent((prev) => {
      const next: Record<string, FormState> = { ...prev };
      for (const s of students) {
        next[s.id] = { status: "presente", justified: false, note: "" };
      }
      return next;
    });
  }

  return (
    <form action={formAction} className="pb-4">
      {/* Bulk action — at TOP per design review (matches teacher mental model:
          default everyone present, then call out absences). Hidden once any
          row is already marked from a prior save. */}
      {!hasExistingForToday && (
        <div className="mb-5 rounded-2xl border-[1.5px] border-border bg-input-bg p-4">
          <p className="mb-3 text-[15px] font-semibold">¿Todos llegaron hoy?</p>
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={markAllPresent}
          >
            Sí, marcar presentes
          </Button>
        </div>
      )}

      {/* Server error toast */}
      {serverState?.error && (
        <div role="alert" className="mb-4 rounded-xl bg-brand-red/10 px-4 py-3 text-sm text-brand-red">
          {serverState.error}
        </div>
      )}

      {/* Roster grouped by grade */}
      {grouped.map(({ grade, students: list }) => (
        <section key={grade} className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-text-secondary">
            {grade}° grado <span className="font-normal">({list.length} estudiante{list.length === 1 ? "" : "s"})</span>
          </h2>
          {list.map((s) => (
            <StudentRow
              key={s.id}
              student={s}
              state={perStudent[s.id]}
              onStatus={(status) => setStatus(s.id, status)}
              onJustified={(j) => setJustified(s.id, j)}
              onNote={(note) => setNote(s.id, note)}
            />
          ))}
        </section>
      ))}

      {/* Hidden form fields — encode pickled state into formData */}
      {students.map((s) => {
        const st = perStudent[s.id];
        if (!st || st.status === null) return null;
        return (
          <div key={s.id}>
            <input type="hidden" name={`status[${s.id}]`} value={st.status} />
            {st.status === "ausente" && st.justified && (
              <input type="hidden" name={`justified[${s.id}]`} value="true" />
            )}
            {st.status === "ausente" && st.note && (
              <input type="hidden" name={`note[${s.id}]`} value={st.note} />
            )}
          </div>
        );
      })}

      {/* Progress + submit */}
      <p className="mb-2 text-center text-[13px] text-text-secondary">
        {markedCount} de {total} marcados
      </p>
      <SubmitButton
        variant="primary"
        pendingText="Guardando..."
        disabled={!allMarked}
      >
        {hasExistingForToday ? "Actualizar lista" : "Guardar lista"}
      </SubmitButton>
      {!allMarked && total > 0 && (
        <p className="mt-2 text-center text-xs text-text-placeholder">
          Marca a todos los estudiantes para guardar
        </p>
      )}
    </form>
  );
}

interface StudentRowProps {
  student: Student;
  state: FormState;
  onStatus: (s: AttendanceStatus) => void;
  onJustified: (j: boolean) => void;
  onNote: (n: string) => void;
}

const PILL_LABELS: Record<AttendanceStatus, string> = {
  presente: "Presente",
  ausente: "Ausente",
  tardanza: "Llegó tarde",
};

// Static class names — Tailwind v4 needs to statically extract these. Dynamic
// `bg-[var(--grade-${n}-bg)]` doesn't work; the Record lookup does.
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

function StudentRow({ student, state, onStatus, onJustified, onNote }: StudentRowProps) {
  const initials = `${student.first_name.charAt(0)}${student.last_name.charAt(0)}`.toUpperCase();
  const bgClass = GRADE_BG[student.grade] ?? "bg-input-bg";
  const textClass = GRADE_TEXT[student.grade] ?? "text-text-primary";

  return (
    <div className="border-b border-border py-3">
      <div className="mb-2 flex items-center gap-3">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${bgClass} ${textClass}`}
        >
          {initials}
        </div>
        <p className="flex-1 text-[15px] font-semibold">
          {student.first_name} {student.last_name}
        </p>
      </div>

      <div role="radiogroup" aria-label={`Estado de ${student.first_name}`} className="grid grid-cols-3 gap-2">
        {(["presente", "ausente", "tardanza"] as AttendanceStatus[]).map((opt) => {
          const selected = state.status === opt;
          return (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onStatus(opt)}
              className={`min-h-[48px] rounded-full px-2 py-3 text-sm font-semibold transition-colors ${
                selected
                  ? `${bgClass} ${textClass} border-[1.5px] border-transparent`
                  : "border-[1.5px] border-border bg-white text-text-secondary"
              }`}
            >
              {PILL_LABELS[opt]}
            </button>
          );
        })}
      </div>

      {state.status === "ausente" && (
        <div className="mt-3 rounded-xl bg-input-bg p-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={state.justified}
              onChange={(e) => onJustified(e.target.checked)}
              className="h-5 w-5 rounded border-border"
            />
            Falta justificada
          </label>
          <input
            type="text"
            value={state.note}
            onChange={(e) => onNote(e.target.value)}
            placeholder="Nota opcional (ej. fiebre)"
            maxLength={200}
            className="mt-2 w-full rounded-lg border-[1.5px] border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
          />
        </div>
      )}
    </div>
  );
}
