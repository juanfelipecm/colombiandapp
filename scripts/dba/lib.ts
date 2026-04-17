import { randomBytes } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const MATERIA_SLUGS = [
  "lenguaje",
  "matematicas",
  "ciencias_naturales",
  "ciencias_sociales",
  "ingles",
  "transicion",
] as const;

export type MateriaSlug = (typeof MATERIA_SLUGS)[number];

export const EvidenciaSchema = z.object({
  numero: z.number().int().min(1),
  descripcion: z.string().min(1),
});

export const DbaSchema = z.object({
  grado: z.number().int().min(0).max(11),
  numero: z.number().int().min(1),
  enunciado: z.string().min(1),
  evidencias: z.array(EvidenciaSchema).min(1),
});

export const ExtractionSchema = z.object({
  dbas: z.array(DbaSchema).min(1),
});

export type Extraction = z.infer<typeof ExtractionSchema>;
export type Dba = z.infer<typeof DbaSchema>;

export type GradoRange = { min: number; max: number };

export type Args = {
  pdf: string | null;
  materia: MateriaSlug;
  gradoRange: GradoRange;
  dryRun: boolean;
  fromSeed: boolean;
};

export class ArgError extends Error {}

const USAGE = `Usage: tsx scripts/ingest-dba.ts \\
  --materia <${MATERIA_SLUGS.join("|")}> \\
  --grado-range <min>-<max> \\
  [--pdf <path>]     # required unless --from-seed
  [--from-seed]      # skip Claude, upsert from supabase/seed/dba/<materia>.json
  [--dry-run]        # write JSON but skip DB writes`;

export function parseArgs(argv: readonly string[]): Args {
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      throw new ArgError(`Unexpected positional arg: ${token}\n\n${USAGE}`);
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      flags.set(key, true);
    } else {
      flags.set(key, next);
      i++;
    }
  }

  const fromSeed = flags.get("from-seed") === true;
  const pdfFlag = flags.get("pdf");
  const pdf = typeof pdfFlag === "string" ? pdfFlag : null;
  if (!fromSeed && pdf === null) {
    throw new ArgError(`--pdf is required (unless --from-seed)\n\n${USAGE}`);
  }

  const materia = flags.get("materia");
  if (typeof materia !== "string") throw new ArgError(`--materia is required\n\n${USAGE}`);
  if (!(MATERIA_SLUGS as readonly string[]).includes(materia)) {
    throw new ArgError(
      `--materia must be one of ${MATERIA_SLUGS.join(", ")} (got "${materia}")`,
    );
  }

  const gradoRangeRaw = flags.get("grado-range");
  if (typeof gradoRangeRaw !== "string") {
    throw new ArgError(`--grado-range is required (e.g. 1-11)\n\n${USAGE}`);
  }
  const gradoRange = parseGradoRange(gradoRangeRaw);

  return {
    pdf,
    materia: materia as MateriaSlug,
    gradoRange,
    dryRun: flags.get("dry-run") === true,
    fromSeed,
  };
}

export function parseGradoRange(raw: string): GradoRange {
  const match = raw.match(/^(\d+)-(\d+)$/);
  if (!match) {
    throw new ArgError(`--grado-range must be in the form <min>-<max> (got "${raw}")`);
  }
  const min = Number(match[1]);
  const max = Number(match[2]);
  if (min < 0 || max > 11 || min > max) {
    throw new ArgError(
      `--grado-range must satisfy 0 <= min <= max <= 11 (got ${min}-${max})`,
    );
  }
  return { min, max };
}

export type ValidationResult =
  | { ok: true; extraction: Extraction }
  | { ok: false; errors: string[] };

export function validateExtraction(
  raw: unknown,
  range: GradoRange,
): ValidationResult {
  const parsed = ExtractionSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }

  const errors: string[] = [];
  const seen = new Set<string>();
  for (const dba of parsed.data.dbas) {
    if (dba.grado < range.min || dba.grado > range.max) {
      errors.push(
        `DBA ${dba.grado}.${dba.numero}: grado ${dba.grado} outside declared range ${range.min}-${range.max}`,
      );
    }
    const key = `${dba.grado}.${dba.numero}`;
    if (seen.has(key)) {
      errors.push(`Duplicate DBA key (grado ${dba.grado}, numero ${dba.numero})`);
    }
    seen.add(key);

    const evidenciaNumeros = new Set<number>();
    for (const ev of dba.evidencias) {
      if (evidenciaNumeros.has(ev.numero)) {
        errors.push(`DBA ${key}: duplicate evidencia numero ${ev.numero}`);
      }
      evidenciaNumeros.add(ev.numero);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, extraction: parsed.data };
}

export async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(filePath)}.${randomBytes(6).toString("hex")}.tmp`);
  const json = JSON.stringify(data, null, 2) + "\n";
  await writeFile(tmp, json, { encoding: "utf8" });
  await rename(tmp, filePath);
}
