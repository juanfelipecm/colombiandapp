import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createAdminClient } from "../lib/supabase/admin";
import {
  ArgError,
  atomicWriteJson,
  type Extraction,
  type MateriaSlug,
  parseArgs,
  validateExtraction,
} from "./dba/lib";

const SYSTEM_PROMPT = [
  "You are extracting the official Colombian Derechos Básicos de Aprendizaje (DBAs) from the attached PDF.",
  "Return strict JSON matching the schema the user provides. Do not paraphrase or summarize — transcribe the text verbatim, preserving Spanish accents and punctuation.",
  "Each DBA has a grado (0 for Transición, 1-11 for school years), a numero (1, 2, 3, ...), an enunciado (the learning-goal statement), and a list of evidencias de aprendizaje (numbered observable tasks).",
].join(" ");

const USER_PROMPT = `Extract every DBA in the document. Respond with JSON only, no prose, matching:

{
  "dbas": [
    {
      "grado": <int 0-11>,
      "numero": <int>,
      "enunciado": "<verbatim>",
      "evidencias": [
        { "numero": <int>, "descripcion": "<verbatim>" }
      ]
    }
  ]
}`;

async function extractWithClaude(pdfPath: string): Promise<unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is required");

  const bytes = await readFile(pdfPath);
  const base64 = bytes.toString("base64");

  const client = new Anthropic({ apiKey });
  const stream = client.messages.stream({
    model: "claude-opus-4-7",
    max_tokens: 64000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: base64 },
          },
          { type: "text", text: USER_PROMPT },
        ],
      },
    ],
  });
  stream.on("text", (delta) => process.stderr.write(delta));
  const response = await stream.finalMessage();
  process.stderr.write("\n");

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text block");
  }
  const text = textBlock.text.trim();
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error(`Claude returned no JSON:\n${text.slice(0, 500)}`);
  }
  return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
}

type UpsertCounts = { dbas: number; evidencias: number; grados: number };

async function upsertExtraction(
  materia: MateriaSlug,
  extraction: Extraction,
): Promise<UpsertCounts> {
  const supabase = createAdminClient();
  const grados = new Set<number>();
  let evidenciaCount = 0;

  for (const dba of extraction.dbas) {
    grados.add(dba.grado);
    evidenciaCount += dba.evidencias.length;

    const { error } = await supabase.rpc("upsert_dba", {
      p_materia_slug: materia,
      p_grado: dba.grado,
      p_numero: dba.numero,
      p_enunciado: dba.enunciado,
      p_evidencias: dba.evidencias,
    });
    if (error) {
      throw new Error(
        `upsert_dba failed for grado=${dba.grado} numero=${dba.numero}: ${error.message}`,
      );
    }
  }

  return { dbas: extraction.dbas.length, evidencias: evidenciaCount, grados: grados.size };
}

function seedPath(materia: MateriaSlug): string {
  return path.join("supabase", "seed", "dba", `${materia}.json`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const out = seedPath(args.materia);

  let raw: unknown;
  if (args.fromSeed) {
    console.log(`Loading DBAs from ${out} (skipping Claude)...`);
    raw = JSON.parse(await readFile(out, "utf8"));
  } else {
    console.log(`Extracting DBAs from ${args.pdf} (${args.materia})...`);
    raw = await extractWithClaude(args.pdf!);
  }

  const validation = validateExtraction(raw, args.gradoRange);
  if (!validation.ok) {
    console.error(args.fromSeed ? "Seed JSON failed validation:" : "Extraction failed validation:");
    for (const err of validation.errors) console.error(`  - ${err}`);
    process.exit(2);
  }

  if (!args.fromSeed) {
    await atomicWriteJson(out, validation.extraction);
    console.log(`Wrote ${out} (${validation.extraction.dbas.length} DBAs)`);
  }

  if (args.dryRun) {
    console.log("Dry run — skipping DB writes.");
    return;
  }

  console.log("Upserting to Supabase...");
  const counts = await upsertExtraction(args.materia, validation.extraction);
  console.log(
    `${args.materia}: ${counts.grados} grados, ${counts.dbas} DBAs, ${counts.evidencias} evidencias inserted/updated.`,
  );
}

main().catch((err) => {
  if (err instanceof ArgError) {
    console.error(err.message);
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});
