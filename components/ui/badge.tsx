import { formatGrado, formatGradosBand } from "@/lib/clase-viva/grados";

/** Grade colour classes. Transición (0) uses a neutral surface (DESIGN.md decisions log). */
export const gradeStyles: Record<number, string> = {
  0: "bg-input-bg text-text-secondary border border-border",
  1: "bg-[var(--grade-1-bg)] text-[var(--grade-1-text)]",
  2: "bg-[var(--grade-2-bg)] text-[var(--grade-2-text)]",
  3: "bg-[var(--grade-3-bg)] text-[var(--grade-3-text)]",
  4: "bg-[var(--grade-4-bg)] text-[var(--grade-4-text)]",
  5: "bg-[var(--grade-5-bg)] text-[var(--grade-5-text)]",
};

interface BadgeProps {
  grade: number;
  className?: string;
}

export function GradeBadge({ grade, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        gradeStyles[grade] || ""
      } ${className}`}
    >
      {grade === 0 ? formatGrado(0) : `${grade}° grado`}
    </span>
  );
}

/** Pill for a grade band ("Transición y 1°"), coloured by its first grade. */
export function GradeBandPill({ grados, className = "" }: { grados: number[]; className?: string }) {
  const first = [...grados].sort((a, b) => a - b)[0] ?? 0;
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${gradeStyles[first] || ""} ${className}`}
    >
      {formatGradosBand(grados)}
    </span>
  );
}
