"use client";

import { useEffect, useRef, useState, useActionState } from "react";
import { addStudent, deleteStudent, updateStudent } from "./actions";
import { GradeBadge } from "@/components/ui/badge";
import { Button, SubmitButton } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { computeAge } from "@/lib/utils/age";

export interface Student {
  id: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  grade: number;
}

type Sheet =
  | { type: "closed" }
  | { type: "adding" }
  | { type: "editing"; student: Student };

const GRADES = [1, 2, 3, 4, 5] as const;

export function StudentsManager({ students }: { students: Student[] }) {
  const [sheet, setSheet] = useState<Sheet>({ type: "closed" });
  const [addState, addAction, addPending] = useActionState(addStudent, null);
  const [editState, editAction, editPending] = useActionState(updateStudent, null);

  // Close the sheet on the pending=true → false transition when the action
  // returned success (null state). Without the transition check we'd close on
  // initial mount (where state is also null) or before the server responds.
  const prevAddPending = useRef(false);
  const prevEditPending = useRef(false);

  useEffect(() => {
    if (prevAddPending.current && !addPending && addState === null) {
      setSheet({ type: "closed" });
    }
    prevAddPending.current = addPending;
  }, [addPending, addState]);

  useEffect(() => {
    if (prevEditPending.current && !editPending && editState === null) {
      setSheet({ type: "closed" });
    }
    prevEditPending.current = editPending;
  }, [editPending, editState]);

  const grouped: Record<number, Student[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
  for (const s of students) {
    if (grouped[s.grade]) grouped[s.grade].push(s);
  }
  for (const g of GRADES) {
    grouped[g].sort((a, b) => a.last_name.localeCompare(b.last_name, "es"));
  }

  const handleDelete = (student: Student) => {
    const fullName = `${student.first_name} ${student.last_name}`;
    if (window.confirm(`¿Eliminar a ${fullName}? Esta acción no se puede deshacer.`)) {
      void deleteStudent(student.id);
    }
  };

  if (students.length === 0) {
    return (
      <>
        <EmptyState onAdd={() => setSheet({ type: "adding" })} />
        {renderSheet()}
      </>
    );
  }

  return (
    <>
      <div className="space-y-6 pb-8">
        {GRADES.map((grade) => {
          const list = grouped[grade];
          if (list.length === 0) return null;
          return (
            <section key={grade}>
              <h2
                className="mb-2 text-sm font-bold uppercase tracking-wide"
                style={{ color: `var(--grade-${grade}-text)` }}
              >
                {grade}° grado
                <span className="ml-2 text-xs font-medium normal-case tracking-normal text-text-secondary">
                  {list.length} {list.length === 1 ? "estudiante" : "estudiantes"}
                </span>
              </h2>
              <div>
                {list.map((student) => (
                  <StudentRow
                    key={student.id}
                    student={student}
                    onEdit={() => setSheet({ type: "editing", student })}
                    onDelete={() => handleDelete(student)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setSheet({ type: "adding" })}
        aria-label="Agregar estudiante"
        className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand-yellow text-2xl font-bold text-text-primary shadow-lg"
      >
        +
      </button>

      {renderSheet()}
    </>
  );

  function renderSheet() {
    if (sheet.type === "adding") {
      return (
        <BottomSheet open onClose={() => setSheet({ type: "closed" })} title="Nuevo estudiante">
          <form action={addAction}>
            {addState?.error && (
              <p className="mb-2 text-[13px] text-brand-red">{addState.error}</p>
            )}
            <StudentFormFields />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSheet({ type: "closed" })}
                className="flex-1"
              >
                Cancelar
              </Button>
              <SubmitButton variant="primary" pendingText="Guardando..." className="flex-1">
                Guardar
              </SubmitButton>
            </div>
          </form>
        </BottomSheet>
      );
    }

    if (sheet.type === "editing") {
      const s = sheet.student;
      return (
        <BottomSheet
          open
          onClose={() => setSheet({ type: "closed" })}
          title="Editar estudiante"
        >
          <form key={s.id} action={editAction}>
            <input type="hidden" name="id" value={s.id} />
            {editState?.error && (
              <p className="mb-2 text-[13px] text-brand-red">{editState.error}</p>
            )}
            <StudentFormFields student={s} />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSheet({ type: "closed" })}
                className="flex-1"
              >
                Cancelar
              </Button>
              <SubmitButton variant="primary" pendingText="Actualizando..." className="flex-1">
                Actualizar
              </SubmitButton>
            </div>
          </form>
        </BottomSheet>
      );
    }

    return null;
  }
}

function StudentRow({
  student,
  onEdit,
  onDelete,
}: {
  student: Student;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border py-3">
      <StudentAvatar
        firstName={student.first_name}
        lastName={student.last_name}
        grade={student.grade}
      />
      <div className="flex-1 min-w-0">
        <p className="truncate text-[15px] font-semibold">
          {student.first_name} {student.last_name}
        </p>
        <p className="text-xs text-text-secondary">
          {computeAge(student.birth_date)} años
        </p>
      </div>
      <GradeBadge grade={student.grade} />
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Editar ${student.first_name} ${student.last_name}`}
        className="ml-1 p-2 text-text-placeholder hover:text-brand-blue"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Eliminar ${student.first_name} ${student.last_name}`}
        className="p-2 text-text-placeholder hover:text-brand-red"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function StudentAvatar({
  firstName,
  lastName,
  grade,
}: {
  firstName: string;
  lastName: string;
  grade: number;
}) {
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  return (
    <div
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-text-secondary"
      style={{ backgroundColor: `var(--grade-${grade}-bg)` }}
    >
      {initials}
    </div>
  );
}

function StudentFormFields({ student }: { student?: Student }) {
  return (
    <>
      <div className="mb-3">
        <label htmlFor="first_name" className="mb-1 block text-sm font-medium">
          Nombres
        </label>
        <input
          id="first_name"
          name="first_name"
          type="text"
          required
          maxLength={80}
          defaultValue={student?.first_name}
          placeholder="Ej: Maria"
          className="w-full rounded-xl border-[1.5px] border-border bg-input-bg px-4 py-3 text-base focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
        />
      </div>
      <div className="mb-3">
        <label htmlFor="last_name" className="mb-1 block text-sm font-medium">
          Apellidos
        </label>
        <input
          id="last_name"
          name="last_name"
          type="text"
          required
          maxLength={80}
          defaultValue={student?.last_name}
          placeholder="Ej: Lopez Ramirez"
          className="w-full rounded-xl border-[1.5px] border-border bg-input-bg px-4 py-3 text-base focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
        />
      </div>
      <div className="mb-3">
        <label htmlFor="birth_date" className="mb-1 block text-sm font-medium">
          Fecha de nacimiento
        </label>
        <input
          id="birth_date"
          name="birth_date"
          type="date"
          required
          defaultValue={student?.birth_date}
          className="w-full rounded-xl border-[1.5px] border-border bg-input-bg px-4 py-3 text-base focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
        />
      </div>
      <div className="mb-4">
        <label htmlFor="grade" className="mb-1 block text-sm font-medium">
          Grado
        </label>
        <select
          id="grade"
          name="grade"
          required
          defaultValue={student?.grade ?? ""}
          className="w-full rounded-xl border-[1.5px] border-border bg-input-bg px-4 py-3 text-base focus:border-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
        >
          <option value="">Selecciona</option>
          {GRADES.map((g) => (
            <option key={g} value={g}>
              {g}° grado
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mt-16 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-input-bg">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87" />
          <path d="M16 3.13a4 4 0 010 7.75" />
        </svg>
      </div>
      <h2 className="mb-1 text-lg font-bold">Aún no tienes estudiantes</h2>
      <p className="mb-6 text-sm text-text-secondary">
        Agrega a tus estudiantes para empezar.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="inline-block rounded-xl bg-brand-blue px-5 py-3 text-sm font-semibold text-white"
      >
        Agregar estudiante
      </button>
    </div>
  );
}
