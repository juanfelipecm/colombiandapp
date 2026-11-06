import { parseBloques } from "@/lib/clase-viva/bloques";
import { ETAPAS, ETAPA_META } from "@/lib/clase-viva/etapas";
import type { ShareData } from "@/lib/share-render/load-project";
import { makeBloque } from "./clase-viva-plan";

/** Deterministic ShareData for Infographic, estimate-height and render tests. */
export const baseShareProject: ShareData["project"] = {
  id: "p",
  titulo: "En nuestras venas, la panela",
  pregunta_guia: "¿Cómo contar la historia de una enramada?",
  tarea_previa: "Pide a los estudiantes que pregunten en casa qué recetas llevan panela y traigan una.",
  updated_at: "2026-11-06T00:00:00Z",
};

export function sharePhases(opts: { blocksPerFase?: number; contenido?: string } = {}): ShareData["phases"] {
  const n = opts.blocksPerFase ?? 3;
  return ETAPAS.map((etapa, i) => ({
    orden: i + 1,
    etapa,
    nombre: ETAPA_META[etapa].nombre,
    gran_pregunta: i === 4 ? null : `¿Qué descubrimos sobre la panela en la fase ${i + 1}?`,
    bloques: parseBloques(
      Array.from({ length: n }, (_, b) =>
        i === 1 && b === 1
          ? makeBloque({
              tipo: "actividad_por_grados",
              titulo: "Actividad por grados",
              variantes_por_grado: [
                { grados: [0, 1], contenido: "Exploran el trapiche y dibujan lo que ven." },
                { grados: [2, 3], contenido: "Entrevistan a un familiar y registran sus respuestas." },
              ],
              tip_profe: "Profe, si no hay trapiche cerca, usa fotos o un relato de un abuelo.",
            })
          : makeBloque({
              tipo: b === 0 ? "inicio" : b === n - 1 ? "cierre" : "actividad",
              titulo: b === 0 ? "Inicio" : b === n - 1 ? "Cierre" : "Actividad central",
              contenido:
                opts.contenido ??
                `Pide a los estudiantes que se sienten en círculo para la fase ${i + 1}. Luego conversan sobre la panela.`,
            }),
      ),
    ),
  }));
}

export function makeShareData(overrides: Partial<ShareData> = {}): ShareData {
  return {
    project: baseShareProject,
    grados: [0, 1, 2, 3],
    materias: [
      { nombre: "Lenguaje", slug: "lenguaje" },
      { nombre: "Inglés", slug: "ingles" },
    ],
    studentCount: 18,
    targetsByMateria: [
      {
        materia_id: "m1",
        materia_nombre: "Lenguaje",
        materia_slug: "lenguaje",
        rows: [
          { grado: 0, dba_numero: 1, enunciado: "Comunica ideas con dibujos.", evidencia: "Cuenta un cuento." },
          { grado: 3, dba_numero: 7, enunciado: "Produce textos orales breves.", evidencia: "Narra una historia." },
        ],
      },
      {
        materia_id: "m2",
        materia_nombre: "Inglés",
        materia_slug: "ingles",
        rows: [{ grado: 3, dba_numero: 1, enunciado: "Saluda en inglés.", evidencia: "ESTA NO DEBE APARECER" }],
      },
    ],
    phases: sharePhases(),
    materiales: ["Cuaderno", "Lápiz", "Panela"],
    invalidoCount: 0,
    ...overrides,
  };
}
