import type { GeneratedPlan } from "@/lib/ai/plan-schema";

const DEFAULT_BLOCKLIST = [
  "video",
  "videos",
  "tablet",
  "tablets",
  "computador",
  "computadora",
  "computadores",
  "celular",
  "celulares",
  "smartphone",
  "link",
  "enlace",
  "url",
  "youtube",
  "internet",
  "wifi",
  "wi-fi",
  "aplicación",
  "aplicacion",
  "app",
  "apps",
  "impresora",
  "imprima",
  "imprimir", // teachers should not need to print handouts
  "fotocopia",
  "fotocopias",
  "fotocopiar",
  "proyector",
  "pantalla",
];

/** In tip_profe only: the teacher's own phone (photo, audio, short video) is allowed as an option. */
const TEACHER_PHONE_ALLOWED = new Set(["video", "videos", "celular", "celulares", "smartphone"]);
const TIP_BLOCKLIST = DEFAULT_BLOCKLIST.filter((t) => !TEACHER_PHONE_ALLOWED.has(t));

export type ZeroTechResult = {
  ok: boolean;
  hits: Array<{ term: string; where: string }>;
};

/**
 * Scan the generated plan for forbidden tech-dependent vocabulary.
 * Real teachers in rural Colombia cannot assume any of these exist for their students.
 */
export function runZeroTechCheck(plan: GeneratedPlan): ZeroTechResult {
  const hits: Array<{ term: string; where: string }> = [];
  const lowered = (s: string) => s.toLowerCase();

  const inspect = (text: string, where: string, blocklist: readonly string[] = DEFAULT_BLOCKLIST) => {
    const needle = lowered(text);
    for (const term of blocklist) {
      // Word-boundary check to avoid false positives (e.g. "appropriate" wouldn't match "app")
      const re = new RegExp(`(^|[^a-záéíóúñ])${term}([^a-záéíóúñ]|$)`, "i");
      if (re.test(needle)) {
        hits.push({ term, where });
      }
    }
  };

  inspect(plan.titulo, "titulo");
  inspect(plan.pregunta_guia, "pregunta_guia");
  if (plan.tarea_previa) inspect(plan.tarea_previa, "tarea_previa");
  plan.materiales.forEach((m, i) => inspect(m, `materiales[${i}]`));

  for (const fase of plan.fases) {
    if (fase.gran_pregunta) inspect(fase.gran_pregunta, `fase ${fase.orden}.gran_pregunta`);
    fase.bloques.forEach((b, i) => {
      const at = `fase ${fase.orden}/bloque ${i + 1}`;
      inspect(b.titulo, `${at}.titulo`);
      inspect(b.contenido, `${at}.contenido`);
      (b.variantes_por_grado ?? []).forEach((v, j) => inspect(v.contenido, `${at}.variante ${j + 1}`));
      // The teacher may own a phone: tips may mention an optional photo/video/audio.
      if (b.tip_profe) inspect(b.tip_profe, `${at}.tip_profe`, TIP_BLOCKLIST);
    });
  }

  return { ok: hits.length === 0, hits };
}