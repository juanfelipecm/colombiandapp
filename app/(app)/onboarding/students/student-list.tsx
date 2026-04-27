"use client";

import { useState, useActionState } from "react";
import { addStudent, deleteStudent, continueToComplete } from "./actions";
import { GradeBadge } from "@/components/ui/badge";
import { Button, SubmitButton } from "@/components/ui/button";

interface Student {
  id: string;
  first_name: string;
  grade: number;
}

export function StudentList({ students: initialStudents }: { students: Student[] }) {
  const [showForm, setShowForm] = useState(false);
  const [addState, addAction] = useActionState(addStudent, null);

  const students = initialStudents;
  const canContinue = students.length >= 1;

  return (
    <div>
      {/* Student list */}
      {students.length === 0 ? (
        <div className="py-8 text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-brand-blue/10 text-3xl">
            +
          </div>
          <p className="text-sm text-text-secondary">
            Agrega al menos un estudiante para continuar
          </p>
        </div>
      ) : (
        <div className="mb-4">
          {students.map((student) => (
            <div key={student.id} className="flex items-center gap-3 border-b border-border py-3">
              <StudentAvatar firstName={student.first_name} grade={student.grade} />
              <div className="flex-1">
                <p className="text-[15px] font-semibold">{student.first_name}</p>
              </div>
              <GradeBadge grade={student.grade} />
              <button
                onClick={() => deleteStudent(student.id)}
                className="ml-1 p-2 text-text-placeholder hover:text-brand-red"
                aria-label={`Eliminar ${student.first_name}`}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add student form (bottom sheet style) */}
      {showForm ? (
        <div className="mb-4 rounded-2xl border-[1.5px] border-border p-4">
          <h3 className="mb-3 text-base font-semibold">Nuevo estudiante</h3>
          <form
            action={async (formData) => {
              await addAction(formData);
              setShowForm(false);
            }}
          >
            {addState?.error && (
              <p className="mb-2 text-[13px] text-brand-red">{addState.error}</p>
            )}
            <div className="mb-3">
              <label htmlFor="first_name" className="block text-sm font-medium mb-1">Nombres</label>
              <input
                id="first_name"
                name="first_name"
                type="text"
                required
                maxLength={80}
                placeholder="Ej: Maria"
                className="w-full rounded-xl border-[1.5px] border-border px-4 py-3 text-base bg-input-bg focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
              />
            </div>
            <div className="mb-4">
              <label htmlFor="grade" className="block text-sm font-medium mb-1">Grado</label>
              <select
                id="grade"
                name="grade"
                required
                className="w-full rounded-xl border-[1.5px] border-border px-4 py-3 text-base bg-input-bg focus:outline-none focus:ring-2 focus:ring-brand-blue/30"
              >
                <option value="">Selecciona</option>
                {[1, 2, 3, 4, 5].map((g) => (
                  <option key={g} value={g}>{g}° grado</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)} className="flex-1">
                Cancelar
              </Button>
              <SubmitButton variant="primary" pendingText="Guardando..." className="flex-1">
                Guardar
              </SubmitButton>
            </div>
          </form>
        </div>
      ) : (
        <Button variant="ghost" onClick={() => setShowForm(true)} className="w-full mb-4">
          <span className="flex items-center justify-center gap-2">
            <span className="text-xl">+</span> Agregar estudiante
          </span>
        </Button>
      )}

      {/* Continue button */}
      <form action={continueToComplete}>
        <SubmitButton
          variant="primary"
          pendingText="Continuando..."
          disabled={!canContinue}
          className="w-full"
        >
          Continuar
        </SubmitButton>
      </form>
      {!canContinue && (
        <p className="mt-2 text-center text-xs text-text-placeholder">
          Agrega al menos un estudiante para continuar
        </p>
      )}
    </div>
  );
}

function StudentAvatar({ firstName, grade }: { firstName: string; grade: number }) {
  const initials = firstName.charAt(0).toUpperCase();

  const bgColors: Record<number, string> = {
    1: "bg-[var(--grade-1-bg)]",
    2: "bg-[var(--grade-2-bg)]",
    3: "bg-[var(--grade-3-bg)]",
    4: "bg-[var(--grade-4-bg)]",
    5: "bg-[var(--grade-5-bg)]",
  };

  return (
    <div
      className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold text-text-secondary ${
        bgColors[grade] || "bg-border"
      }`}
    >
      {initials}
    </div>
  );
}
