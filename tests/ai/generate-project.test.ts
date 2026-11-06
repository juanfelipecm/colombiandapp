import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateProject } from "@/lib/ai/generate-project";
import { AnthropicError, PlanValidationError } from "@/lib/ai/errors";
import { makePlan } from "../fixtures/clase-viva-plan";

// ---- Fixtures ---------------------------------------------------------------
const MATERIA_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const DBA_ID = "11111111-1111-1111-1111-111111111111";

function validPlan(): Record<string, unknown> {
  return makePlan([1], [MATERIA_ID], { [`1:${MATERIA_ID}`]: "D1" }, { titulo: "Proyecto de la quebrada" });
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
  tema_contexto: "el agua de la quebrada",
};

const badPlan = () => ({
  ...validPlan(),
  dba_targets: [{ grado: 1, materia_id: MATERIA_ID, dbas: [{ dba_token: "D99", evidencia_index: 0 }] }],
});

/** Clock that advances by `steps[i]` ms on each call after the first. */
function steppingClock(start: number, latencies: number[]) {
  // runOneAttempt reads now() at start and end; generateProject reads it once before the retry check.
  const calls: number[] = [];
  let t = start;
  const seq = [...latencies];
  return {
    now: () => {
      calls.push(t);
      const v = t;
      const step = seq.shift();
      if (step !== undefined) t += step;
      return v;
    },
    calls,
  };
}

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

  it("sends the WHOLE prior output and a Spanish issue list on retry", async () => {
    const supabase = fakeSupabase();
    const bad = badPlan();
    const anthropic = fakeAnthropic([
      { type: "tool_use", input: bad },
      { type: "tool_use", input: validPlan() },
    ]);
    await generateProject(baseInputs, { supabase, anthropic });
    const anth = anthropic as unknown as { _stream: ReturnType<typeof vi.fn> };
    const retry = (anth._stream.mock.calls[1][0] as { messages: Array<{ content: string }> }).messages[0].content;
    expect(retry).toContain(JSON.stringify(bad));
    expect(retry).toContain("Tu respuesta anterior falló la validación");
    expect(retry).toContain("Usaste el token D99");
  });

  it("uses max_tokens 24000 and the Clase Viva tool description", async () => {
    const supabase = fakeSupabase();
    const anthropic = fakeAnthropic([{ type: "tool_use", input: validPlan() }]);
    await generateProject(baseInputs, { supabase, anthropic });
    const anth = anthropic as unknown as { _stream: ReturnType<typeof vi.fn> };
    const args = anth._stream.mock.calls[0][0] as { max_tokens: number; tools: Array<{ description: string }> };
    expect(args.max_tokens).toBe(24000);
    expect(args.tools[0].description).toContain("Clase Viva");
  });

  it("retries with a timeout clamped to the remaining deadline budget", async () => {
    const supabase = fakeSupabase();
    const anthropic = fakeAnthropic([
      { type: "tool_use", input: badPlan() },
      { type: "tool_use", input: validPlan() },
    ]);
    // attempt 1 takes 60s; deadline is 150s after start → remaining = 150 - 60 - 15 = 75s ≥ 0.9×60.
    const clock = steppingClock(0, [60_000, 0, 0, 0]);
    const result = await generateProject(baseInputs, {
      supabase,
      anthropic,
      now: clock.now,
      deadlineAt: 150_000,
    });
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[1].status).toBe("success");
  });

  it("skips the retry when the remaining budget is under 0.9× attempt-1 latency", async () => {
    const supabase = fakeSupabase();
    const anthropic = fakeAnthropic([
      { type: "tool_use", input: badPlan() },
      { type: "tool_use", input: validPlan() },
    ]);
    // attempt 1 takes 170s; deadline 280s → remaining = 280 - 170 - 15 = 95s < 153s.
    const clock = steppingClock(0, [170_000, 0, 0]);
    const err = await generateProject(baseInputs, {
      supabase,
      anthropic,
      now: clock.now,
      deadlineAt: 280_000,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(PlanValidationError);
    const anth = anthropic as unknown as { _stream: ReturnType<typeof vi.fn> };
    expect(anth._stream).toHaveBeenCalledTimes(1);
    const attempts = (err as { cause?: Array<{ status: string }> }).cause;
    expect(attempts?.[0].status).toBe("validation_failed");
  });

  it("aborts the stream when an attempt times out", async () => {
    const supabase = fakeSupabase();
    const abort = vi.fn();
    const anthropic = {
      messages: {
        stream: vi.fn(() => ({
          abort,
          finalMessage: () => new Promise(() => {}), // never resolves
        })),
      },
    } as unknown as import("@anthropic-ai/sdk").default;
    const err = await generateProject(baseInputs, { supabase, anthropic, timeoutMs: 20 }).catch((e) => e);
    expect(err).toBeInstanceOf(AnthropicError);
    expect(abort).toHaveBeenCalledOnce();
  });

  it("records max_tokens truncation on the attempt", async () => {
    const supabase = fakeSupabase();
    const anthropic = {
      messages: {
        stream: vi.fn(() => ({
          finalMessage: async () => ({
            stop_reason: "max_tokens",
            content: [{ type: "tool_use", id: "t", name: "emit_plan", input: { titulo: "corto" } }],
            usage: { input_tokens: 10, output_tokens: 24000 },
          }),
        })),
      },
    } as unknown as import("@anthropic-ai/sdk").default;
    const err = await generateProject(baseInputs, { supabase, anthropic }).catch((e) => e);
    expect(err).toBeInstanceOf(PlanValidationError);
    const attempts = (err as { cause?: Array<{ error_message: string | null }> }).cause ?? [];
    expect(attempts).toHaveLength(2);
    for (const a of attempts) expect(a.error_message).toMatch(/^stop_reason=max_tokens after 24000/);
  });
});
