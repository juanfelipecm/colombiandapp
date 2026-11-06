import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { buildBloqueSchema, type Bloque } from "@/lib/clase-viva/bloques";
import { ETAPAS, type Etapa } from "@/lib/clase-viva/etapas";

export const PROMPT_VERSION = "clase-viva-v1";
export const PROMPT_MODEL = "claude-opus-4-7";
export const PLAN_TOOL_NAME = "emit_plan";

const dbaTokenSchema = z.string().regex(/^D\d+$/, "DBA token must match D<number>");
const materiaIdSchema = z.string().uuid();

export type PlanDbaRef = {
  dba_token: string;
  /** Index into the DBA's evidencias list. null is valid only for Inglés (no evidencias). */
  evidencia_index: number | null;
};

export type PlanDbaTarget = {
  grado: number;
  materia_id: string;
  dbas: PlanDbaRef[];
};

export type PlanFase = {
  orden: number;
  etapa: Etapa;
  gran_pregunta: string | null;
  bloques: Bloque[];
};

export type GeneratedPlan = {
  titulo: string;
  pregunta_guia: string;
  tarea_previa: string | null;
  materiales: string[];
  dba_targets: PlanDbaTarget[];
  fases: PlanFase[];
};

/**
 * Zod schema for a Clase Viva plan (prompt_version clase-viva-v1).
 *
 *   plan ─┬─ titulo, pregunta_guia, tarea_previa?, materiales[3..15]
 *         ├─ dba_targets[]  (one per grado × materia; 1–2 DBA tokens each)
 *         └─ fases[5]       (orden 1..5, etapa fixed per orden — checked in the validator)
 *              └─ bloques[2..8] { tipo, titulo, contenido, variantes_por_grado?, tip_profe? }
 *
 * Grades and materia UUIDs are materialised as enums so the tool schema the
 * model sees only allows the teacher's selection. `.nullable()` (not
 * `.optional()`) keeps every key required, so the model emits explicit nulls.
 */
export function buildPlanSchema(selectedGrados: number[], selectedMateriaIds: string[]) {
  if (selectedGrados.length === 0) {
    throw new Error("buildPlanSchema: selectedGrados must be non-empty");
  }
  if (selectedMateriaIds.length === 0) {
    throw new Error("buildPlanSchema: selectedMateriaIds must be non-empty");
  }
  for (const materiaId of selectedMateriaIds) materiaIdSchema.parse(materiaId);

  const dbaRef = z.object({
    dba_token: dbaTokenSchema,
    evidencia_index: z.number().int().min(0).max(20).nullable(),
  });

  const dbaTarget = z.object({
    grado: z.number().int().min(0).max(5),
    materia_id: z.enum(selectedMateriaIds as [string, ...string[]]),
    dbas: z.array(dbaRef).min(1).max(2),
  });

  const fase = z.object({
    orden: z.number().int().min(1).max(5),
    etapa: z
      .enum(ETAPAS)
      .describe(
        "1=despertar_curiosidad 2=indagar_investigar 3=crear 4=reflexionar 5=compartir; debe coincidir con orden",
      ),
    gran_pregunta: z
      .string()
      .min(10)
      .max(200)
      .nullable()
      .describe("La 'Gran pregunta del día' de esta fase. null solo si la fase no la necesita."),
    bloques: z.array(buildBloqueSchema(selectedGrados)).min(2).max(8),
  });

  return z.object({
    titulo: z.string().min(8).max(120),
    pregunta_guia: z.string().min(15).max(280),
    tarea_previa: z
      .string()
      .min(20)
      .max(600)
      .nullable()
      .describe("'¡Tarea antes de empezar!', escrita como instrucción para la maestra. null si no hay."),
    materiales: z.array(z.string().min(2).max(80)).min(3).max(15),
    dba_targets: z.array(dbaTarget),
    fases: z.array(fase).length(5),
  });
}

export type PlanSchema = ReturnType<typeof buildPlanSchema>;

/**
 * Build the JSON Schema that Anthropic uses as the tool's `input_schema`.
 * Derived from `buildPlanSchema` so Zod stays the single source of truth.
 */
export function buildPlanJsonSchema(
  selectedGrados: number[],
  selectedMateriaIds: string[],
): Anthropic.Messages.Tool.InputSchema {
  const zod = buildPlanSchema(selectedGrados, selectedMateriaIds);
  const raw = zodToJsonSchema(zod, { target: "openApi3" }) as Record<string, unknown>;
  delete raw.$schema;
  delete raw.definitions;
  if (raw.type !== "object") {
    throw new Error("buildPlanJsonSchema: expected root type 'object'");
  }
  return raw as Anthropic.Messages.Tool.InputSchema;
}
