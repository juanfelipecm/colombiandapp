// Pick a font size based on character count so long strings still fit without
// truncation. Locked in plan-design-review: progressive scale-down, no
// truncation. Used for título and pregunta-guía where overflow is real.

export function fitTitulo(text: string): number {
  const len = text.length;
  if (len <= 50) return 48;
  if (len <= 80) return 42;
  if (len <= 120) return 36;
  return 30;
}

export function fitPreguntaGuia(text: string): number {
  const len = text.length;
  if (len <= 100) return 32;
  if (len <= 160) return 28;
  if (len <= 220) return 24;
  return 20;
}
