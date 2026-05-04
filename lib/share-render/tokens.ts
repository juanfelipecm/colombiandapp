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

export function gradeBg(grade: number): string {
  return tokens[`grade${grade as GradeNumber}Bg` as keyof typeof tokens] ?? tokens.muted;
}

export function gradeText(grade: number): string {
  return tokens[`grade${grade as GradeNumber}Text` as keyof typeof tokens] ?? tokens.black;
}

export function phaseColor(orden: number): string {
  switch (orden) {
    case 1: return tokens.cYellow;
    case 2: return tokens.cBlue;
    case 3: return tokens.cGreen;
    case 4: return tokens.cTeal;
    default: return tokens.muted;
  }
}
