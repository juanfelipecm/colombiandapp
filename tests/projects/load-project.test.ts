import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadProjectPlan } from "@/lib/projects/load-project";
import { makeBloque } from "../fixtures/clase-viva-plan";

const LEN = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const CN = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

/** Supabase stub: every query builder resolves to tables[name]. */
function stub(tables: Record<string, unknown>, counts: Record<string, number> = {}): SupabaseClient {
  const from = (name: string) => {
    const result = { data: tables[name] ?? null, count: counts[name] ?? null, error: null };
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "in"]) b[m] = () => b;
    b.maybeSingle = async () => result;
    b.then = (res: (v: typeof result) => void) => res(result);
    return b;
  };
  return { from } as unknown as SupabaseClient;
}

const project = {
  id: "p1",
  teacher_id: "t1",
  titulo: "Panela",
  pregunta_guia: "¿Cómo contar la historia de una enramada?",
  tarea_previa: null,
  tema_contexto: null,
  prompt_version: "clase-viva-v1",
  status: "en_ensenanza",
  se_enseno_bien: null,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: null,
};

const phase = (orden: number, etapa: string, bloques: unknown) => ({
  id: `ph${orden}`,
  orden,
  etapa,
  nombre: etapa,
  gran_pregunta: null,
  bloques,
  completed_at: null,
});

function tables(over: Record<string, unknown> = {}) {
  return {
    projects: project,
    project_grados: [{ grado: 0 }, { grado: 3 }],
    project_materias: [
      { materia_id: CN, materias: { slug: "ciencias_naturales", nombre: "Ciencias Naturales", orden: 3 } },
      { materia_id: LEN, materias: [{ slug: "lenguaje", nombre: "Lenguaje", orden: 1 }] },
    ],
    project_dba_targets: [
      { grado: 3, materia_id: LEN, orden: 1, derechos_basicos_aprendizaje: { numero: 2, enunciado: "L3" }, evidencias_aprendizaje: null },
      { grado: 0, materia_id: LEN, orden: 1, derechos_basicos_aprendizaje: [{ numero: 1, enunciado: "L0" }], evidencias_aprendizaje: [{ descripcion: "ev" }] },
      { grado: 0, materia_id: CN, orden: 1, derechos_basicos_aprendizaje: { numero: 5, enunciado: "C0" }, evidencias_aprendizaje: { descripcion: "evc" } },
    ],
    project_phases: [
      phase(1, "despertar_curiosidad", [makeBloque(), makeBloque()]),
      phase(2, "indagar_investigar", [makeBloque(), { tipo: "baile" }]),
    ],
    project_materiales: [{ nombre: "papel", orden: 1 }, { nombre: "panela", orden: 2 }],
    ...over,
  };
}

describe("loadProjectPlan", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns null when the project is not visible", async () => {
    expect(await loadProjectPlan(stub({ projects: null }), "x")).toBeNull();
  });

  it("normalizes nested rows and orders DBA tables by materia orden, then grado", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const plan = await loadProjectPlan(stub(tables(), { project_students: 12 }), "p1");
    expect(plan).not.toBeNull();
    expect(plan!.materias.map((m) => m.slug)).toEqual(["lenguaje", "ciencias_naturales"]);
    expect(plan!.targetsByMateria.map((t) => t.materia_slug)).toEqual(["lenguaje", "ciencias_naturales"]);
    expect(plan!.targetsByMateria[0].rows.map((r) => r.grado)).toEqual([0, 3]);
    expect(plan!.targetsByMateria[0].rows[0]).toEqual({ grado: 0, dba_numero: 1, enunciado: "L0", evidencia: "ev" });
    expect(plan!.targetsByMateria[0].rows[1].evidencia).toBeNull();
    expect(plan!.studentCount).toBe(12);
    expect(plan!.materiales).toEqual(["papel", "panela"]);
    expect(plan!.project.updated_at).toBe(project.created_at);
  });

  it("parses bloques and counts invalido placeholders", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const plan = await loadProjectPlan(stub(tables()), "p1");
    expect(plan!.phases).toHaveLength(2);
    expect(plan!.phases[1].bloques.map((b) => b.tipo)).toEqual(["actividad", "invalido"]);
    expect(plan!.invalidoCount).toBe(1);
    expect(spy).toHaveBeenCalled();
  });

  it("drops legacy phases without bloques (shape guard, not prompt_version)", async () => {
    const legacy = tables({
      projects: { ...project, prompt_version: "pbl-v1" },
      project_phases: [{ ...phase(1, null as unknown as string, null), etapa: null, bloques: null }],
    });
    const plan = await loadProjectPlan(stub(legacy), "p1");
    expect(plan!.phases).toEqual([]);

    // A future prompt version with bloques still loads.
    const future = tables({ projects: { ...project, prompt_version: "clase-viva-v2" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const plan2 = await loadProjectPlan(stub(future), "p1");
    expect(plan2!.phases).toHaveLength(2);
  });
});
