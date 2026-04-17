-- Colombiando DBA schema
-- Derechos Básicos de Aprendizaje: governmental learning-goal curriculum.
-- Data is identical for every school in Colombia. Teachers read, service role writes.

-- ============================================================
-- Materias (subject areas)
-- ============================================================
CREATE TABLE materias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nombre text NOT NULL,
  orden int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Derechos Básicos de Aprendizaje (DBAs)
-- ============================================================
CREATE TABLE derechos_basicos_aprendizaje (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  materia_id uuid NOT NULL REFERENCES materias(id) ON DELETE CASCADE,
  grado int NOT NULL CHECK (grado BETWEEN 0 AND 11),
  numero int NOT NULL,
  enunciado text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (materia_id, grado, numero)
);

CREATE INDEX idx_dba_materia_grado
  ON derechos_basicos_aprendizaje(materia_id, grado);

-- ============================================================
-- Evidencias de Aprendizaje
-- ============================================================
CREATE TABLE evidencias_aprendizaje (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dba_id uuid NOT NULL REFERENCES derechos_basicos_aprendizaje(id) ON DELETE CASCADE,
  numero int NOT NULL,
  descripcion text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dba_id, numero)
);

CREATE INDEX idx_evidencias_dba ON evidencias_aprendizaje(dba_id);

-- ============================================================
-- RLS: read-only for all authenticated teachers
-- ============================================================
ALTER TABLE materias ENABLE ROW LEVEL SECURITY;
ALTER TABLE derechos_basicos_aprendizaje ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidencias_aprendizaje ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read materias"
  ON materias FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anyone authenticated can read DBAs"
  ON derechos_basicos_aprendizaje FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anyone authenticated can read evidencias"
  ON evidencias_aprendizaje FOR SELECT TO authenticated USING (true);

-- ============================================================
-- Seed materias (order matches Colombia Aprende)
-- ============================================================
INSERT INTO materias (slug, nombre, orden) VALUES
  ('lenguaje',           'Lenguaje',           1),
  ('matematicas',        'Matemáticas',        2),
  ('ciencias_naturales', 'Ciencias Naturales', 3),
  ('ciencias_sociales',  'Ciencias Sociales',  4),
  ('ingles',             'Inglés',             5),
  ('transicion',         'Transición',         6);

-- ============================================================
-- Atomic upsert: replaces a DBA and all its evidencias in one
-- transaction. Called by scripts/ingest-dba.ts via .rpc().
-- Idempotent across re-runs — re-running with different evidencia
-- counts cleanly replaces children, no orphans, no duplicates.
-- ============================================================
CREATE OR REPLACE FUNCTION upsert_dba(
  p_materia_slug text,
  p_grado int,
  p_numero int,
  p_enunciado text,
  p_evidencias jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_materia_id uuid;
  v_dba_id uuid;
  v_evidencia jsonb;
BEGIN
  SELECT id INTO v_materia_id FROM materias WHERE slug = p_materia_slug;
  IF v_materia_id IS NULL THEN
    RAISE EXCEPTION 'materia not found: %', p_materia_slug;
  END IF;

  INSERT INTO derechos_basicos_aprendizaje (materia_id, grado, numero, enunciado)
  VALUES (v_materia_id, p_grado, p_numero, p_enunciado)
  ON CONFLICT (materia_id, grado, numero)
    DO UPDATE SET enunciado = EXCLUDED.enunciado
  RETURNING id INTO v_dba_id;

  DELETE FROM evidencias_aprendizaje WHERE dba_id = v_dba_id;

  FOR v_evidencia IN SELECT * FROM jsonb_array_elements(p_evidencias) LOOP
    INSERT INTO evidencias_aprendizaje (dba_id, numero, descripcion)
    VALUES (
      v_dba_id,
      (v_evidencia->>'numero')::int,
      v_evidencia->>'descripcion'
    );
  END LOOP;

  RETURN v_dba_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION upsert_dba FROM PUBLIC, authenticated, anon;
