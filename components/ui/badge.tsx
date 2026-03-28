const gradeStyles: Record<number, string> = {
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
      {grade}° grado
    </span>
  );
}
