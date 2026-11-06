/**
 * Modelo Clase Viva — the five fixed etapas every project follows.
 * Single source of truth for etapa copy used by the engine (prompt, RPC
 * payload `nombre`), the project view, the generating overlay, the share
 * infographic and the eval markdown. No React, no server-only imports.
 *
 *   1 despertar_curiosidad → 2 indagar_investigar → 3 crear → 4 reflexionar → 5 compartir
 */

export const ETAPAS = [
  "despertar_curiosidad",
  "indagar_investigar",
  "crear",
  "reflexionar",
  "compartir",
] as const;

export type Etapa = (typeof ETAPAS)[number];

export const TOTAL_FASES = 5;

export type EtapaMeta = {
  orden: 1 | 2 | 3 | 4 | 5;
  nombre: string;
  descripcion: string;
  /** Line shown on the generating overlay while this fase is "being written". */
  generando: string;
};

export const ETAPA_META: Record<Etapa, EtapaMeta> = {
  despertar_curiosidad: {
    orden: 1,
    nombre: "Despertar la curiosidad",
    descripcion: "Una experiencia que sorprende y abre la pregunta.",
    generando: "Despertando la curiosidad…",
  },
  indagar_investigar: {
    orden: 2,
    nombre: "Indagar e investigar",
    descripcion: "Explorar, preguntar y buscar respuestas.",
    generando: "Preparando la indagación…",
  },
  crear: {
    orden: 3,
    nombre: "Crear",
    descripcion: "Construir algo con lo aprendido.",
    generando: "Diseñando lo que van a crear…",
  },
  reflexionar: {
    orden: 4,
    nombre: "Reflexionar",
    descripcion: "Mirar atrás y darle sentido a lo vivido.",
    generando: "Pensando la reflexión…",
  },
  compartir: {
    orden: 5,
    nombre: "Compartir",
    descripcion: "Mostrar el trabajo a la familia y la comunidad.",
    generando: "Organizando cómo lo van a compartir…",
  },
};

export function isEtapa(value: unknown): value is Etapa {
  return typeof value === "string" && (ETAPAS as readonly string[]).includes(value);
}

export function etapaByOrden(orden: number): Etapa | null {
  return ETAPAS[orden - 1] ?? null;
}

/** "Despertar la curiosidad, Indagar e investigar, Crear, Reflexionar y Compartir" */
export function etapasSentence(): string {
  const names = ETAPAS.map((e) => ETAPA_META[e].nombre);
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

export type ProjectStatus = "generado" | "en_ensenanza" | "completado" | "archivado";

/** Card/list label for a project's fase progress. */
export function faseProgressLabel(status: ProjectStatus, completedCount: number): string {
  if (status === "completado" || completedCount >= TOTAL_FASES) return "5 fases completadas";
  if (status === "en_ensenanza") {
    const next = Math.min(completedCount + 1, TOTAL_FASES);
    return `Fase ${next} de ${TOTAL_FASES}`;
  }
  return `${TOTAL_FASES} fases`;
}
