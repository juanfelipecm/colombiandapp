"use client";

import { useActionState, useState } from "react";
import { createSchool } from "./actions";
import { Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/button";
import { GeoPicker } from "@/components/geo-picker";

const allGrades = [1, 2, 3, 4, 5];

const gradeColors: Record<number, string> = {
  1: "bg-brand-yellow text-text-primary",
  2: "bg-brand-blue text-white",
  3: "bg-brand-red text-white",
  4: "bg-brand-teal text-white",
  5: "bg-brand-green text-white",
};

const gradeInactive = "border-[1.5px] border-border text-text-placeholder";

export function SchoolForm() {
  const [state, formAction] = useActionState(createSchool, null);
  const [selectedGrades, setSelectedGrades] = useState<number[]>([]);

  const toggleGrade = (grade: number) => {
    setSelectedGrades((prev) =>
      prev.includes(grade) ? prev.filter((g) => g !== grade) : [...prev, grade]
    );
  };

  return (
    <form action={formAction}>
      {state?.error && (
        <div className="mb-4 rounded-xl border border-brand-red/20 bg-brand-red/5 p-3">
          <p className="text-sm text-brand-red">{state.error}</p>
        </div>
      )}

      <Input
        label="Nombre de la escuela"
        name="name"
        type="text"
        placeholder="Ej: Escuela Rural La Esperanza"
        required
        maxLength={100}
      />

      <GeoPicker />

      <Input
        label="Vereda (opcional)"
        name="vereda"
        type="text"
        placeholder="Ej: La Palma"
        maxLength={100}
      />

      <div className="mb-6">
        <label className="block text-base font-semibold text-text-primary mb-2">
          Grados que ensenas
        </label>
        <div className="flex flex-wrap gap-2">
          {allGrades.map((grade) => {
            const isSelected = selectedGrades.includes(grade);
            return (
              <button
                key={grade}
                type="button"
                onClick={() => toggleGrade(grade)}
                className={`rounded-full px-5 py-2.5 text-sm font-semibold transition-colors min-h-[44px] ${
                  isSelected ? gradeColors[grade] : gradeInactive
                }`}
              >
                {grade}°
                {isSelected && (
                  <input type="hidden" name="grades" value={grade} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <SubmitButton pendingText="Guardando..." className="w-full">Continuar</SubmitButton>
    </form>
  );
}
