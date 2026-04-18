-- Colombiando PBL Project Creator schema (v1.3)
-- Tables: projects + 9 related tables for the generated plan + append-only generation log.
-- Design lives at ~/.gstack/projects/juanfelipecm-colombiandapp/juanfcastillom-main-design-20260417-182548.md
--
-- Architecture notes:
--   - Projects are RLS-scoped to teacher_id = auth.uid().
--   - DBA cap (1-2 per grade × materia) enforced at the schema layer via
--     unique (project_id, grado, materia_id, orden) + check orden IN (1,2)
--     on project_dba_targets.
--   - project_activity_dba_refs has a trigger enforcing that the referenced
--     dba_target has the same (grado, materia_id) as the referencing activity.
--   - project_generation_logs is APPEND-ONLY audit. project_id is nullable
--     with ON DELETE SET NULL so the log survives project archival/deletion.
--     Denormalizes teacher_id, prompt_version, model, inputs_jsonb, raw_output_jsonb
--     so a row is self-describing without joining back to projects.
--   - create_project_from_plan(jsonb) is the ONLY way to insert a complete
--     project; everything is transactional inside it.

-- ============================================================
-- projects: one row per generated PBL project
-- ============================================================
CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  school_id  uuid NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
  -- Client-generated UUID v4 sent in the Idempotency-Key header. Protects against
  -- double-tap on "Generar" while allowing legitimate regeneration (fresh UUID).
  idempotency_key uuid NOT NULL UNIQUE,

  -- AI-generated project content
  titulo           text NOT NULL,
  pregunta_guia    text NOT NULL,
  tema_contexto    text,                -- optional teacher free-text input
  duracion_semanas int  NOT NULL CHECK (duracion_semanas IN (1, 2)),
  producto_final   text NOT NULL,
  cierre_actividad text NOT NULL,
  cierre_evaluacion text NOT NULL,

  -- Lifecycle
  status text NOT NULL DEFAULT 'generado'
    CHECK (status IN ('generado', 'en_ensenanza', 'completado', 'archivado')),
  se_enseno_bien boolean,   -- nullable; set only when status='completado'

  -- Prompt ops
  prompt_version text NOT NULL,
  model          text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_teacher_created_at
  ON projects (teacher_id, created_at DESC);

CREATE INDEX idx_projects_teacher_status
  ON projects (teacher_id, status);

CREATE TRIGGER set_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can read own projects"
  ON projects FOR SELECT
  USING (teacher_id = auth.uid());

CREATE POLICY "Teachers can insert own projects"
  ON projects FOR INSERT
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Teachers can update own projects"
  ON projects FOR UPDATE
  USING (teacher_id = auth.uid());

CREATE POLICY "Teachers can delete own projects"
  ON projects FOR DELETE
  USING (teacher_id = auth.uid());

-- ============================================================
-- RLS helper: is_project_owner
-- Defined AFTER projects so the SQL-language body parses cleanly.
-- Reusable across all project_* child tables so policies stay simple.
-- Marked STABLE so Postgres can inline it inside RLS contexts.
-- Safe to leave EXECUTE-able by authenticated: only returns true for the
-- caller's own projects, so it leaks no cross-teacher state.
-- ============================================================
CREATE OR REPLACE FUNCTION is_project_owner(p_project_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects WHERE id = p_project_id AND teacher_id = auth.uid()
  );
$$;

-- ============================================================
-- project_grados: which grades the teacher selected (wizard input)
-- ============================================================
CREATE TABLE project_grados (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  grado int NOT NULL CHECK (grado BETWEEN 0 AND 5),  -- v1: primary only
  PRIMARY KEY (project_id, grado)
);

ALTER TABLE project_grados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can read own project_grados"
  ON project_grados FOR SELECT USING (is_project_owner(project_id));
CREATE POLICY "Teachers can write own project_grados"
  ON project_grados FOR ALL
  USING (is_project_owner(project_id))
  WITH CHECK (is_project_owner(project_id));

-- ============================================================
-- project_materias: which subjects the teacher selected (wizard input)
-- ============================================================
CREATE TABLE project_materias (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  materia_id uuid NOT NULL REFERENCES materias(id),
  PRIMARY KEY (project_id, materia_id)
);

ALTER TABLE project_materias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can read own project_materias"
  ON project_materias FOR SELECT USING (is_project_owner(project_id));
CREATE POLICY "Teachers can write own project_materias"
  ON project_materias FOR ALL
  USING (is_project_owner(project_id))
  WITH CHECK (is_project_owner(project_id));

-- ============================================================
-- project_students: which specific students are in this project (wizard input)
-- Default in wizard: all teacher's students.
-- ============================================================
CREATE TABLE project_students (
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, student_id)
);

ALTER TABLE project_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can read own project_students"
  ON project_students FOR SELECT USING (is_project_owner(project_id));
CREATE POLICY "Teachers can write own project_students"
  ON project_students FOR ALL
  USING (is_project_owner(project_id))
  WITH CHECK (is_project_owner(project_id));

-- ============================================================
-- project_dba_targets: THE 1–2 DBAs per (grade × materia) pair.
-- This is where the DBA cap is actually enforced, per the v1.2 architectural decision.
-- Activities reference targets via project_activity_dba_refs — they do not pick
-- DBAs freely per phase.
-- ============================================================
CREATE TABLE project_dba_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  grado int NOT NULL CHECK (grado BETWEEN 0 AND 5),
  materia_id uuid NOT NULL REFERENCES materias(id),
  dba_id uuid NOT NULL REFERENCES derechos_basicos_aprendizaje(id),
  evidencia_id uuid REFERENCES evidencias_aprendizaje(id),   -- null allowed for Inglés
  orden int NOT NULL CHECK (orden IN (1, 2)),
  UNIQUE (project_id, grado, materia_id, dba_id),
  UNIQUE (project_id, grado, materia_id, orden)
);

CREATE INDEX idx_dba_targets_project
  ON project_dba_targets (project_id);

ALTER TABLE project_dba_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can read own dba_targets"
  ON project_dba_targets FOR SELECT USING (is_project_owner(project_id));
CREATE POLICY "Teachers can write own dba_targets"
  ON project_dba_targets FOR ALL
  USING (is_project_owner(project_id))
  WITH CHECK (is_project_owner(project_id));

-- ============================================================
-- project_phases: ordered phases (Fase 1, Fase 2, ...) of the project
-- ============================================================
CREATE TABLE project_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  orden int NOT NULL CHECK (orden BETWEEN 1 AND 4),
  nombre text NOT NULL,
  dias_label text NOT NULL,
  descripcion text NOT NULL,
  UNIQUE (project_id, orden)
);

CREATE INDEX idx_phases_project ON project_phases (project_id);

ALTER TABLE project_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can read own phases"
  ON project_phases FOR SELECT USING (is_project_owner(project_id));
CREATE POLICY "Teachers can write own phases"
  ON project_phases FOR ALL
  USING (is_project_owner(project_id))
  WITH CHECK (is_project_owner(project_id));

-- ============================================================
-- project_activities: per (phase × grade × materia) activity.
-- A multi-materia project has up to N_materias activities per (phase × grade).
-- ============================================================
CREATE TABLE project_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id uuid NOT NULL REFERENCES project_phases(id) ON DELETE CASCADE,
  grado int NOT NULL CHECK (grado BETWEEN 0 AND 5),
  materia_id uuid NOT NULL REFERENCES materias(id),
  tarea text NOT NULL,
  evidencia_observable text NOT NULL,
  UNIQUE (phase_id, grado, materia_id)
);

CREATE INDEX idx_activities_phase ON project_activities (phase_id);
CREATE INDEX idx_activities_grade_materia ON project_activities (grado, materia_id);

ALTER TABLE project_activities ENABLE ROW LEVEL SECURITY;

-- RLS via chain: activity → phase → project → teacher_id = auth.uid()
CREATE POLICY "Teachers can read own activities"
  ON project_activities FOR SELECT
  USING (EXISTS (
    SELECT 1
    FROM project_phases ph
    JOIN projects p ON p.id = ph.project_id
    WHERE ph.id = project_activities.phase_id
      AND p.teacher_id = auth.uid()
  ));

CREATE POLICY "Teachers can write own activities"
  ON project_activities FOR ALL
  USING (EXISTS (
    SELECT 1
    FROM project_phases ph
    JOIN projects p ON p.id = ph.project_id
    WHERE ph.id = project_activities.phase_id
      AND p.teacher_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM project_phases ph
    JOIN projects p ON p.id = ph.project_id
    WHERE ph.id = project_activities.phase_id
      AND p.teacher_id = auth.uid()
  ));

-- ============================================================
-- project_activity_dba_refs: link table connecting activities to project-level DBA targets.
-- Trigger enforces that the referenced dba_target has the same (grado, materia_id)
-- as the activity — an activity can only reference targets for its own grade+materia.
-- ============================================================
CREATE TABLE project_activity_dba_refs (
  activity_id   uuid NOT NULL REFERENCES project_activities(id)   ON DELETE CASCADE,
  dba_target_id uuid NOT NULL REFERENCES project_dba_targets(id)  ON DELETE CASCADE,
  PRIMARY KEY (activity_id, dba_target_id)
);

ALTER TABLE project_activity_dba_refs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can read own activity_dba_refs"
  ON project_activity_dba_refs FOR SELECT
  USING (EXISTS (
    SELECT 1
    FROM project_activities a
    JOIN project_phases ph ON ph.id = a.phase_id
    JOIN projects p ON p.id = ph.project_id
    WHERE a.id = project_activity_dba_refs.activity_id
      AND p.teacher_id = auth.uid()
  ));

CREATE POLICY "Teachers can write own activity_dba_refs"
  ON project_activity_dba_refs FOR ALL
  USING (EXISTS (
    SELECT 1
    FROM project_activities a
    JOIN project_phases ph ON ph.id = a.phase_id
    JOIN projects p ON p.id = ph.project_id
    WHERE a.id = project_activity_dba_refs.activity_id
      AND p.teacher_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1
    FROM project_activities a
    JOIN project_phases ph ON ph.id = a.phase_id
    JOIN projects p ON p.id = ph.project_id
    WHERE a.id = project_activity_dba_refs.activity_id
      AND p.teacher_id = auth.uid()
  ));

-- Integrity trigger: the referenced dba_target must match the activity's (grado, materia_id).
CREATE OR REPLACE FUNCTION check_activity_dba_ref_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  a_grado      int;
  a_materia_id uuid;
  a_project_id uuid;
  t_grado      int;
  t_materia_id uuid;
  t_project_id uuid;
BEGIN
  SELECT a.grado, a.materia_id, ph.project_id
    INTO a_grado, a_materia_id, a_project_id
  FROM project_activities a
  JOIN project_phases ph ON ph.id = a.phase_id
  WHERE a.id = NEW.activity_id;

  SELECT t.grado, t.materia_id, t.project_id
    INTO t_grado, t_materia_id, t_project_id
  FROM project_dba_targets t
  WHERE t.id = NEW.dba_target_id;

  IF a_project_id IS DISTINCT FROM t_project_id THEN
    RAISE EXCEPTION
      'activity_dba_ref: activity and dba_target belong to different projects';
  END IF;

  IF a_grado IS DISTINCT FROM t_grado
     OR a_materia_id IS DISTINCT FROM t_materia_id THEN
    RAISE EXCEPTION
      'activity_dba_ref: activity (grado=%, materia=%) must match target (grado=%, materia=%)',
      a_grado, a_materia_id, t_grado, t_materia_id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_activity_dba_ref_consistency
  BEFORE INSERT OR UPDATE ON project_activity_dba_refs
  FOR EACH ROW EXECUTE FUNCTION check_activity_dba_ref_consistency();

-- ============================================================
-- project_materiales: ordered list of materials needed
-- ============================================================
CREATE TABLE project_materiales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  orden int NOT NULL,
  nombre text NOT NULL,
  UNIQUE (project_id, orden)
);

CREATE INDEX idx_materiales_project ON project_materiales (project_id);

ALTER TABLE project_materiales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can read own materiales"
  ON project_materiales FOR SELECT USING (is_project_owner(project_id));
CREATE POLICY "Teachers can write own materiales"
  ON project_materiales FOR ALL
  USING (is_project_owner(project_id))
  WITH CHECK (is_project_owner(project_id));

-- ============================================================
-- project_generation_logs: APPEND-ONLY audit of every Anthropic call.
-- project_id is nullable + ON DELETE SET NULL so the log survives project
-- deletion. Denormalized columns make each row self-describing.
-- Every attempt (first try + retry) gets its own row; parent_attempt_id
-- links a retry back to the original failed attempt.
-- ============================================================
CREATE TABLE project_generation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Nullable: SET NULL on project delete so log survives.
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  -- Denormalized so the row is self-describing without a live project.
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,

  -- Always set, even on pre-insert failure — groups retries of the same logical generation.
  idempotency_key uuid NOT NULL,

  -- Attempt chain: first Anthropic call = 1, retry = 2. parent_attempt_id points
  -- a retry row back to the first attempt's id.
  attempt_number int NOT NULL DEFAULT 1 CHECK (attempt_number BETWEEN 1 AND 2),
  parent_attempt_id uuid REFERENCES project_generation_logs(id) ON DELETE SET NULL,

  status text NOT NULL
    CHECK (status IN ('pending', 'success', 'validation_failed', 'api_error', 'timeout', 'db_error')),

  prompt_version text NOT NULL,
  model          text NOT NULL,

  inputs_jsonb     jsonb NOT NULL,
  raw_output_jsonb jsonb,   -- null on api_error before the model produced any output

  tokens_input   int,
  tokens_output  int,
  latency_ms     int,
  error_message  text,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- For daily-cap queries: count DISTINCT idempotency_key per teacher per day.
CREATE INDEX idx_gen_logs_teacher_date_status
  ON project_generation_logs (teacher_id, created_at DESC, status);

-- For admin trend queries.
CREATE INDEX idx_gen_logs_prompt_version
  ON project_generation_logs (prompt_version, created_at DESC);

ALTER TABLE project_generation_logs ENABLE ROW LEVEL SECURITY;

-- Teachers can read their own logs only. Admin page uses the service role client
-- (bypasses RLS) to see logs across all teachers.
CREATE POLICY "Teachers can read own generation logs"
  ON project_generation_logs FOR SELECT
  USING (teacher_id = auth.uid());

-- Teachers CANNOT write to the generation log from the client. API route does it
-- via the service role client. Policy: no INSERT/UPDATE/DELETE for authenticated role.

-- ============================================================
-- create_project_from_plan(jsonb) — the ONLY way to insert a complete project.
-- Called from app/api/proyectos/generate/route.ts using the service role client
-- AFTER the API route has validated the plan and resolved DBA tokens → UUIDs.
--
-- Input payload shape (all fields required unless noted):
-- {
--   "teacher_id":        "uuid",
--   "school_id":         "uuid",
--   "idempotency_key":   "uuid",
--   "header": {
--     "titulo": "...",
--     "pregunta_guia": "...",
--     "tema_contexto": "...|null",
--     "duracion_semanas": 1,
--     "producto_final": "...",
--     "cierre_actividad": "...",
--     "cierre_evaluacion": "...",
--     "prompt_version": "pbl-v1",
--     "model": "claude-opus-4-7"
--   },
--   "grados":        [1, 2, 3],
--   "materia_ids":   ["uuid", "uuid"],
--   "student_ids":   ["uuid", ...],
--   "dba_targets": [
--     { "grado": 1, "materia_id": "uuid", "dba_id": "uuid",
--       "evidencia_id": "uuid|null", "orden": 1 },
--     ...
--   ],
--   "materiales": ["papel", "lápices", ...],
--   "fases": [
--     {
--       "orden": 1,
--       "nombre": "...",
--       "dias_label": "...",
--       "descripcion": "...",
--       "activities": [
--         {
--           "grado": 1,
--           "materia_id": "uuid",
--           "tarea": "...",
--           "evidencia_observable": "...",
--           "dba_ids": ["uuid", ...]  -- matches dba_targets in the same (grado, materia_id)
--         }, ...
--       ]
--     }, ...
--   ]
-- }
--
-- Returns the new project_id. Atomic: on any failure, the whole transaction rolls back.
-- ============================================================
CREATE OR REPLACE FUNCTION create_project_from_plan(plan jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project_id uuid;
  v_phase_id uuid;
  v_activity_id uuid;
  v_dba_target_id uuid;
  v_header jsonb;
  v_fase jsonb;
  v_activity jsonb;
  v_target jsonb;
  v_grado int;
  v_materia_id uuid;
  v_dba_id uuid;
  v_student_id uuid;
  v_nombre text;
  v_orden int;
BEGIN
  v_header := plan->'header';

  -- Header row
  INSERT INTO projects (
    teacher_id, school_id, idempotency_key,
    titulo, pregunta_guia, tema_contexto, duracion_semanas,
    producto_final, cierre_actividad, cierre_evaluacion,
    prompt_version, model
  )
  VALUES (
    (plan->>'teacher_id')::uuid,
    (plan->>'school_id')::uuid,
    (plan->>'idempotency_key')::uuid,
    v_header->>'titulo',
    v_header->>'pregunta_guia',
    NULLIF(v_header->>'tema_contexto', ''),
    (v_header->>'duracion_semanas')::int,
    v_header->>'producto_final',
    v_header->>'cierre_actividad',
    v_header->>'cierre_evaluacion',
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

  -- Phases + activities + activity_dba_refs
  FOR v_fase IN SELECT * FROM jsonb_array_elements(plan->'fases') LOOP
    INSERT INTO project_phases (project_id, orden, nombre, dias_label, descripcion)
    VALUES (
      v_project_id,
      (v_fase->>'orden')::int,
      v_fase->>'nombre',
      v_fase->>'dias_label',
      v_fase->>'descripcion'
    )
    RETURNING id INTO v_phase_id;

    FOR v_activity IN SELECT * FROM jsonb_array_elements(v_fase->'activities') LOOP
      INSERT INTO project_activities (
        phase_id, grado, materia_id, tarea, evidencia_observable
      )
      VALUES (
        v_phase_id,
        (v_activity->>'grado')::int,
        (v_activity->>'materia_id')::uuid,
        v_activity->>'tarea',
        v_activity->>'evidencia_observable'
      )
      RETURNING id INTO v_activity_id;

      -- Link each dba_id referenced by this activity to the matching dba_target row
      -- for the same (project, grado, materia_id, dba_id). The unique index on
      -- project_dba_targets (project_id, grado, materia_id, dba_id) makes the lookup exact.
      FOR v_dba_id IN
        SELECT d::uuid FROM jsonb_array_elements_text(v_activity->'dba_ids') AS d
      LOOP
        SELECT id INTO v_dba_target_id
        FROM project_dba_targets
        WHERE project_id = v_project_id
          AND grado = (v_activity->>'grado')::int
          AND materia_id = (v_activity->>'materia_id')::uuid
          AND dba_id = v_dba_id;

        IF v_dba_target_id IS NULL THEN
          RAISE EXCEPTION
            'create_project_from_plan: activity dba_id % not found in dba_targets for (grado=%, materia=%)',
            v_dba_id, v_activity->>'grado', v_activity->>'materia_id';
        END IF;

        INSERT INTO project_activity_dba_refs (activity_id, dba_target_id)
        VALUES (v_activity_id, v_dba_target_id);
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN v_project_id;
END;
$$;

-- Only the service role (API route) may call this — teachers never write projects directly.
REVOKE EXECUTE ON FUNCTION create_project_from_plan FROM PUBLIC, authenticated, anon;
