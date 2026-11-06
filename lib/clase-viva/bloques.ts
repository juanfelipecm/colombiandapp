import { z } from "zod";

/**
 * Bloques: the narrative units a Clase Viva fase is made of. Stored as a jsonb
 * array on project_phases.bloques. The *write* side (model output) is validated
 * by buildBloqueSchema; the *read* side (parseBloques) is tolerant and turns a
 * malformed entry into a visible { tipo: "invalido" } placeholder.
 */

export const BLOQUE_TIPOS = [
  "inicio",
  "rompehielos",
  "experiencia",
  "actividad",
  "actividad_por_grados",
  "tarea",
  "cierre",
] as const;

export type BloqueTipo = (typeof BLOQUE_TIPOS)[number];

export type VarianteGrado = { grados: number[]; contenido: string };

export type Bloque = {
  tipo: BloqueTipo;
  titulo: string;
  contenido: string;
  variantes_por_grado: VarianteGrado[] | null;
  tip_profe: string | null;
};

export type BloqueInvalido = { tipo: "invalido" };
export type ReadBloque = Bloque | BloqueInvalido;

export const BLOQUE_TIPO_LABEL: Record<BloqueTipo, string> = {
  inicio: "Inicio",
  rompehielos: "Rompehielos",
  experiencia: "Experiencia intrigante",
  actividad: "Actividad",
  actividad_por_grados: "Actividad por grados",
  tarea: "Tarea",
  cierre: "Cierre",
};

/**
 * Zod schema for one bloque. When `selectedGrados` is given, variant grados are
 * constrained to that set (emitted as a JSON-schema enum for the tool).
 */
export function buildBloqueSchema(selectedGrados?: number[]) {
  const gradoItem =
    selectedGrados && selectedGrados.length > 0
      ? selectedGrados.length === 1
        ? z.literal(selectedGrados[0])
        : z.union(
            selectedGrados.map((g) => z.literal(g)) as unknown as [
              z.ZodLiteral<number>,
              z.ZodLiteral<number>,
              ...z.ZodLiteral<number>[],
            ],
          )
      : z.number().int().min(0).max(5);

  const variante = z.object({
    grados: z
      .array(gradoItem)
      .min(1)
      .max(6)
      .describe(
        "Subconjunto de los grados seleccionados. Entre todas las variantes deben cubrir cada grado exactamente una vez.",
      ),
    contenido: z.string().min(20).max(700),
  });

  return z.object({
    tipo: z
      .enum(BLOQUE_TIPOS)
      .describe(
        "inicio | rompehielos | experiencia | actividad | actividad_por_grados | tarea (para la casa) | cierre",
      ),
    titulo: z
      .string()
      .min(3)
      .max(80)
      .describe("Ej: 'Rompehielos', 'Experiencia intrigante #1', 'Actividad central', 'Tarea', 'Cierre'"),
    contenido: z
      .string()
      .min(40)
      .max(1500)
      .refine((s) => !/^\s*#/m.test(s), "contenido must be plain text, no markdown headers"),
    variantes_por_grado: z
      .array(variante)
      .min(2)
      .max(6)
      .nullable()
      .describe("Obligatorio y no vacío SOLO cuando tipo = actividad_por_grados; null en cualquier otro caso."),
    tip_profe: z
      .string()
      .min(10)
      .max(500)
      .nullable()
      .describe("Caja 'Profe, …': adaptación, alternativa o razón pedagógica. Empieza con 'Profe,'. null si no aplica."),
  });
}

const readBloqueSchema = buildBloqueSchema();

/**
 * Tolerant reader for project_phases.bloques. Never throws, never drops:
 * a malformed entry becomes { tipo: "invalido" } and is logged server-side.
 */
export function parseBloques(raw: unknown, opts: { projectId?: string } = {}): ReadBloque[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, i) => {
    const parsed = readBloqueSchema.safeParse(item);
    if (parsed.success) return parsed.data as Bloque;
    console.error(
      `[clase-viva] malformed bloque project=${opts.projectId ?? "?"} index=${i}: ${parsed.error.issues
        .map((x) => `${x.path.join(".")} ${x.message}`)
        .join("; ")}`,
    );
    return { tipo: "invalido" } as const;
  });
}

export function isValidBloque(b: ReadBloque): b is Bloque {
  return b.tipo !== "invalido";
}

export function splitParagraphs(text: string): string[] {
  return text
    .split(/\r?\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const m = flat.match(/^.+?[.!?](?=\s|$)/);
  return (m ? m[0] : flat).trim();
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * One-line, per-project summary of a fase: its gran pregunta, or the first
 * sentence of its first activity-like block. Used by collapsed fase rows in the
 * view and by the compact share image.
 */
export function faseSummaryLine(
  fase: { gran_pregunta: string | null; bloques: ReadBloque[] },
  max = 90,
): string {
  if (fase.gran_pregunta && fase.gran_pregunta.trim()) return truncate(fase.gran_pregunta.trim(), max);
  const valid = fase.bloques.filter(isValidBloque);
  const pick =
    valid.find((b) => b.tipo === "actividad" || b.tipo === "actividad_por_grados" || b.tipo === "experiencia") ??
    valid[0];
  if (!pick) return "";
  return truncate(firstSentence(pick.contenido), max);
}
