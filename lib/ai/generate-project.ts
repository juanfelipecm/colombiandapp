import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildDbaContext, type DbaContext } from "./dba-context";
import { AnthropicError, PlanValidationError } from "./errors";
import { PROMPT_MODEL, PROMPT_VERSION, type GeneratedPlan } from "./plan-schema";
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
// 3 minutes. Opus 4.7 can take 60-120s on complex structured JSON; 50s was too
// tight and produced api_error timeouts on normal-sized inputs. The Vercel
// platform timeout is the real ceiling (see maxDuration on the route).
const DEFAULT_TIMEOUT_MS = 180_000;

export type GenerateDeps = {
  supabase: SupabaseClient;
  anthropic?: Anthropic;
  maxTokens?: number;
  timeoutMs?: number;
};

/**
 * Orchestrates one logical generation: fetch DBAs, build prompt, call Anthropic,
 * parse + validate the response. Retries ONCE with error context on validation failure.
 *
 * Returns the validated plan plus the full DBA context (needed to resolve tokens → UUIDs
 * before DB insert) plus the per-attempt log entries for project_generation_logs.
 *
 * Throws AnthropicError on network/API errors. Throws PlanValidationError if both
 * attempts fail validation. The `attempts` array is attached to both thrown errors
 * via `.cause` so callers can persist them.
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
  const attempts: GenerateAttempt[] = [];

  // Attempt 1
  const attempt1 = await runOneAttempt({
    anthropic,
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    model: PROMPT_MODEL,
    maxTokens,
    timeoutMs,
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

function buildRetryHint(entry: GenerateAttempt, rawOutput: unknown): string {
  const hint =
    "The previous response failed validation. Read the errors below and return a corrected JSON response.";
  const detail = entry.error_message ?? "";
  const raw = typeof rawOutput === "string" ? rawOutput.slice(0, 2000) : "";
  return `${hint}\n\nErrors:\n${detail}\n\n${raw ? `Your previous output (truncated):\n${raw}\n` : ""}`;
}

type OneAttemptInput = {
  anthropic: Anthropic;
  systemPrompt: string;
  userPrompt: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;
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
    // Use streaming internally (NOT to the client) for resilience on slow Opus
    // responses. Without streaming, a 60-120s silent wait can trip platform
    // idle-timeouts or feel dead; with streaming the connection stays active
    // as tokens arrive. `finalMessage()` assembles the full response at the end.
    const stream = input.anthropic.messages.stream({
      model: input.model,
      max_tokens: input.maxTokens,
      system: input.systemPrompt,
      messages: [{ role: "user", content: input.userPrompt }],
    });
    const response = await withTimeout(stream.finalMessage(), input.timeoutMs);

    entry.latency_ms = Date.now() - start;
    entry.tokens_input = response.usage?.input_tokens ?? null;
    entry.tokens_output = response.usage?.output_tokens ?? null;

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      entry.error_message = "Anthropic returned no text block";
      return { entry, raw: null };
    }

    const text = textBlock.text.trim();
    entry.raw_output = text;

    const parsed = extractJsonObject(text);
    if (parsed === null) {
      entry.error_message = "Response did not contain a JSON object";
      return { entry, raw: null };
    }

    entry.status = "success";
    return { entry, raw: parsed };
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

function extractJsonObject(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
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
