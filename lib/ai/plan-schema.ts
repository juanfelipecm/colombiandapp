import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const PROMPT_VERSION = "pbl-v1";
export const PROMPT_MODEL = "claude-sonnet-4-6";
export const PLAN_TOOL_NAME = "emit_plan";

const dbaTokenSchema = z.string().regex(/^D\d+$/, "DBA token must match D<number>");
const materiaIdSchema = z.string().uuid();

export type PlanDbaRef = {
  dba_token: string;
  /** Index into the DBA's evidencias list. null is valid only for Inglés (no evidencias). */
  evidencia_index: number | null;
};

export type PlanActivity = {
  tarea: string;
  evidencia_observable: string;
  dba_tokens: string[];
};

export type PlanPhase = {
  orden: number;
  nombre: string;
  dias_label: string;
  descripcion: string;
  actividades: Record<string, Record<string, PlanActivity>>;
};

export type PlanDbaTarget = {
  grado: number;
  materia_id: string;
  dbas: PlanDbaRef[];
};

export type GeneratedPlan = {
  titulo: string;
  pregunta_guia: string;
  producto_final: string;
  cierre_actividad: string;
  cierre_evaluacion: string;
  materiales: string[];
  dba_targets: PlanDbaTarget[];
  fases: PlanPhase[];
};

/**
 * Build the Zod schema for a generated plan, keyed by the actual grades AND
 * materia UUIDs the teacher selected. Both layers are materialized as specific
 * property keys (not records keyed by regex), so:
 *   - missing grades fail validation fast
 *   - missing materias fail validation fast
 *   - Anthropic tool_use sees an exhaustively-keyed schema, which is the
 *     strongest guidance we can give it (tool_use schemas are coaching, not
 *     hard constraints — tight keys reduce drift)
 *
 * Both `selectedGrados` and `selectedMateriaIds` must be non-empty.
 */
export function buildPlanSchema(
  selectedGrados: number[],
  selectedMateriaIds: string[],
) {
  if (selectedGrados.length === 0) {
    throw new Error("buildPlanSchema: selectedGrados must be non-empty");
  }
  if (selectedMateriaIds.length === 0) {
    throw new Error("buildPlanSchema: selectedMateriaIds must be non-empty");
  }

  const dbaRef = z.object({
    dba_token: dbaTokenSchema,
    evidencia_index: z.number().int().min(0).max(20).nullable(),
  });

  const activity = z.object({
    tarea: z.string().min(10).max(600),
    evidencia_observable: z.string().min(5).max(400),
    dba_tokens: z.array(dbaTokenSchema).min(1).max(2),
  });

  // Materia layer: one explicit key per selected materia UUID.
  const perMateriaShape: Record<string, typeof activity> = {};
  for (const materiaId of selectedMateriaIds) {
    // Validate the caller gave us real UUIDs so we don't ship junk keys into the tool schema.
    materiaIdSchema.parse(materiaId);
    perMateriaShape[materiaId] = activity;
  }
  const perMateria = z.object(perMateriaShape);

  // Grade layer: one explicit key per selected grade (as string).
  const perGradoShape: Record<string, typeof perMateria> = {};
  for (const grado of selectedGrados) {
    perGradoShape[String(grado)] = perMateria;
  }
  const actividadesSchema = z.object(perGradoShape);

  const phase = z.object({
    orden: z.number().int().min(1).max(4),
    nombre: z.string().min(3).max(80),
    dias_label: z.string().min(3).max(60),
    descripcion: z.string().min(10).max(800),
    actividades: actividadesSchema,
  });

  const dbaTarget = z.object({
    grado: z.number().int().min(0).max(5),
    materia_id: materiaIdSchema,
    dbas: z.array(dbaRef).min(1).max(2),
  });

  return z.object({
    titulo: z.string().min(8).max(120),
    pregunta_guia: z.string().min(15).max(280),
    producto_final: z.string().min(10).max(280),
    cierre_actividad: z.string().min(15).max(600),
    cierre_evaluacion: z.string().min(15).max(600),
    materiales: z.array(z.string().min(2).max(80)).min(3).max(15),
    dba_targets: z.array(dbaTarget),
    fases: z.array(phase).min(2).max(4),
  });
}

export type PlanSchema = ReturnType<typeof buildPlanSchema>;

/**
 * Build the JSON Schema that Anthropic uses as the tool's `input_schema`.
 * Derived from `buildPlanSchema` so Zod stays the single source of truth.
 *
 * `target: "openApi3"` emits a root-object JSON Schema (no top-level $ref wrapper)
 * that Anthropic's tool_use accepts directly. The only post-processing needed is
 * stripping schema-metadata keys Anthropic doesn't want.
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
