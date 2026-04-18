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

  const inspect = (text: string, where: string) => {
    const needle = lowered(text);
    for (const term of DEFAULT_BLOCKLIST) {
      // Word-boundary check to avoid false positives (e.g. "appropriate" wouldn't match "app")
      const re = new RegExp(`(^|[^a-záéíóúñ])${term}([^a-záéíóúñ]|$)`, "i");
      if (re.test(needle)) {
        hits.push({ term, where });
      }
    }
  };

  // Top-level strings
  inspect(plan.titulo, "titulo");
  inspect(plan.pregunta_guia, "pregunta_guia");
  inspect(plan.producto_final, "producto_final");
  inspect(plan.cierre_actividad, "cierre_actividad");
  inspect(plan.cierre_evaluacion, "cierre_evaluacion");
  plan.materiales.forEach((m, i) => inspect(m, `materiales[${i}]`));

  // Phases and activities
  plan.fases.forEach((phase) => {
    inspect(phase.nombre, `fase ${phase.orden}.nombre`);
    inspect(phase.descripcion, `fase ${phase.orden}.descripcion`);
    for (const [grado, perMateria] of Object.entries(phase.actividades)) {
      for (const [materia, activity] of Object.entries(perMateria)) {
        inspect(activity.tarea, `fase ${phase.orden}/grado ${grado}/materia ${materia.slice(0, 6)}.tarea`);
        inspect(activity.evidencia_observable, `fase ${phase.orden}/grado ${grado}/materia ${materia.slice(0, 6)}.evidencia`);
      }
    }
  });

  return { ok: hits.length === 0, hits };
}
