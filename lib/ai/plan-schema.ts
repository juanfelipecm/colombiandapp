import { z } from "zod";

export const PROMPT_VERSION = "pbl-v1";
export const PROMPT_MODEL = "claude-opus-4-7";

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
 * Build the Zod schema for a generated plan, keyed by the actual grades the teacher selected.
 * The grade-string-keyed record forces the model to emit one entry per selected grade;
 * missing grades fail validation fast.
 */
export function buildPlanSchema(selectedGrados: number[]) {
  if (selectedGrados.length === 0) {
    throw new Error("buildPlanSchema: selectedGrados must be non-empty");
  }

  const gradoStrings = selectedGrados.map(String) as [string, ...string[]];
  const gradoEnum = z.enum(gradoStrings);

  const dbaRef = z.object({
    dba_token: dbaTokenSchema,
    evidencia_index: z.number().int().min(0).max(20).nullable(),
  });

  const activity = z.object({
    tarea: z.string().min(10).max(600),
    evidencia_observable: z.string().min(5).max(400),
    dba_tokens: z.array(dbaTokenSchema).min(1).max(2),
  });

  const phase = z.object({
    orden: z.number().int().min(1).max(4),
    nombre: z.string().min(3).max(80),
    dias_label: z.string().min(3).max(60),
    descripcion: z.string().min(10).max(800),
    actividades: z.record(
      gradoEnum,
      z.record(materiaIdSchema, activity),
    ),
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
