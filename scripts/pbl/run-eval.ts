import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateProject } from "@/lib/ai/generate-project";
import { AnthropicError, PlanValidationError } from "@/lib/ai/errors";
import type { WizardInputs } from "@/lib/ai/prompt-template";
import { renderPlanMarkdown } from "./render-markdown";
import { runZeroTechCheck } from "./checks/zero-tech";
import { runMinFasesCheck } from "./checks/min-fases";
import { runGradeCoverageCheck } from "./checks/grade-coverage";

type FixtureInput = {
  name: string;
  description: string;
  grados: number[];
  materiaSlugs: string[];
  studentCountsByGrade: Record<string, number>;
  duracion_semanas: 1 | 2;
  tema_contexto: string;
};

type FixtureExpected = {
  min_fases: number;
  zero_tech: "default";
};

type FixtureResult = {
  name: string;
  ok: boolean;
  summary: string;
  checks: {
    generation: { ok: boolean; message: string };
    zero_tech: { ok: boolean; hits: string[] };
    min_fases: { ok: boolean; actual: number; expected: number };
    grade_coverage: { ok: boolean; missing: number };
  };
  durationMs: number;
  tokens?: { input: number; output: number };
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
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--all") all = true;
    else if (arg === "--fixture" && argv[i + 1]) {
      selected.push(argv[++i]);
    }
  }
  return { all, selected };
}

function usage() {
  console.error(`Usage:
  npm run eval:prompt -- --all
  npm run eval:prompt -- --fixture diana-coastal
  npm run eval:prompt -- --fixture diana-coastal --fixture ingles-only

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
  const { data, error } = await supabase
    .from("materias")
    .select("id, slug, nombre")
    .in("slug", slugs);
  if (error) throw new Error(`materia lookup failed: ${error.message}`);
  const byslug = new Map((data ?? []).map((m) => [m.slug, m]));
  const resolved = slugs.map((slug) => {
    const row = byslug.get(slug);
    if (!row) throw new Error(`Unknown materia slug: ${slug}`);
    return row;
  });
  return resolved;
}

async function runOneFixture(name: string): Promise<FixtureResult> {
  const start = Date.now();
  const result: FixtureResult = {
    name,
    ok: false,
    summary: "",
    checks: {
      generation: { ok: false, message: "" },
      zero_tech: { ok: false, hits: [] },
      min_fases: { ok: false, actual: 0, expected: 0 },
      grade_coverage: { ok: false, missing: 0 },
    },
    durationMs: 0,
  };

  try {
    const { input, expected } = await loadFixture(name);
    const materias = await resolveMateriaSlugs(input.materiaSlugs);
    const studentCountsByGrade = Object.fromEntries(
      Object.entries(input.studentCountsByGrade).map(([g, n]) => [Number(g), n]),
    );
    const wizardInputs: WizardInputs = {
      grados: input.grados,
      materia_ids: materias.map((m) => m.id),
      studentCountsByGrade,
      duracion_semanas: input.duracion_semanas,
      tema_contexto: input.tema_contexto || null,
    };

    const supabase = createAdminClient();
    const generated = await generateProject(wizardInputs, { supabase });

    result.checks.generation = { ok: true, message: "OK" };
    const lastAttempt = generated.attempts[generated.attempts.length - 1];
    if (lastAttempt.tokens_input !== null && lastAttempt.tokens_output !== null) {
      result.tokens = { input: lastAttempt.tokens_input, output: lastAttempt.tokens_output };
    }

    const outputBase = path.join(FIXTURES_DIR, name);
    const outputJson = JSON.stringify(generated.plan, null, 2);
    const outputMd = renderPlanMarkdown(generated.plan, generated.ctx);
    await Promise.all([
      writeFile(`${outputBase}.output.json`, outputJson),
      writeFile(`${outputBase}.output.md`, outputMd),
    ]);

    // Automated checks
    const ztCheck = runZeroTechCheck(generated.plan);
    result.checks.zero_tech = {
      ok: ztCheck.ok,
      hits: ztCheck.hits.map((h) => `${h.term} @ ${h.where}`),
    };

    const mfCheck = runMinFasesCheck(generated.plan, expected.min_fases);
    result.checks.min_fases = mfCheck;

    const gcCheck = runGradeCoverageCheck(
      generated.plan,
      wizardInputs.grados,
      wizardInputs.materia_ids,
    );
    result.checks.grade_coverage = { ok: gcCheck.ok, missing: gcCheck.missing.length };

    result.ok =
      result.checks.generation.ok &&
      result.checks.zero_tech.ok &&
      result.checks.min_fases.ok &&
      result.checks.grade_coverage.ok;
    result.summary = result.ok
      ? `PASS · ${generated.plan.fases.length} fases · ${generated.attempts.length} attempt(s)`
      : `FAIL · see checks`;
  } catch (err) {
    if (err instanceof PlanValidationError) {
      result.checks.generation = {
        ok: false,
        message: `validation failed: ${err.issues.length} issue(s) across ${"cause" in err && Array.isArray((err as { cause?: unknown[] }).cause) ? ((err as { cause: unknown[] }).cause).length : "?"} attempts`,
      };
      result.summary = `FAIL · both attempts failed validation`;
    } else if (err instanceof AnthropicError) {
      result.checks.generation = { ok: false, message: `Anthropic error: ${err.message}` };
      result.summary = `FAIL · ${err.message}`;
    } else {
      result.checks.generation = {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      };
      result.summary = `FAIL · ${result.checks.generation.message}`;
    }
  }

  result.durationMs = Date.now() - start;
  return result;
}

function printResult(r: FixtureResult) {
  const status = r.ok ? "✓" : "✗";
  console.log(`\n${status} ${r.name} (${r.durationMs}ms) — ${r.summary}`);
  if (!r.checks.generation.ok) {
    console.log(`   generation: ${r.checks.generation.message}`);
  }
  if (!r.checks.zero_tech.ok) {
    console.log(`   zero-tech hits: ${r.checks.zero_tech.hits.join(", ")}`);
  }
  if (!r.checks.min_fases.ok) {
    console.log(`   min-fases: got ${r.checks.min_fases.actual}, expected ≥ ${r.checks.min_fases.expected}`);
  }
  if (!r.checks.grade_coverage.ok) {
    console.log(`   grade-coverage: ${r.checks.grade_coverage.missing} (grade × materia) pair(s) uncovered`);
  }
  if (r.tokens) {
    console.log(`   tokens: ${r.tokens.input} in / ${r.tokens.output} out`);
  }
}

async function main() {
  const { all, selected } = parseArgs(process.argv.slice(2));
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

  // Ensure the fixtures dir exists (for writing outputs)
  await mkdir(FIXTURES_DIR, { recursive: true });

  console.log(`Running ${targets.length} fixture(s) against the prompt...\n`);

  const results: FixtureResult[] = [];
  for (const name of targets) {
    const r = await runOneFixture(name);
    printResult(r);
    results.push(r);
  }

  // Summary
  const passed = results.filter((r) => r.ok).length;
  const total = results.length;
  console.log(`\n${"-".repeat(60)}`);
  console.log(`Summary: ${passed}/${total} fixtures passed all automated checks.`);
  const totalIn = results.reduce((s, r) => s + (r.tokens?.input ?? 0), 0);
  const totalOut = results.reduce((s, r) => s + (r.tokens?.output ?? 0), 0);
  if (totalIn + totalOut > 0) {
    console.log(`Tokens used: ${totalIn} input / ${totalOut} output`);
  }
  console.log(`${"-".repeat(60)}\n`);
  console.log(`Next step: open the generated .output.md files and rate each fixture.`);
  console.log(`Gate for the wizard build: Juan rates ≥ 4/5 AND Diana says "yes" to 4/6 fixtures.\n`);

  process.exit(passed === total ? 0 : 2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
