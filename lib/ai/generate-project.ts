import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDbaContext, type DbaContext } from "./dba-context";
import { AnthropicError, PlanValidationError } from "./errors";
import {
  PLAN_TOOL_NAME,
  PROMPT_MODEL,
  PROMPT_VERSION,
  buildPlanJsonSchema,
  type GeneratedPlan,
} from "./plan-schema";
import { validatePlan } from "./plan-validator";
import { SYSTEM_PROMPT, buildUserPrompt, type WizardInputs } from "./prompt-template";

export type GenerateAttempt = {
  attempt_number: 1 | 2;
  status: "success" | "validation_failed" | "api_error" | "timeout";
  tokens_input: number | null;
  tokens_output: number | null;
  latency_ms: number;
  raw_output: string | null;
  error_message: string | null;
};

export type GenerateResult = {
  plan: GeneratedPlan;
  ctx: DbaContext;
  prompt_version: string;
  model: string;
  attempts: GenerateAttempt[];
};

const DEFAULT_MAX_TOKENS = 16000;
// 140s per attempt. Two attempts worst case = 280s, fits under the route's
// 300s maxDuration with buffer. Observed latencies for successful runs are
// 52-120s, so 140s is a comfortable ceiling.
const DEFAULT_TIMEOUT_MS = 140_000;

export type GenerateDeps = {
  supabase: SupabaseClient;
  anthropic?: Anthropic;
  maxTokens?: number;
  timeoutMs?: number;
};

/**
 * Orchestrates one logical generation: fetch DBAs, build prompt, call Anthropic
 * with a forced tool_use so the SDK returns a structured object (never a JSON
 * string we'd have to parse), validate semantically. Retries ONCE on validation
 * failure with the prior errors attached as a hint.
 *
 * Throws AnthropicError on network/API errors. Throws PlanValidationError if
 * both attempts fail validation. The `attempts` array is attached to both
 * thrown errors via `.cause` so callers can persist them.
 */
export async function generateProject(
  inputs: WizardInputs,
  deps: GenerateDeps,
): Promise<GenerateResult> {
  const anthropic =
    deps.anthropic ??
    new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  const maxTokens = deps.maxTokens ?? DEFAULT_MAX_TOKENS;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const ctx = await buildDbaContext(deps.supabase, inputs.grados, inputs.materia_ids);

  const userPrompt = buildUserPrompt(inputs, ctx);
  const inputSchema = buildPlanJsonSchema(inputs.grados);
  const attempts: GenerateAttempt[] = [];

  // Attempt 1
  const attempt1 = await runOneAttempt({
    anthropic,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    model: PROMPT_MODEL,
    maxTokens,
    timeoutMs,
    inputSchema,
    attemptNumber: 1,
  });
  attempts.push(attempt1.entry);

  if (attempt1.entry.status === "success" && attempt1.raw !== null) {
    try {
      const { plan } = validatePlan(attempt1.raw, ctx, {
        grados: inputs.grados,
        materiaIds: inputs.materia_ids,
      });
      return { plan, ctx, prompt_version: PROMPT_VERSION, model: PROMPT_MODEL, attempts };
    } catch (err) {
      if (err instanceof PlanValidationError) {
        attempt1.entry.status = "validation_failed";
        attempt1.entry.error_message = err.issues.map((i) => JSON.stringify(i)).join("; ");
        // Fall through to attempt 2.
      } else {
        throw err;
      }
    }
  } else if (attempt1.entry.status !== "success") {
    // API error or timeout on first attempt — no retry; surface immediately.
    throw new AnthropicError(attempt1.entry.error_message ?? "Anthropic call failed", {
      cause: attempts,
    });
  }

  // Attempt 2 (with retry hint built from attempt 1's validation issues)
  const retryHint = buildRetryHint(attempt1.entry, attempt1.raw);
  const attempt2 = await runOneAttempt({
    anthropic,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `${userPrompt}\n\n---\n${retryHint}`,
    model: PROMPT_MODEL,
    maxTokens,
    timeoutMs,
    inputSchema,
    attemptNumber: 2,
  });
  attempts.push(attempt2.entry);

  if (attempt2.entry.status !== "success" || attempt2.raw === null) {
    throw new AnthropicError(attempt2.entry.error_message ?? "Anthropic retry failed", {
      cause: attempts,
    });
  }

  try {
    const { plan } = validatePlan(attempt2.raw, ctx, {
      grados: inputs.grados,
      materiaIds: inputs.materia_ids,
    });
    return { plan, ctx, prompt_version: PROMPT_VERSION, model: PROMPT_MODEL, attempts };
  } catch (err) {
    if (err instanceof PlanValidationError) {
      attempt2.entry.status = "validation_failed";
      attempt2.entry.error_message = err.issues.map((i) => JSON.stringify(i)).join("; ");
      const finalErr = new PlanValidationError(err.issues, err.rawOutput);
      (finalErr as Error & { cause?: unknown }).cause = attempts;
      throw finalErr;
    }
    throw err;
  }
}

function buildRetryHint(entry: GenerateAttempt, priorInput: unknown): string {
  const hint =
    "Tu llamada anterior a `emit_plan` falló validación semántica. Corrige los errores listados y vuelve a llamar a la herramienta.";
  const detail = entry.error_message ?? "";
  // `priorInput` is the tool_use `input` object — serialize for the hint.
  // Wrap in <previous_output> so the model treats it as untrusted data, not instructions.
  const serialized = priorInput != null ? JSON.stringify(priorInput).slice(0, 4000) : "";
  const wrapped = serialized
    ? `\n\n<previous_output>\n${serialized}\n</previous_output>\n`
    : "";
  return `${hint}\n\nErrores:\n${detail}${wrapped}`;
}

type OneAttemptInput = {
  anthropic: Anthropic;
  systemPrompt: string;
  userPrompt: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;
  inputSchema: Anthropic.Messages.Tool.InputSchema;
  attemptNumber: 1 | 2;
};

type OneAttemptResult = {
  entry: GenerateAttempt;
  raw: unknown;
};

async function runOneAttempt(input: OneAttemptInput): Promise<OneAttemptResult> {
  const start = Date.now();
  const entry: GenerateAttempt = {
    attempt_number: input.attemptNumber,
    status: "api_error",
    tokens_input: null,
    tokens_output: null,
    latency_ms: 0,
    raw_output: null,
    error_message: null,
  };

  try {
    // Streaming stays active for slow Opus responses (60-120s); `finalMessage()`
    // assembles the full response at the end. tool_choice forces the model to
    // emit exactly one `emit_plan` tool_use block, which the SDK returns as a
    // typed object in `input`.
    const stream = input.anthropic.messages.stream({
      model: input.model,
      max_tokens: input.maxTokens,
      system: input.systemPrompt,
      messages: [{ role: "user", content: input.userPrompt }],
      tools: [
        {
          name: PLAN_TOOL_NAME,
          description:
            "Emite el proyecto ABP generado como datos estructurados. Respeta las longitudes y enums del esquema.",
          input_schema: input.inputSchema,
        },
      ],
      tool_choice: { type: "tool", name: PLAN_TOOL_NAME },
    });
    const response = await withTimeout(stream.finalMessage(), input.timeoutMs);

    entry.latency_ms = Date.now() - start;
    entry.tokens_input = response.usage?.input_tokens ?? null;
    entry.tokens_output = response.usage?.output_tokens ?? null;

    const toolUseBlock = response.content.find(
      (block): block is Anthropic.Messages.ToolUseBlock => block.type === "tool_use",
    );
    if (!toolUseBlock || toolUseBlock.name !== PLAN_TOOL_NAME) {
      entry.error_message = `Anthropic did not emit the expected tool call (${PLAN_TOOL_NAME})`;
      return { entry, raw: null };
    }

    // Store a stringified copy for audit/log purposes.
    entry.raw_output = safeStringify(toolUseBlock.input);
    entry.status = "success";
    return { entry, raw: toolUseBlock.input };
  } catch (err) {
    entry.latency_ms = Date.now() - start;
    if (err instanceof TimeoutError) {
      entry.status = "timeout";
      entry.error_message = `Anthropic call exceeded ${input.timeoutMs}ms`;
    } else if (err instanceof Anthropic.APIError) {
      entry.status = "api_error";
      entry.error_message = `Anthropic API error ${err.status}: ${err.message}`;
    } else {
      entry.status = "api_error";
      entry.error_message = err instanceof Error ? err.message : String(err);
    }
    return { entry, raw: null };
  }
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[unstringifiable tool input]";
  }
}

class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Timeout after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}
