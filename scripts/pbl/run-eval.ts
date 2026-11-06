import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateProject, type GenerateAttempt } from "@/lib/ai/generate-project";
import { AnthropicError, PlanValidationError } from "@/lib/ai/errors";
import { PROMPT_VERSION } from "@/lib/ai/plan-schema";
import type { WizardInputs } from "@/lib/ai/prompt-template";
import { renderPlanMarkdown } from "./render-markdown";
import { runZeroTechCheck } from "./checks/zero-tech";
import { runFiveFasesCheck } from "./checks/five-fases";
import { runBandsCoverageCheck } from "./checks/bands-coverage";
import { runGradeCoverageCheck } from "./checks/grade-coverage";
import { runShapeCheck } from "./checks/shape";

/**
 * Live prompt eval (spends Anthropic tokens). Gate for clase-viva-v1:
 *   npm run eval:prompt -- --all --runs 3
 *   → every run passes the hard checks (five-fases, bands, zero-tech, grade coverage),
 *     zero max_tokens truncations, and a human reads one .output.md per fixture.
 */

type FixtureInput = {
  name: string;
  description: string;
  grados: number[];
  materiaSlugs: string[];
  studentCountsByGrade: Record<string, number>;
  tema_contexto: string;
};

type FixtureExpected = { fases: number; zero_tech: "default" };

type RunResult = {
  ok: boolean;
  failures: string[];
  warnings: string[];
  attempts: number;
  truncated: boolean;
  durationMs: number;
  tokensOut: number | null;
};

const FIXTURE_NAMES = [
  "diana-coastal",
  "paramo-ecosystem",
  "single-grade-3",
  "ingles-only",
  "short-context",
  "long-context",
] as const;

const FIXTURES_DIR = path.join("scripts", "pbl", "fixtures");

function parseArgs(argv: string[]) {
  const selected: string[] = [];
  let all = false;
  let runs = 1;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--all") all = true;
    else if (arg === "--fixture" && argv[i + 1]) selected.push(argv[++i]);
    else if (arg === "--runs" && argv[i + 1]) runs = Math.max(1, Number(argv[++i]) || 1);
  }
  return { all, selected, runs };
}

function usage() {
  console.error(`Usage:
  npm run eval:prompt -- --all --runs 3
  npm run eval:prompt -- --fixture diana-coastal [--fixture ingles-only] [--runs N]

Fixtures: ${FIXTURE_NAMES.join(", ")}`);
}

async function loadFixture(name: string) {
  const base = path.join(FIXTURES_DIR, name);
  const [input, expected] = await Promise.all([
    readFile(`${base}.input.json`, "utf8").then((t) => JSON.parse(t) as FixtureInput),
    readFile(`${base}.expected.json`, "utf8").then((t) => JSON.parse(t) as FixtureExpected),
  ]);
  return { input, expected };
}

async function resolveMateriaSlugs(slugs: string[]) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("materias").select("id, slug, nombre").in("slug", slugs);
  if (error) throw new Error(`materia lookup failed: ${error.message}`);
  const byslug = new Map((data ?? []).map((m) => [m.slug, m]));
  return slugs.map((slug) => {
    const row = byslug.get(slug);
    if (!row) throw new Error(`Unknown materia slug: ${slug}`);
    return row;
  });
}

function attemptsOf(err: unknown): GenerateAttempt[] {
  const cause = (err as { cause?: unknown })?.cause;
  return Array.isArray(cause) ? (cause as GenerateAttempt[]) : [];
}

const isTruncated = (a: GenerateAttempt[]) =>
  a.some((x) => (x.error_message ?? "").startsWith("stop_reason=max_tokens"));

async function runOnce(name: string, runIdx: number, writeOutput: boolean): Promise<RunResult> {
  const start = Date.now();
  const r: RunResult = { ok: false, failures: [], warnings: [], attempts: 0, truncated: false, durationMs: 0, tokensOut: null };
  try {
    const { input, expected } = await loadFixture(name);
    const materias = await resolveMateriaSlugs(input.materiaSlugs);
    const wizardInputs: WizardInputs = {
      grados: input.grados,
      materia_ids: materias.map((m) => m.id),
      studentCountsByGrade: Object.fromEntries(
        Object.entries(input.studentCountsByGrade).map(([g, n]) => [Number(g), n]),
      ),
      tema_contexto: input.tema_contexto || null,
    };

    const generated = await generateProject(wizardInputs, {
      supabase: createAdminClient(),
      deadlineAt: Date.now() + 280_000, // same budget as the route
    });
    r.attempts = generated.attempts.length;
    r.truncated = isTruncated(generated.attempts);
    r.tokensOut = generated.attempts.reduce((s, a) => s + (a.tokens_output ?? 0), 0);

    if (writeOutput) {
      const base = path.join(FIXTURES_DIR, name);
      await Promise.all([
        writeFile(`${base}.output.json`, JSON.stringify(generated.plan, null, 2)),
        writeFile(`${base}.output.md`, renderPlanMarkdown(generated.plan, generated.ctx)),
      ]);
    }

    if (generated.plan.fases.length !== expected.fases) r.failures.push(`fases ${generated.plan.fases.length} ≠ ${expected.fases}`);
    const five = runFiveFasesCheck(generated.plan);
    if (!five.ok) r.failures.push(...five.problems.map((p) => `five-fases: ${p}`));
    const bands = runBandsCoverageCheck(generated.plan, wizardInputs.grados);
    if (!bands.ok) r.failures.push(...bands.problems.map((p) => `bands: ${p}`));
    r.warnings.push(...bands.warnings);
    const zt = runZeroTechCheck(generated.plan);
    if (!zt.ok) r.failures.push(...zt.hits.map((h) => `zero-tech: ${h.term} @ ${h.where}`));
    const gc = runGradeCoverageCheck(generated.plan, wizardInputs.grados, wizardInputs.materia_ids);
    if (!gc.ok) r.failures.push(`grade-coverage: ${gc.missing.length} pair(s) uncovered`);
    r.warnings.push(...runShapeCheck(generated.plan).warnings);
    if (r.truncated) r.failures.push("max_tokens truncation on an attempt");
    r.ok = r.failures.length === 0;
  } catch (err) {
    const attempts = attemptsOf(err);
    r.attempts = attempts.length;
    r.truncated = isTruncated(attempts);
    r.tokensOut = attempts.reduce((s, a) => s + (a.tokens_output ?? 0), 0) || null;
    if (err instanceof PlanValidationError) {
      r.failures.push(`validation failed after ${attempts.length} attempt(s): ${err.issues.slice(0, 3).map((i) => i.kind).join(", ")}`);
    } else if (err instanceof AnthropicError) {
      r.failures.push(`Anthropic error: ${err.message}`);
    } else {
      r.failures.push(err instanceof Error ? err.message : String(err));
    }
  }
  r.durationMs = Date.now() - start;
  console.log(`  run ${runIdx + 1}: ${r.ok ? "PASS" : "FAIL"} · ${Math.round(r.durationMs / 1000)}s · ${r.tokensOut ?? "?"} out · ${r.attempts} attempt(s)${r.truncated ? " · TRUNCATED" : ""}`);
  for (const f of r.failures) console.log(`     ✗ ${f}`);
  for (const w of r.warnings) console.log(`     ! ${w}`);
  return r;
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}

async function main() {
  const { all, selected, runs } = parseArgs(process.argv.slice(2));
  if (!all && selected.length === 0) {
    usage();
    process.exit(1);
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Missing ANTHROPIC_API_KEY. Add it to .env.local or export in shell.");
    process.exit(1);
  }
  const targets = all ? [...FIXTURE_NAMES] : selected;
  const unknown = targets.filter((t) => !FIXTURE_NAMES.includes(t as (typeof FIXTURE_NAMES)[number]));
  if (unknown.length > 0) {
    console.error(`Unknown fixture(s): ${unknown.join(", ")}`);
    usage();
    process.exit(1);
  }
  await mkdir(FIXTURES_DIR, { recursive: true });

  console.log(`Prompt ${PROMPT_VERSION}: ${targets.length} fixture(s) × ${runs} run(s)\n`);
  const allRuns: RunResult[] = [];
  const rows: string[] = [];
  for (const name of targets) {
    console.log(`${name}`);
    const results: RunResult[] = [];
    for (let i = 0; i < runs; i++) results.push(await runOnce(name, i, i === 0));
    allRuns.push(...results);
    const passed = results.filter((r) => r.ok).length;
    const tokens = results.map((r) => r.tokensOut).filter((n): n is number => n !== null);
    const lat = results.map((r) => r.durationMs);
    rows.push(
      `${name.padEnd(18)} ${passed}/${runs} pass · truncations ${results.filter((r) => r.truncated).length} · tokens p50 ${percentile(tokens, 50) ?? "?"} p95 ${percentile(tokens, 95) ?? "?"} · latency p50 ${Math.round((percentile(lat, 50) ?? 0) / 1000)}s p95 ${Math.round((percentile(lat, 95) ?? 0) / 1000)}s`,
    );
  }

  const passed = allRuns.filter((r) => r.ok).length;
  const truncations = allRuns.filter((r) => r.truncated).length;
  const tokens = allRuns.map((r) => r.tokensOut).filter((n): n is number => n !== null);
  const lat = allRuns.map((r) => r.durationMs);
  console.log(`\n${"-".repeat(72)}`);
  for (const row of rows) console.log(row);
  console.log(`${"-".repeat(72)}`);
  console.log(
    `TOTAL ${passed}/${allRuns.length} runs pass · truncations ${truncations} · tokens/generation p50 ${percentile(tokens, 50) ?? "?"} p95 ${percentile(tokens, 95) ?? "?"} · latency p50 ${Math.round((percentile(lat, 50) ?? 0) / 1000)}s p95 ${Math.round((percentile(lat, 95) ?? 0) / 1000)}s`,
  );
  console.log(`\nNext: read one .output.md per fixture in ${FIXTURES_DIR} and rate it teachable or not (gate: ≥ 5/6).`);
  console.log(`Use the p95 tokens above (× expected monthly generations) to set PBL_MONTHLY_TOKEN_BUDGET.\n`);
  process.exit(passed === allRuns.length && truncations === 0 ? 0 : 2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
