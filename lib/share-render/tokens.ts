// Single source of truth for share-render colors. Mirrors DESIGN.md tokens.
// Inline-style refactor of Infographic.tsx imports from here so every color
// is named, not a loose hex literal — guards against the documented pitfall
// of conflating cYellow (#FFB100, brand) with grade1Bg (#FFF3D0, soft tone).

export const tokens = {
  cYellow: "#FFB100",
  cBlue: "#0060BB",
  cRed: "#D00000",
  cTeal: "#37BBCA",
  cGreen: "#89D819",
  cOrange: "#FF7B17",

  grade1Bg: "#FFF3D0", grade1Text: "#B07800",
  grade2Bg: "#D0E8FF", grade2Text: "#004488",
  grade3Bg: "#FFE0E0", grade3Text: "#990000",
  grade4Bg: "#D0F0F5", grade4Text: "#1A7A85",
  grade5Bg: "#D8F5D8", grade5Text: "#3D7A00",

  black: "#000000",
  muted: "#666666",
  surface: "#FFFFFF",
  hairline: "#EEEEEE",
} as const;

export type GradeNumber = 1 | 2 | 3 | 4 | 5;

/** Transición (grade 0) uses a neutral surface, like the app badge. */
export function gradeBg(grade: number): string {
  if (grade === 0) return tokens.hairline;
  return tokens[`grade${grade as GradeNumber}Bg` as keyof typeof tokens] ?? tokens.muted;
}

export function gradeText(grade: number): string {
  if (grade === 0) return tokens.muted;
  return tokens[`grade${grade as GradeNumber}Text` as keyof typeof tokens] ?? tokens.black;
}

/**
 * Fase accent (eyebrow, numeral, hairline). Muted brand tones — the grade
 * text colors plus a 70% orange — so five fases don't shout (Juan, 2026-11-06).
 */
export function phaseColor(orden: number): string {
  switch (orden) {
    case 1: return tokens.grade1Text;
    case 2: return tokens.grade2Text;
    case 3: return tokens.grade5Text;
    case 4: return tokens.grade4Text;
    case 5: return "rgba(255, 123, 23, 0.7)";
    default: return tokens.muted;
  }
}
