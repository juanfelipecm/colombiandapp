import { ETAPAS } from "@/lib/clase-viva/etapas";
import { deriveGradeBands } from "@/lib/clase-viva/grados";

/**
 * Builds a valid Clase Viva plan (the shape emit_plan returns) for tests.
 *
 *   grados × materiaIds → one dba_target per pair using tokens[`${g}:${m}`] (default "D1")
 *   5 fases in etapa order; fase 2 gets an actividad_por_grados block when the
 *   selection spans ≥ 2 bands, with one variant per band (a valid partition).
 */
export function makeBloque(over: Record<string, unknown> = {}) {
  return {
    tipo: "actividad",
    titulo: "Actividad central",
    contenido:
      "Pide a los estudiantes que se organicen en grupos mixtos. Cada grupo observa la panela y describe su olor y textura.",
    variantes_por_grado: null,
    tip_profe: null,
    ...over,
  };
}

export function makePlan(
  grados: number[],
  materiaIds: string[],
  tokens: Record<string, string> = {},
  over: Record<string, unknown> = {},
) {
  const bands = deriveGradeBands(grados);
  const dba_targets = grados.flatMap((g) =>
    materiaIds.map((m) => ({
      grado: g,
      materia_id: m,
      dbas: [{ dba_token: tokens[`${g}:${m}`] ?? "D1", evidencia_index: 0 as number | null }],
    })),
  );

  const fases = ETAPAS.map((etapa, i) => {
    const bloques: Record<string, unknown>[] = [
      makeBloque({ tipo: "inicio", titulo: "Inicio" }),
      makeBloque(),
    ];
    if (i === 1 && bands.length >= 2) {
      bloques.push(
        makeBloque({
          tipo: "actividad_por_grados",
          titulo: "Actividad por grados",
          variantes_por_grado: bands.map((band) => ({
            grados: band,
            contenido: "Exploran el patio y dibujan lo que encuentran sobre el tema.",
          })),
          tip_profe: "Profe, si llueve haz la actividad en el corredor.",
        }),
      );
    }
    bloques.push(makeBloque({ tipo: "cierre", titulo: "Cierre" }));
    return {
      orden: i + 1,
      etapa,
      gran_pregunta: i === 4 ? null : "¿Qué sabemos de la panela que comemos en casa?",
      bloques,
    };
  });

  return {
    titulo: "En nuestras venas, la panela",
    pregunta_guia: "¿Cómo contar la historia de una enramada?",
    tarea_previa: "Pide a los estudiantes que pregunten en casa qué recetas llevan panela.",
    materiales: ["papel", "lápices", "panela"],
    dba_targets,
    fases,
    ...over,
  };
}
