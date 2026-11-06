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

const DEFAULT_MAX_TOKENS = 24000;
// 200s per attempt. A Clase Viva plan (5 narrative fases) is ~9-15k output
// tokens; at the ~70-150 tok/s observed for Opus 4.7 that is 65-200s.
const DEFAULT_TIMEOUT_MS = 200_000;
/** Time kept free after the last attempt for the RPC + log writes. */
export const RPC_RESERVE_MS = 15_000;
/** Attempt 2 only runs if the remaining budget is at least this share of attempt 1's latency. */
export const RETRY_LATENCY_FACTOR = 0.9;

export type GenerateDeps = {
  supabase: SupabaseClient;
  anthropic?: Anthropic;
  maxTokens?: number;
  timeoutMs?: number;
  /**
   * Wall-clock deadline (epoch ms) for the whole generation, set by the route
   * from its maxDuration. Attempt 2 is clamped to it, or skipped when it could
   * not plausibly finish.
   */
  deadlineAt?: number;
  /** Clock, injectable for tests. */
  now?: () => number;
};

/**
 * Orchestrates one logical generation: fetch DBAs, build prompt, call Anthropic
 * with a forced tool_use so the SDK returns a structured object (never a JSON
 * string we'd have to parse), validate semantically. Retries ONCE on validation
 * failure with the prior errors attached as a hint.
 *
 *   attempt 1 (≤ timeoutMs, stream aborted on timeout)
 *        │ valid ───────────────────────────────► return plan
 *        │ PlanValidationError
 *        ▼
 *   remaining = deadlineAt − now − RPC_RESERVE_MS
 *   remaining < 0.9 × attempt1.latency ? ───────► throw PlanValidationError (no retry)
 *        │ otherwise
 *        ▼
 *   attempt 2 (≤ min(timeoutMs, remaining), full <previous_output> + Spanish hint)
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
  const now = deps.now ?? Date.now;

  const ctx = await buildDbaContext(deps.supabase, inputs.grados, inputs.materia_ids);

  const userPrompt = buildUserPrompt(inputs, ctx);
  const inputSchema = buildPlanJsonSchema(inputs.grados, inputs.materia_ids);
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
    now,
  });
  attempts.push(attempt1.entry);

  let firstError: PlanValidationError | null = null;
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
        attempt1.entry.error_message = withIssues(attempt1.entry.error_message, err);
        firstError = err;
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

  // Deadline-aware retry: only run attempt 2 if it can plausibly finish.
  let attempt2Timeout = timeoutMs;
  if (deps.deadlineAt !== undefined) {
    const remaining = deps.deadlineAt - now() - RPC_RESERVE_MS;
    if (remaining <= 0 || remaining < RETRY_LATENCY_FACTOR * attempt1.entry.latency_ms) {
      const base = firstError ?? new PlanValidationError([], attempt1.entry.raw_output ?? "");
      const skipped = new PlanValidationError(base.issues, base.rawOutput);
      (skipped as Error & { cause?: unknown }).cause = attempts;
      throw skipped;
    }
    attempt2Timeout = Math.min(timeoutMs, remaining);
  }

  // Attempt 2 (with retry hint built from attempt 1's validation issues)
  const retryHint = buildRetryHint(firstError, attempt1.raw);
  const attempt2 = await runOneAttempt({
    anthropic,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: `${userPrompt}\n\n---\n${retryHint}`,
    model: PROMPT_MODEL,
    maxTokens,
    timeoutMs: attempt2Timeout,
    inputSchema,
    attemptNumber: 2,
    now,
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
      attempt2.entry.error_message = withIssues(attempt2.entry.error_message, err);
      const finalErr = new PlanValidationError(err.issues, err.rawOutput);
      (finalErr as Error & { cause?: unknown }).cause = attempts;
      throw finalErr;
    }
    throw err;
  }
}

/** Validation issues as the log message, keeping any earlier note (e.g. max_tokens truncation). */
function withIssues(prior: string | null, err: PlanValidationError): string {
  const issues = err.issues.map((i) => JSON.stringify(i)).join("; ");
  return prior ? `${prior} | ${issues}` : issues;
}

export function buildRetryHint(err: PlanValidationError | null, priorInput: unknown): string {
  const hint = err
    ? err.toRetryHint()
    : "Tu llamada anterior a `emit_plan` falló la validación. Vuelve a llamar a la herramienta con el proyecto completo corregido.";
  // The whole prior tool input, so the model can see exactly what to fix.
  // Wrapped in <previous_output> so it is treated as untrusted data, not instructions.
  const serialized = priorInput != null ? safeStringify(priorInput) : "";
  const wrapped = serialized ? `\n\n<previous_output>\n${serialized}\n</previous_output>\n` : "";
  return `${hint}${wrapped}`;
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
  now: () => number;
};

type OneAttemptResult = {
  entry: GenerateAttempt;
  raw: unknown;
};

async function runOneAttempt(input: OneAttemptInput): Promise<OneAttemptResult> {
  const start = input.now();
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
            "Emite el proyecto Clase Viva generado como datos estructurados. Respeta las longitudes y enums del esquema.",
          input_schema: input.inputSchema,
        },
      ],
      tool_choice: { type: "tool", name: PLAN_TOOL_NAME },
    });
    // On timeout, abort the stream so a slow attempt stops streaming (and billing)
    // instead of running on in the background while attempt 2 starts.
    const response = await withTimeout(stream.finalMessage(), input.timeoutMs, () =>
      (stream as { abort?: () => void }).abort?.(),
    );

    entry.latency_ms = input.now() - start;
    entry.tokens_input = response.usage?.input_tokens ?? null;
    entry.tokens_output = response.usage?.output_tokens ?? null;
    if (response.stop_reason === "max_tokens") {
      // Kept on the entry even when status ends "success" so truncation is visible in logs.
      entry.error_message = `stop_reason=max_tokens after ${entry.tokens_output ?? "?"} output tokens (tool input likely truncated)`;
    }

    const toolUseBlock = response.content.find(
      (block): block is Anthropic.Messages.ToolUseBlock => block.type === "tool_use",
    );
    if (!toolUseBlock || toolUseBlock.name !== PLAN_TOOL_NAME) {
      entry.error_message = `Anthropic did not emit the expected tool call (${PLAN_TOOL_NAME})`;
      return { entry, raw: null };
    }

    // Defensive unwrap: Opus 4.7 occasionally wraps its payload under a single
    // intermediate key instead of emitting the flat shape requested by the
    // tool's input_schema. Observed wrappers: `input` (mirrors the tool_use
    // wire format) and `plan`. When the wrapped inner object looks like a
    // plan, peel the wrapper so Zod sees the flat shape it expects.
    const toolInput = unwrapSingleKeyWrapper(toolUseBlock.input);

    // Store a stringified copy for audit/log purposes.
    entry.raw_output = safeStringify(toolInput);
    entry.status = "success";
    return { entry, raw: toolInput };
  } catch (err) {
    entry.latency_ms = input.now() - start;
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

/**
 * If the tool input is a single-key wrapper (observed keys: `input`, `plan`)
 * around an inner object that looks like a plan (has at least one top-level
 * plan key), peel the wrapper. The key-name is not checked — the `looksLikePlan`
 * heuristic is the safety gate, and it's specific enough to avoid false
 * positives.
 */
function unwrapSingleKeyWrapper(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length !== 1) return value;
  const inner = obj[keys[0]];
  if (!inner || typeof inner !== "object" || Array.isArray(inner)) return value;
  const innerObj = inner as Record<string, unknown>;
  const planKeys = ["titulo", "pregunta_guia", "tarea_previa", "fases", "dba_targets"];
  const looksLikePlan = planKeys.some((k) => k in innerObj);
  return looksLikePlan ? innerObj : value;
}

class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Timeout after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      try {
        onTimeout?.();
      } catch {
        // aborting is best-effort; the timeout still rejects
      }
      reject(new TimeoutError(ms));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}
