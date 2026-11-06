-- ============================================================
-- 008_clase_viva.sql — Modelo Clase Viva (prompt_version 'clase-viva-v1').
--
-- A project is now an open pregunta guía + exactly five fixed fases (etapas):
--   1 despertar_curiosidad · 2 indagar_investigar · 3 crear · 4 reflexionar · 5 compartir
-- Each fase stores its narrative blocks as a jsonb array (bloques). DBA targets
-- stay normalized in project_dba_targets.
--
--   projects ──1:n── project_phases(orden 1..5, etapa, nombre, gran_pregunta, bloques jsonb, completed_at)
--      ├──1:n── project_dba_targets  (unchanged)
--      ├──1:n── project_materiales   (unchanged)
--      └──1:n── project_grados / project_materias / project_students (unchanged)
--   project_activities / project_activity_dba_refs: no longer written; kept for
--   pbl-v1 rows until a later cleanup migration.
--
-- Pure DDL + function replacement. Archiving legacy pbl-v1 projects is a separate
-- data step: 008b_archive_pbl_v1.sql.
-- ============================================================

-- projects: legacy pbl-v1 columns become optional; tarea previa added.
ALTER TABLE projects
  ALTER COLUMN duracion_semanas  DROP NOT NULL,
  ALTER COLUMN producto_final    DROP NOT NULL,
  ALTER COLUMN cierre_actividad  DROP NOT NULL,
  ALTER COLUMN cierre_evaluacion DROP NOT NULL,
  ADD COLUMN tarea_previa text NULL;

-- project_phases: five fases, etapa + gran pregunta + bloques.
ALTER TABLE project_phases
  DROP CONSTRAINT project_phases_orden_check,
  ADD CONSTRAINT project_phases_orden_check CHECK (orden BETWEEN 1 AND 5),
  ALTER COLUMN dias_label  DROP NOT NULL,
  ALTER COLUMN descripcion DROP NOT NULL,
  ADD COLUMN etapa text NULL
    CONSTRAINT project_phases_etapa_check
    CHECK (etapa IN ('despertar_curiosidad', 'indagar_investigar', 'crear', 'reflexionar', 'compartir')),
  ADD COLUMN gran_pregunta text NULL,
  ADD COLUMN bloques jsonb NULL
    CONSTRAINT project_phases_bloques_shape_check
    CHECK (bloques IS NULL OR (jsonb_typeof(bloques) = 'array' AND jsonb_array_length(bloques) BETWEEN 2 AND 8));

ALTER TABLE project_phases
  ADD CONSTRAINT project_phases_etapa_orden_check CHECK (
    etapa IS NULL OR orden = CASE etapa
      WHEN 'despertar_curiosidad' THEN 1
      WHEN 'indagar_investigar'   THEN 2
      WHEN 'crear'                THEN 3
      WHEN 'reflexionar'          THEN 4
      WHEN 'compartir'            THEN 5
    END),
  ADD CONSTRAINT project_phases_clase_viva_complete_check CHECK (
    (etapa IS NULL AND bloques IS NULL) OR (etapa IS NOT NULL AND bloques IS NOT NULL));

-- ============================================================
-- create_project_from_plan(jsonb) — the ONLY way to insert a complete project.
-- Called from app/api/proyectos/generate/route.ts (service role) AFTER the API
-- route has Zod-validated the plan and resolved DBA tokens → UUIDs
-- (lib/api/build-rpc-payload.ts).
--
-- Payload:
-- {
--   "teacher_id": "uuid", "school_id": "uuid", "idempotency_key": "uuid",
--   "header": {
--     "titulo": "...", "pregunta_guia": "...",
--     "tema_contexto": "...|''", "tarea_previa": "...|''",
--     "prompt_version": "clase-viva-v1", "model": "claude-opus-4-7"
--   },
--   "grados": [0, 1, 2], "materia_ids": ["uuid"], "student_ids": ["uuid"],
--   "dba_targets": [{ "grado": 1, "materia_id": "uuid", "dba_id": "uuid",
--                     "evidencia_id": "uuid|null", "orden": 1 }],
--   "materiales": ["papel", ...],
--   "fases": [            -- exactly 5
--     { "orden": 1, "etapa": "despertar_curiosidad", "nombre": "Despertar la curiosidad",
--       "gran_pregunta": "...|null",
--       "bloques": [ { "tipo": "inicio", "titulo": "...", "contenido": "...",
--                      "variantes_por_grado": null | [{ "grados": [0,1], "contenido": "..." }],
--                      "tip_profe": "...|null" }, ... ] }   -- 2..8 bloques
--   ]
-- }
--
-- Returns the new project_id. Atomic: on any failure the whole transaction rolls back.
-- ============================================================
CREATE OR REPLACE FUNCTION create_project_from_plan(plan jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project_id uuid;
  v_header jsonb;
  v_fase jsonb;
  v_bloque jsonb;
  v_target jsonb;
  v_grado int;
  v_materia_id uuid;
  v_student_id uuid;
  v_nombre text;
  v_orden int;
BEGIN
  v_header := plan->'header';

  IF jsonb_typeof(plan->'fases') IS DISTINCT FROM 'array' OR jsonb_array_length(plan->'fases') <> 5 THEN
    RAISE EXCEPTION 'create_project_from_plan: exactly 5 fases required, got %',
      CASE WHEN jsonb_typeof(plan->'fases') = 'array' THEN jsonb_array_length(plan->'fases')::text ELSE 'none' END;
  END IF;

  -- Header row
  INSERT INTO projects (
    teacher_id, school_id, idempotency_key,
    titulo, pregunta_guia, tema_contexto, tarea_previa,
    prompt_version, model
  )
  VALUES (
    (plan->>'teacher_id')::uuid,
    (plan->>'school_id')::uuid,
    (plan->>'idempotency_key')::uuid,
    v_header->>'titulo',
    v_header->>'pregunta_guia',
    NULLIF(v_header->>'tema_contexto', ''),
    NULLIF(v_header->>'tarea_previa', ''),
    v_header->>'prompt_version',
    v_header->>'model'
  )
  RETURNING id INTO v_project_id;

  -- Wizard input: grados
  FOR v_grado IN
    SELECT g::int FROM jsonb_array_elements_text(plan->'grados') AS g
  LOOP
    INSERT INTO project_grados (project_id, grado) VALUES (v_project_id, v_grado);
  END LOOP;

  -- Wizard input: materias
  FOR v_materia_id IN
    SELECT m::uuid FROM jsonb_array_elements_text(plan->'materia_ids') AS m
  LOOP
    INSERT INTO project_materias (project_id, materia_id) VALUES (v_project_id, v_materia_id);
  END LOOP;

  -- Wizard input: students
  FOR v_student_id IN
    SELECT s::uuid FROM jsonb_array_elements_text(plan->'student_ids') AS s
  LOOP
    INSERT INTO project_students (project_id, student_id) VALUES (v_project_id, v_student_id);
  END LOOP;

  -- DBA targets
  FOR v_target IN SELECT * FROM jsonb_array_elements(plan->'dba_targets') LOOP
    INSERT INTO project_dba_targets (
      project_id, grado, materia_id, dba_id, evidencia_id, orden
    )
    VALUES (
      v_project_id,
      (v_target->>'grado')::int,
      (v_target->>'materia_id')::uuid,
      (v_target->>'dba_id')::uuid,
      NULLIF(v_target->>'evidencia_id', '')::uuid,
      (v_target->>'orden')::int
    );
  END LOOP;

  -- Materiales (position = array index + 1)
  v_orden := 0;
  FOR v_nombre IN
    SELECT m FROM jsonb_array_elements_text(plan->'materiales') AS m
  LOOP
    v_orden := v_orden + 1;
    INSERT INTO project_materiales (project_id, orden, nombre)
    VALUES (v_project_id, v_orden, v_nombre);
  END LOOP;

  -- Fases: validate each bloque's structure, then insert the phase row.
  FOR v_fase IN SELECT * FROM jsonb_array_elements(plan->'fases') LOOP
    IF jsonb_typeof(v_fase->'bloques') = 'array' THEN
      FOR v_bloque IN SELECT * FROM jsonb_array_elements(v_fase->'bloques') LOOP
        IF COALESCE(v_bloque->>'tipo', '') NOT IN
             ('inicio', 'rompehielos', 'experiencia', 'actividad', 'actividad_por_grados', 'tarea', 'cierre')
           OR COALESCE(v_bloque->>'titulo', '') = ''
           OR COALESCE(v_bloque->>'contenido', '') = '' THEN
          RAISE EXCEPTION 'create_project_from_plan: malformed bloque in fase %', v_fase->>'orden';
        END IF;
        IF (v_bloque->>'tipo' = 'actividad_por_grados')
           IS DISTINCT FROM (jsonb_typeof(v_bloque->'variantes_por_grado') = 'array') THEN
          RAISE EXCEPTION 'create_project_from_plan: variantes_por_grado mismatch in fase %', v_fase->>'orden';
        END IF;
      END LOOP;
    END IF;

    INSERT INTO project_phases (project_id, orden, etapa, nombre, gran_pregunta, bloques)
    VALUES (
      v_project_id,
      (v_fase->>'orden')::int,
      v_fase->>'etapa',
      v_fase->>'nombre',
      NULLIF(v_fase->>'gran_pregunta', ''),
      v_fase->'bloques'
    );
  END LOOP;

  RETURN v_project_id;
END;
$$;

-- Only the service role (API route) may call this — teachers never write projects directly.
REVOKE EXECUTE ON FUNCTION create_project_from_plan FROM PUBLIC, authenticated, anon;
