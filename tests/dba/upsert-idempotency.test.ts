import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip = !url || !serviceKey;

describe.skipIf(skip)("upsert_dba (integration)", () => {
  let supabase: SupabaseClient;
  const materia = "matematicas";
  const testGrado = 7;
  const testNumero = 999;

  async function getDba() {
    const { data, error } = await supabase
      .from("derechos_basicos_aprendizaje")
      .select("id, enunciado, materias!inner(slug)")
      .eq("materias.slug", materia)
      .eq("grado", testGrado)
      .eq("numero", testNumero)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function getEvidencias(dbaId: string) {
    const { data, error } = await supabase
      .from("evidencias_aprendizaje")
      .select("numero, descripcion")
      .eq("dba_id", dbaId)
      .order("numero");
    if (error) throw error;
    return data;
  }

  beforeAll(() => {
    supabase = createClient(url!, serviceKey!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  });

  afterAll(async () => {
    if (!supabase) return;
    const dba = await getDba();
    if (dba)
      await supabase.from("derechos_basicos_aprendizaje").delete().eq("id", dba.id);
  });

  it("raises when materia_slug is unknown", async () => {
    const { error } = await supabase.rpc("upsert_dba", {
      p_materia_slug: "no_existe",
      p_grado: 1,
      p_numero: 1,
      p_enunciado: "x",
      p_evidencias: [{ numero: 1, descripcion: "y" }],
    });
    expect(error).not.toBeNull();
    expect(error?.message.toLowerCase()).toContain("materia not found");
  });

  it("inserts a new DBA with its evidencias on first call", async () => {
    const { error } = await supabase.rpc("upsert_dba", {
      p_materia_slug: materia,
      p_grado: testGrado,
      p_numero: testNumero,
      p_enunciado: "TEST enunciado v1",
      p_evidencias: [
        { numero: 1, descripcion: "ev1-v1" },
        { numero: 2, descripcion: "ev2-v1" },
        { numero: 3, descripcion: "ev3-v1" },
      ],
    });
    expect(error).toBeNull();

    const dba = await getDba();
    expect(dba?.enunciado).toBe("TEST enunciado v1");
    const evidencias = await getEvidencias(dba!.id);
    expect(evidencias).toHaveLength(3);
    expect(evidencias.map((e) => e.descripcion)).toEqual([
      "ev1-v1",
      "ev2-v1",
      "ev3-v1",
    ]);
  });

  it("replaces evidencias cleanly on re-run with fewer children (the iron rule)", async () => {
    const { error } = await supabase.rpc("upsert_dba", {
      p_materia_slug: materia,
      p_grado: testGrado,
      p_numero: testNumero,
      p_enunciado: "TEST enunciado v2",
      p_evidencias: [{ numero: 1, descripcion: "ev1-v2" }],
    });
    expect(error).toBeNull();

    const dba = await getDba();
    expect(dba?.enunciado).toBe("TEST enunciado v2");
    const evidencias = await getEvidencias(dba!.id);
    expect(evidencias).toHaveLength(1);
    expect(evidencias[0].descripcion).toBe("ev1-v2");
  });

  it("handles a re-run with more children", async () => {
    const { error } = await supabase.rpc("upsert_dba", {
      p_materia_slug: materia,
      p_grado: testGrado,
      p_numero: testNumero,
      p_enunciado: "TEST enunciado v3",
      p_evidencias: [
        { numero: 1, descripcion: "a" },
        { numero: 2, descripcion: "b" },
        { numero: 3, descripcion: "c" },
        { numero: 4, descripcion: "d" },
      ],
    });
    expect(error).toBeNull();

    const dba = await getDba();
    const evidencias = await getEvidencias(dba!.id);
    expect(evidencias).toHaveLength(4);
  });
});
