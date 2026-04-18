import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateProject } from "@/lib/ai/generate-project";
import { AnthropicError, PlanValidationError } from "@/lib/ai/errors";

// ---- Fixtures ---------------------------------------------------------------
const MATERIA_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const DBA_ID = "11111111-1111-1111-1111-111111111111";

function validPlanJson(): string {
  return JSON.stringify({
    titulo: "Proyecto de la quebrada",
    pregunta_guia: "¿Qué nos enseña la quebrada sobre el agua?",
    producto_final: "Un mural colectivo con observaciones del agua.",
    cierre_actividad: "Presentamos el mural a las familias el viernes.",
    cierre_evaluacion: "Evaluamos si cada grupo explicó su contribución.",
    materiales: ["papel", "lápices", "hojas"],
    dba_targets: [
      {
        grado: 1,
        materia_id: MATERIA_ID,
        dbas: [{ dba_token: "D1", evidencia_index: 0 }],
      },
    ],
    fases: [
      {
        orden: 1,
        nombre: "Exploración",
        dias_label: "Lunes-Martes",
        descripcion: "Los estudiantes observan la quebrada y anotan lo que ven.",
        actividades: {
          "1": {
            [MATERIA_ID]: {
              tarea: "Dibuja tres fuentes de agua que veas cerca de la escuela.",
              evidencia_observable: "El estudiante entrega un dibujo con 3 elementos.",
              dba_tokens: ["D1"],
            },
          },
        },
      },
      {
        orden: 2,
        nombre: "Síntesis",
        dias_label: "Miércoles-Viernes",
        descripcion: "Los estudiantes combinan sus dibujos en un mural colectivo.",
        actividades: {
          "1": {
            [MATERIA_ID]: {
              tarea: "Cuenta cuántas fuentes encontraste y agrúpalas.",
              evidencia_observable: "El estudiante dice un número y lo compara.",
              dba_tokens: ["D1"],
            },
          },
        },
      },
    ],
  });
}

function fakeSupabase(): SupabaseClient {
  // Mimics the chained builder enough to return the single DBA we need.
  const rows = [
    {
      id: DBA_ID,
      grado: 1,
      numero: 1,
      enunciado: "Identifica medios de comunicación.",
      materia_id: MATERIA_ID,
      materias: { slug: "lenguaje", nombre: "Lenguaje" },
      evidencias_aprendizaje: [{ numero: 1, descripcion: "Identifica un medio específico." }],
    },
  ];

  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  const final = { data: rows, error: null };
  const chainable = { ...builder, then: undefined } as unknown as {
    select: () => typeof chainable;
    in: () => typeof chainable;
    order: () => typeof chainable;
    then: (resolve: (v: typeof final) => void) => void;
  };
  chainable.select = () => chainable;
  chainable.in = () => chainable;
  chainable.order = () => chainable;
  // Make it thenable so `await builder` resolves the rows
  chainable.then = (resolve) => resolve(final);

  const client = {
    from: () => chainable,
  } as unknown as SupabaseClient;

  return client;
}

function fakeAnthropic(replies: string[]) {
  // Production calls `anthropic.messages.stream(...).finalMessage()`; mock that shape.
  let call = 0;
  return {
    messages: {
      stream: vi.fn(() => {
        const text = replies[call] ?? replies[replies.length - 1];
        call += 1;
        return {
          finalMessage: async () => ({
            content: [{ type: "text", text }],
            usage: { input_tokens: 1000, output_tokens: 2000 },
          }),
        };
      }),
    },
  } as unknown as import("@anthropic-ai/sdk").default;
}

const baseInputs = {
  grados: [1],
  materia_ids: [MATERIA_ID],
  studentCountsByGrade: { 1: 3 },
  duracion_semanas: 1 as const,
  tema_contexto: "el agua de la quebrada",
};

describe("generateProject", () => {
  it("succeeds on first attempt with valid JSON", async () => {
    const supabase = fakeSupabase();
    const anthropic = fakeAnthropic([validPlanJson()]);
    const result = await generateProject(baseInputs, { supabase, anthropic });

    expect(result.plan.titulo).toContain("quebrada");
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0].status).toBe("success");
    expect(result.attempts[0].attempt_number).toBe(1);
    expect(result.attempts[0].tokens_input).toBe(1000);
    expect(result.attempts[0].tokens_output).toBe(2000);
  });

  it("retries and succeeds on second attempt after validation failure", async () => {
    const supabase = fakeSupabase();
    const badJson = JSON.stringify({ titulo: "incompleto" });
    const anthropic = fakeAnthropic([badJson, validPlanJson()]);
    const result = await generateProject(baseInputs, { supabase, anthropic });

    expect(result.plan.titulo).toContain("quebrada");
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0].status).toBe("validation_failed");
    expect(result.attempts[1].status).toBe("success");
  });

  it("throws PlanValidationError when both attempts fail validation", async () => {
    const supabase = fakeSupabase();
    const badJson = JSON.stringify({ titulo: "incompleto" });
    const anthropic = fakeAnthropic([badJson, badJson]);

    await expect(generateProject(baseInputs, { supabase, anthropic })).rejects.toBeInstanceOf(
      PlanValidationError,
    );
  });

  it("throws AnthropicError if the response contains no text block", async () => {
    const supabase = fakeSupabase();
    const anthropic = {
      messages: {
        stream: vi.fn(() => ({
          finalMessage: async () => ({
            content: [],
            usage: { input_tokens: 0, output_tokens: 0 },
          }),
        })),
      },
    } as unknown as import("@anthropic-ai/sdk").default;

    await expect(generateProject(baseInputs, { supabase, anthropic })).rejects.toBeInstanceOf(
      AnthropicError,
    );
  });
});
