import type { SupabaseClient } from "@supabase/supabase-js";

export type Evidencia = {
  id: string;
  numero: number;
  descripcion: string;
};

export type DbaEntry = {
  id: string;
  grado: number;
  numero: number;
  enunciado: string;
  materia_id: string;
  materia_slug: string;
  materia_nombre: string;
  evidencias: Evidencia[];
};

export type TokenizedDba = DbaEntry & {
  /** Short token like D1, D2, ..., D47 — what the model sees and emits. */
  token: string;
};

export type DbaContext = {
  dbas: TokenizedDba[];
  tokenToUuid: Map<string, string>;
  tokenToEntry: Map<string, TokenizedDba>;
  /** Keyed by `${grado}:${materia_id}` */
  byGradeMateria: Map<string, TokenizedDba[]>;
};

/**
 * Fetch all DBAs + their evidencias for the cross-product of selected grades and materias.
 * Single Supabase query with embedded evidencias; target latency < 200ms for 5 grades × 3 materias.
 */
export async function fetchDbasForSelection(
  supabase: SupabaseClient,
  grados: number[],
  materiaIds: string[],
): Promise<DbaEntry[]> {
  if (grados.length === 0) throw new Error("fetchDbasForSelection: grados must be non-empty");
  if (materiaIds.length === 0) throw new Error("fetchDbasForSelection: materiaIds must be non-empty");

  const { data, error } = await supabase
    .from("derechos_basicos_aprendizaje")
    .select(
      "id, grado, numero, enunciado, materia_id, materias!inner(slug, nombre), evidencias_aprendizaje(id, numero, descripcion)",
    )
    .in("grado", grados)
    .in("materia_id", materiaIds)
    .order("grado", { ascending: true })
    .order("numero", { ascending: true });

  if (error) {
    throw new Error(`fetchDbasForSelection: ${error.message}`);
  }

  type Row = {
    id: string;
    grado: number;
    numero: number;
    enunciado: string;
    materia_id: string;
    materias: { slug: string; nombre: string } | { slug: string; nombre: string }[];
    evidencias_aprendizaje: Array<{ id: string; numero: number; descripcion: string }> | null;
  };

  return ((data ?? []) as Row[]).map((row) => {
    const materia = Array.isArray(row.materias) ? row.materias[0] : row.materias;
    const evidencias = (row.evidencias_aprendizaje ?? [])
      .map((e) => ({ id: e.id, numero: e.numero, descripcion: e.descripcion }))
      .sort((a, b) => a.numero - b.numero);
    return {
      id: row.id,
      grado: row.grado,
      numero: row.numero,
      enunciado: row.enunciado,
      materia_id: row.materia_id,
      materia_slug: materia.slug,
      materia_nombre: materia.nombre,
      evidencias,
    };
  });
}

/**
 * Assign short tokens (D1, D2, ..., DN) to DBAs in a stable order.
 * Tokens are what the model sees in the prompt and emits in its response.
 * Server resolves tokens → UUIDs before DB insert, so the model never deals with UUIDs.
 */
export function assignTokens(dbas: DbaEntry[]): DbaContext {
  const tokenized: TokenizedDba[] = dbas.map((dba, i) => ({
    ...dba,
    token: `D${i + 1}`,
  }));

  const tokenToUuid = new Map<string, string>();
  const tokenToEntry = new Map<string, TokenizedDba>();
  const byGradeMateria = new Map<string, TokenizedDba[]>();

  for (const dba of tokenized) {
    tokenToUuid.set(dba.token, dba.id);
    tokenToEntry.set(dba.token, dba);
    const key = `${dba.grado}:${dba.materia_id}`;
    const bucket = byGradeMateria.get(key);
    if (bucket) {
      bucket.push(dba);
    } else {
      byGradeMateria.set(key, [dba]);
    }
  }

  return { dbas: tokenized, tokenToUuid, tokenToEntry, byGradeMateria };
}

export async function buildDbaContext(
  supabase: SupabaseClient,
  grados: number[],
  materiaIds: string[],
): Promise<DbaContext> {
  const dbas = await fetchDbasForSelection(supabase, grados, materiaIds);
  return assignTokens(dbas);
}
