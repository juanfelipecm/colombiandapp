import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateProject } from "@/lib/ai/generate-project";
import { AnthropicError, PlanValidationError } from "@/lib/ai/errors";

// ---- Fixtures ---------------------------------------------------------------
const MATERIA_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const DBA_ID = "11111111-1111-1111-1111-111111111111";

function validPlan(): Record<string, unknown> {
  return {
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
  };
}

function fakeSupabase(): SupabaseClient {
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

  const final = { data: rows, error: null };
  const chainable = {} as {
    select: () => typeof chainable;
    in: () => typeof chainable;
    order: () => typeof chainable;
    then: (resolve: (v: typeof final) => void) => void;
  };
  chainable.select = () => chainable;
  chainable.in = () => chainable;
  chainable.order = () => chainable;
  chainable.then = (resolve) => resolve(final);

  return {
    from: () => chainable,
  } as unknown as SupabaseClient;
}

type ToolUseReply = { type: "tool_use"; input: unknown; name?: string };
type TextReply = { type: "text"; text: string };
type Reply = ToolUseReply | TextReply | "empty";

/**
 * Mock Anthropic that returns a sequence of responses. Each `Reply` becomes
 * one `stream().finalMessage()` call. Tool-use replies wrap into a single
 * tool_use content block shaped like the real SDK.
 */
function fakeAnthropic(replies: Reply[]) {
  let call = 0;
  const stream = vi.fn(() => {
    const reply = replies[call] ?? replies[replies.length - 1];
    call += 1;
    return {
      finalMessage: async () => {
        if (reply === "empty") {
          return {
            content: [],
            usage: { input_tokens: 0, output_tokens: 0 },
          };
        }
        if (reply.type === "text") {
          return {
            content: [{ type: "text", text: reply.text }],
            usage: { input_tokens: 1000, output_tokens: 2000 },
          };
        }
        return {
          content: [
            {
              type: "tool_use",
              id: `tool_${call}`,
              name: reply.name ?? "emit_plan",
              input: reply.input,
            },
          ],
          usage: { input_tokens: 1000, output_tokens: 2000 },
        };
      },
    };
  });
  return {
    messages: { stream },
    _stream: stream,
  } as unknown as import("@anthropic-ai/sdk").default & { _stream: typeof stream };
}

const baseInputs = {
  grados: [1],
  materia_ids: [MATERIA_ID],
  studentCountsByGrade: { 1: 3 },
  duracion_semanas: 1 as const,
  tema_contexto: "el agua de la quebrada",
};

describe("generateProject", () => {
  it("succeeds on first attempt with a valid tool_use", async () => {
    const supabase = fakeSupabase();
    const anthropic = fakeAnthropic([{ type: "tool_use", input: validPlan() }]);
    const result = await generateProject(baseInputs, { supabase, anthropic });

    expect(result.plan.titulo).toContain("quebrada");
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0].status).toBe("success");
    expect(result.attempts[0].attempt_number).toBe(1);
    expect(result.attempts[0].tokens_input).toBe(1000);
    expect(result.attempts[0].tokens_output).toBe(2000);
  });

  it("retries and succeeds on second attempt after semantic validation failure", async () => {
    const supabase = fakeSupabase();
    // Attempt 1: structurally valid but semantically wrong (unknown DBA token).
    const badPlan = {
      ...validPlan(),
      dba_targets: [
        {
          grado: 1,
          materia_id: MATERIA_ID,
          dbas: [{ dba_token: "D99", evidencia_index: 0 }], // unknown token
        },
      ],
    };
    const anthropic = fakeAnthropic([
      { type: "tool_use", input: badPlan },
      { type: "tool_use", input: validPlan() },
    ]);
    const result = await generateProject(baseInputs, { supabase, anthropic });

    expect(result.plan.titulo).toContain("quebrada");
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0].status).toBe("validation_failed");
    expect(result.attempts[1].status).toBe("success");
  });

  it("throws PlanValidationError when both attempts fail validation", async () => {
    const supabase = fakeSupabase();
    // Unknown DBA token — fails the semantic validator on both attempts.
    const bad = {
      ...validPlan(),
      dba_targets: [
        {
          grado: 1,
          materia_id: MATERIA_ID,
          dbas: [{ dba_token: "D99", evidencia_index: 0 }],
        },
      ],
    };
    const anthropic = fakeAnthropic([
      { type: "tool_use", input: bad },
      { type: "tool_use", input: bad },
    ]);

    await expect(generateProject(baseInputs, { supabase, anthropic })).rejects.toBeInstanceOf(
      PlanValidationError,
    );
  });

  it("throws AnthropicError if the response omits the expected tool_use block", async () => {
    const supabase = fakeSupabase();
    const anthropic = fakeAnthropic([{ type: "text", text: "oops I wrote prose" }]);

    await expect(generateProject(baseInputs, { supabase, anthropic })).rejects.toBeInstanceOf(
      AnthropicError,
    );
  });

  it("throws AnthropicError if the response is empty", async () => {
    const supabase = fakeSupabase();
    const anthropic = fakeAnthropic(["empty"]);

    await expect(generateProject(baseInputs, { supabase, anthropic })).rejects.toBeInstanceOf(
      AnthropicError,
    );
  });

  it("forces tool_choice and passes the generated input_schema to Anthropic", async () => {
    const supabase = fakeSupabase();
    const anthropic = fakeAnthropic([{ type: "tool_use", input: validPlan() }]);
    await generateProject(baseInputs, { supabase, anthropic });

    const anth = anthropic as unknown as { _stream: ReturnType<typeof vi.fn> };
    const args = anth._stream.mock.calls[0][0] as {
      tools: Array<{ name: string; input_schema: Record<string, unknown> }>;
      tool_choice: { type: string; name: string };
    };
    expect(args.tool_choice).toEqual({ type: "tool", name: "emit_plan" });
    expect(args.tools).toHaveLength(1);
    expect(args.tools[0].name).toBe("emit_plan");
    expect(args.tools[0].input_schema.type).toBe("object");
    // Grade enum must include the selected grade in the actividades schema.
    const fases = (args.tools[0].input_schema.properties as Record<string, unknown>).fases;
    expect(fases).toBeDefined();
  });

  it("unwraps { input: <plan> } when Opus double-wraps the tool payload", async () => {
    const supabase = fakeSupabase();
    // Simulate the observed Opus quirk where tool_use.input arrives as
    // { input: { ...actualPlan... } } instead of { ...actualPlan... }.
    const doubleWrapped = { input: validPlan() };
    const anthropic = fakeAnthropic([{ type: "tool_use", input: doubleWrapped }]);
    const result = await generateProject(baseInputs, { supabase, anthropic });

    expect(result.plan.titulo).toContain("quebrada");
    expect(result.attempts[0].status).toBe("success");
  });

  it("unwraps { plan: <plan> } when Opus wraps under a 'plan' key", async () => {
    const supabase = fakeSupabase();
    const wrapped = { plan: validPlan() };
    const anthropic = fakeAnthropic([{ type: "tool_use", input: wrapped }]);
    const result = await generateProject(baseInputs, { supabase, anthropic });

    expect(result.plan.titulo).toContain("quebrada");
    expect(result.attempts[0].status).toBe("success");
  });

  it("does NOT unwrap when the single-key wrapper's inner object is not a plan", async () => {
    const supabase = fakeSupabase();
    const spuriousInput = { input: { foo: "bar" } };
    const spuriousPlan = { plan: { foo: "bar" } };
    const anthropic = fakeAnthropic([
      { type: "tool_use", input: spuriousInput },
      { type: "tool_use", input: spuriousPlan },
    ]);
    await expect(generateProject(baseInputs, { supabase, anthropic })).rejects.toBeInstanceOf(
      PlanValidationError,
    );
  });

  it("wraps the prior tool input in <previous_output> tags on retry", async () => {
    const supabase = fakeSupabase();
    const bad = {
      ...validPlan(),
      dba_targets: [
        {
          grado: 1,
          materia_id: MATERIA_ID,
          dbas: [{ dba_token: "D99", evidencia_index: 0 }],
        },
      ],
    };
    const anthropic = fakeAnthropic([
      { type: "tool_use", input: bad },
      { type: "tool_use", input: validPlan() },
    ]);
    await generateProject(baseInputs, { supabase, anthropic });

    const anth = anthropic as unknown as { _stream: ReturnType<typeof vi.fn> };
    const retryCall = anth._stream.mock.calls[1][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const retryUserPrompt = retryCall.messages[0].content;
    expect(retryUserPrompt).toContain("<previous_output>");
    expect(retryUserPrompt).toContain("</previous_output>");
    // Should include the serialized bad input so the model sees what to fix.
    expect(retryUserPrompt).toContain("D99");
  });
});
