-- pgTAP suite for create_project_from_plan(jsonb) — Clase Viva (008_clase_viva.sql)
-- Run with: supabase test db
--
-- Scenarios:
--   1. Happy path: 5 fases, nombre stored, tarea_previa stored, bloques kept
--   2. Inglés-only: evidencia_id NULL accepted
--   3. Single-grade project accepted
--   4. Stress: 5 grades × 8 bloques per fase accepted; nothing written to project_activities
--   5. Duplicate DBA target → 23505
--   6. Three DBAs for one (grado, materia) → 23514
--   7. 4 fases → P0001;  7b. 6 fases → P0001
--   8. Nonexistent dba_id → 23503
--   9. etapa at the wrong orden → 23514
--  10. Partial failure (fase orden 99) → full rollback
--  11. bloques with 1 element → 23514; bloques as an object → 23514
--  12. variantes on a non-band bloque → P0001; actividad_por_grados without variantes → P0001
--  13. tarea_previa '' stored as NULL
--  14. Unknown bloque tipo → P0001

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

-- ============================================================
-- Shared fixtures (rolled back by the final ROLLBACK)
-- ============================================================

INSERT INTO auth.users (id) VALUES ('00000000-0000-0000-0000-000000000001');
INSERT INTO teachers (id, first_name, last_name)
  VALUES ('00000000-0000-0000-0000-000000000001', 'Diana', 'Molina');

INSERT INTO schools (id, teacher_id, name, department, municipality, grades)
  VALUES (
    '00000000-0000-0000-0000-00000000000a',
    '00000000-0000-0000-0000-000000000001',
    'Escuela Test', 'Sucre', 'Test Municipality', ARRAY[1,2,3,4,5]
  );

INSERT INTO students (id, school_id, first_name, last_name, birth_date, grade) VALUES
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000a', 'Ana',   'Pérez', DATE '2018-05-01', 1),
  ('00000000-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-00000000000a', 'Bruno', 'Gómez', DATE '2014-05-01', 5);

DO $$
DECLARE
  v_lenguaje_id uuid;
  v_mat_id      uuid;
  v_ingles_id   uuid;
BEGIN
  SELECT id INTO v_lenguaje_id FROM materias WHERE slug = 'lenguaje';
  SELECT id INTO v_mat_id      FROM materias WHERE slug = 'matematicas';
  SELECT id INTO v_ingles_id   FROM materias WHERE slug = 'ingles';

  INSERT INTO derechos_basicos_aprendizaje (id, materia_id, grado, numero, enunciado) VALUES
    ('11111111-1111-1111-1111-000000000001', v_lenguaje_id, 1, 1, 'L-1 enunciado'),
    ('11111111-1111-1111-1111-000000000002', v_lenguaje_id, 1, 2, 'L-2 enunciado'),
    ('11111111-1111-1111-1111-000000000003', v_lenguaje_id, 1, 3, 'L-3 enunciado');
  INSERT INTO evidencias_aprendizaje (id, dba_id, numero, descripcion) VALUES
    ('22222222-1111-1111-1111-000000000001', '11111111-1111-1111-1111-000000000001', 1, 'L-1 Ev 1'),
    ('22222222-1111-1111-1111-000000000002', '11111111-1111-1111-1111-000000000002', 1, 'L-2 Ev 1'),
    ('22222222-1111-1111-1111-000000000003', '11111111-1111-1111-1111-000000000003', 1, 'L-3 Ev 1');

  INSERT INTO derechos_basicos_aprendizaje (id, materia_id, grado, numero, enunciado) VALUES
    ('55555555-1111-1111-1111-000000000001', v_mat_id, 1, 1, 'M-1'),
    ('55555555-1111-1111-1111-000000000002', v_mat_id, 2, 1, 'M-2'),
    ('55555555-1111-1111-1111-000000000003', v_mat_id, 3, 1, 'M-3'),
    ('55555555-1111-1111-1111-000000000004', v_mat_id, 4, 1, 'M-4'),
    ('55555555-1111-1111-1111-000000000005', v_mat_id, 5, 1, 'M-5');
  INSERT INTO evidencias_aprendizaje (id, dba_id, numero, descripcion) VALUES
    ('66666666-1111-1111-1111-000000000001', '55555555-1111-1111-1111-000000000001', 1, 'M-1 Ev'),
    ('66666666-1111-1111-1111-000000000002', '55555555-1111-1111-1111-000000000002', 1, 'M-2 Ev'),
    ('66666666-1111-1111-1111-000000000003', '55555555-1111-1111-1111-000000000003', 1, 'M-3 Ev'),
    ('66666666-1111-1111-1111-000000000004', '55555555-1111-1111-1111-000000000004', 1, 'M-4 Ev'),
    ('66666666-1111-1111-1111-000000000005', '55555555-1111-1111-1111-000000000005', 1, 'M-5 Ev');

  -- Inglés, grade 3 — no evidencias (matches the real seed)
  INSERT INTO derechos_basicos_aprendizaje (id, materia_id, grado, numero, enunciado) VALUES
    ('77777777-1111-1111-1111-000000000003', v_ingles_id, 3, 1, 'I-3 enunciado');
END $$;

-- ============================================================
-- Payload builders
--   cv_bloque(tipo, variantes)      one bloque
--   cv_fases(n, n_blocks)           n fases in etapa order, n_blocks bloques each
--   cv_target(grado, slug, dba, ev) one dba_target
--   cv_plan(key, grados, slug, targets, fases, tarea_previa)
-- ============================================================

CREATE FUNCTION pg_temp.cv_bloque(p_tipo text, p_variantes jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'tipo', p_tipo,
    'titulo', initcap(replace(p_tipo, '_', ' ')),
    'contenido', 'Pide a los estudiantes que observen la panela y conversen en círculo.',
    'variantes_por_grado', COALESCE(p_variantes, 'null'::jsonb),
    'tip_profe', 'null'::jsonb)
$$;

CREATE FUNCTION pg_temp.cv_fases(p_n int DEFAULT 5, p_blocks int DEFAULT 3)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_agg(
    jsonb_build_object(
      'orden', i,
      'etapa', (ARRAY['despertar_curiosidad','indagar_investigar','crear','reflexionar','compartir'])[((i - 1) % 5) + 1],
      'nombre', (ARRAY['Despertar la curiosidad','Indagar e investigar','Crear','Reflexionar','Compartir'])[((i - 1) % 5) + 1],
      'gran_pregunta', '¿Qué descubrimos en la fase ' || i || '?',
      'bloques', (
        SELECT jsonb_agg(pg_temp.cv_bloque(
          CASE WHEN b = 1 THEN 'inicio' WHEN b = p_blocks THEN 'cierre' ELSE 'actividad' END) ORDER BY b)
        FROM generate_series(1, p_blocks) AS b)
    ) ORDER BY i)
  FROM generate_series(1, p_n) AS i
$$;

CREATE FUNCTION pg_temp.cv_target(p_grado int, p_slug text, p_dba uuid, p_ev uuid, p_orden int DEFAULT 1)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'grado', p_grado,
    'materia_id', (SELECT id FROM materias WHERE slug = p_slug),
    'dba_id', p_dba,
    'evidencia_id', p_ev,
    'orden', p_orden)
$$;

CREATE FUNCTION pg_temp.cv_plan(
  p_key uuid, p_grados jsonb, p_slug text, p_targets jsonb, p_fases jsonb,
  p_tarea text DEFAULT 'Pide a los estudiantes que pregunten en casa qué recetas llevan panela.')
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'teacher_id', '00000000-0000-0000-0000-000000000001'::uuid,
    'school_id',  '00000000-0000-0000-0000-00000000000a'::uuid,
    'idempotency_key', p_key,
    'header', jsonb_build_object(
      'titulo', 'En nuestras venas, la panela',
      'pregunta_guia', '¿Cómo contar la historia de una enramada?',
      'tema_contexto', '',
      'tarea_previa', p_tarea,
      'prompt_version', 'clase-viva-v1',
      'model', 'claude-opus-4-7'),
    'grados', p_grados,
    'materia_ids', jsonb_build_array((SELECT id FROM materias WHERE slug = p_slug)),
    'student_ids', jsonb_build_array('00000000-0000-0000-0000-00000000000b'::uuid),
    'dba_targets', p_targets,
    'materiales', jsonb_build_array('papel', 'lápiz', 'panela'),
    'fases', p_fases)
$$;

CREATE FUNCTION pg_temp.cv_l1() RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_array(pg_temp.cv_target(1, 'lenguaje',
    '11111111-1111-1111-1111-000000000001'::uuid, '22222222-1111-1111-1111-000000000001'::uuid))
$$;

SELECT plan(23);

CREATE TEMP TABLE t_result (scenario text, project_id uuid);

-- ============================================================
-- 1. Happy path
-- ============================================================
INSERT INTO t_result (scenario, project_id)
SELECT 's1', create_project_from_plan(pg_temp.cv_plan(
  'aaaaaaaa-aaaa-aaaa-aaaa-000000000001', '[1]', 'lenguaje', pg_temp.cv_l1(), pg_temp.cv_fases()));

SELECT ok((SELECT project_id IS NOT NULL FROM t_result WHERE scenario = 's1'),
  '1. happy path returns a project_id');
SELECT is((SELECT count(*)::int FROM project_phases WHERE project_id = (SELECT project_id FROM t_result WHERE scenario = 's1')),
  5, '1b. five phases inserted');
SELECT is((SELECT nombre FROM project_phases WHERE orden = 3 AND project_id = (SELECT project_id FROM t_result WHERE scenario = 's1')),
  'Crear', '1c. fase nombre stored from the payload');
SELECT is((SELECT tarea_previa FROM projects WHERE id = (SELECT project_id FROM t_result WHERE scenario = 's1')),
  'Pide a los estudiantes que pregunten en casa qué recetas llevan panela.', '1d. tarea_previa stored');
SELECT is((SELECT jsonb_array_length(bloques) FROM project_phases WHERE orden = 1 AND project_id = (SELECT project_id FROM t_result WHERE scenario = 's1')),
  3, '1e. bloques jsonb kept intact');

-- ============================================================
-- 2. Inglés-only
-- ============================================================
INSERT INTO t_result (scenario, project_id)
SELECT 's2', create_project_from_plan(pg_temp.cv_plan(
  'aaaaaaaa-aaaa-aaaa-aaaa-000000000002', '[3]', 'ingles',
  jsonb_build_array(pg_temp.cv_target(3, 'ingles', '77777777-1111-1111-1111-000000000003'::uuid, NULL)),
  pg_temp.cv_fases()));

SELECT ok((SELECT project_id IS NOT NULL FROM t_result WHERE scenario = 's2'),
  '2. Inglés-only project inserts');
SELECT is((SELECT evidencia_id FROM project_dba_targets WHERE project_id = (SELECT project_id FROM t_result WHERE scenario = 's2')),
  NULL::uuid, '2b. Inglés dba_target has NULL evidencia_id');

-- ============================================================
-- 3. Single grade
-- ============================================================
INSERT INTO t_result (scenario, project_id)
SELECT 's3', create_project_from_plan(pg_temp.cv_plan(
  'aaaaaaaa-aaaa-aaaa-aaaa-000000000003', '[1]', 'lenguaje', pg_temp.cv_l1(), pg_temp.cv_fases(5, 2)));
SELECT ok((SELECT project_id IS NOT NULL FROM t_result WHERE scenario = 's3'),
  '3. single-grade project accepted');

-- ============================================================
-- 4. Stress: 5 grades × 8 bloques per fase
-- ============================================================
INSERT INTO t_result (scenario, project_id)
SELECT 's4', create_project_from_plan(pg_temp.cv_plan(
  'aaaaaaaa-aaaa-aaaa-aaaa-000000000004', '[1,2,3,4,5]', 'matematicas',
  (SELECT jsonb_agg(pg_temp.cv_target(g, 'matematicas',
     ('55555555-1111-1111-1111-00000000000' || g)::uuid,
     ('66666666-1111-1111-1111-00000000000' || g)::uuid) ORDER BY g)
   FROM generate_series(1, 5) AS g),
  pg_temp.cv_fases(5, 8)));

SELECT ok((SELECT project_id IS NOT NULL FROM t_result WHERE scenario = 's4'),
  '4. stress 5 grades × 8 bloques accepted');
SELECT is((SELECT count(*)::int FROM project_activities a JOIN project_phases p ON p.id = a.phase_id
           WHERE p.project_id = (SELECT project_id FROM t_result WHERE scenario = 's4')),
  0, '4b. nothing written to legacy project_activities');

-- ============================================================
-- 5. Duplicate DBA in the same pair → unique violation
-- ============================================================
SELECT throws_ok($$
  SELECT create_project_from_plan(pg_temp.cv_plan(
    'aaaaaaaa-aaaa-aaaa-aaaa-000000000005', '[1]', 'lenguaje',
    pg_temp.cv_l1() || jsonb_build_array(pg_temp.cv_target(1, 'lenguaje',
      '11111111-1111-1111-1111-000000000001'::uuid, '22222222-1111-1111-1111-000000000001'::uuid, 2)),
    pg_temp.cv_fases()))
$$, '23505', NULL, '5. duplicate DBA in same (grado, materia) rejected');

-- ============================================================
-- 6. Three DBAs for one pair → orden check
-- ============================================================
SELECT throws_ok($$
  SELECT create_project_from_plan(pg_temp.cv_plan(
    'aaaaaaaa-aaaa-aaaa-aaaa-000000000006', '[1]', 'lenguaje',
    jsonb_build_array(
      pg_temp.cv_target(1, 'lenguaje', '11111111-1111-1111-1111-000000000001'::uuid, '22222222-1111-1111-1111-000000000001'::uuid, 1),
      pg_temp.cv_target(1, 'lenguaje', '11111111-1111-1111-1111-000000000002'::uuid, '22222222-1111-1111-1111-000000000002'::uuid, 2),
      pg_temp.cv_target(1, 'lenguaje', '11111111-1111-1111-1111-000000000003'::uuid, '22222222-1111-1111-1111-000000000003'::uuid, 3)),
    pg_temp.cv_fases()))
$$, '23514', NULL, '6. three DBAs per (grado, materia) rejected');

-- ============================================================
-- 7. Wrong number of fases
-- ============================================================
SELECT throws_ok($$
  SELECT create_project_from_plan(pg_temp.cv_plan(
    'aaaaaaaa-aaaa-aaaa-aaaa-000000000007', '[1]', 'lenguaje', pg_temp.cv_l1(), pg_temp.cv_fases(4)))
$$, 'P0001', NULL, '7. four fases rejected');
SELECT throws_ok($$
  SELECT create_project_from_plan(pg_temp.cv_plan(
    'aaaaaaaa-aaaa-aaaa-aaaa-000000000017', '[1]', 'lenguaje', pg_temp.cv_l1(), pg_temp.cv_fases(6)))
$$, 'P0001', NULL, '7b. six fases rejected');

-- ============================================================
-- 8. Nonexistent dba_id → FK
-- ============================================================
SELECT throws_ok($$
  SELECT create_project_from_plan(pg_temp.cv_plan(
    'aaaaaaaa-aaaa-aaaa-aaaa-000000000008', '[1]', 'lenguaje',
    jsonb_build_array(pg_temp.cv_target(1, 'lenguaje', 'deadbeef-dead-beef-dead-beefdeadbeef'::uuid, NULL)),
    pg_temp.cv_fases()))
$$, '23503', NULL, '8. nonexistent dba_id rejected by FK');

-- ============================================================
-- 9. etapa at the wrong orden
-- ============================================================
SELECT throws_ok($$
  SELECT create_project_from_plan(pg_temp.cv_plan(
    'aaaaaaaa-aaaa-aaaa-aaaa-000000000009', '[1]', 'lenguaje', pg_temp.cv_l1(),
    jsonb_set(pg_temp.cv_fases(), '{0,etapa}', '"crear"')))
$$, '23514', NULL, '9. etapa crear at orden 1 rejected');

-- ============================================================
-- 10. Partial failure → full rollback
-- ============================================================
CREATE TEMP TABLE t_rollback_check (step text, count int);
INSERT INTO t_rollback_check (step, count) SELECT 'before', count(*)::int FROM projects;

DO $$
BEGIN
  BEGIN
    PERFORM create_project_from_plan(pg_temp.cv_plan(
      'aaaaaaaa-aaaa-aaaa-aaaa-000000000010', '[1]', 'lenguaje', pg_temp.cv_l1(),
      jsonb_set(pg_temp.cv_fases(), '{4,orden}', '99')));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

INSERT INTO t_rollback_check (step, count) SELECT 'after', count(*)::int FROM projects;
SELECT is(
  (SELECT count FROM t_rollback_check WHERE step = 'before'),
  (SELECT count FROM t_rollback_check WHERE step = 'after'),
  '10. partial failure rolls back the whole project');

-- ============================================================
-- 11. bloques shape
-- ============================================================
SELECT throws_ok($$
  SELECT create_project_from_plan(pg_temp.cv_plan(
    'aaaaaaaa-aaaa-aaaa-aaaa-000000000011', '[1]', 'lenguaje', pg_temp.cv_l1(),
    jsonb_set(pg_temp.cv_fases(), '{0,bloques}', jsonb_build_array(pg_temp.cv_bloque('inicio')))))
$$, '23514', NULL, '11. a fase with 1 bloque rejected');
SELECT throws_ok($$
  SELECT create_project_from_plan(pg_temp.cv_plan(
    'aaaaaaaa-aaaa-aaaa-aaaa-000000000021', '[1]', 'lenguaje', pg_temp.cv_l1(),
    jsonb_set(pg_temp.cv_fases(), '{0,bloques}', '{"tipo": "inicio"}')))
$$, '23514', NULL, '11b. bloques as an object rejected');

-- ============================================================
-- 12. variantes_por_grado ⇔ actividad_por_grados
-- ============================================================
SELECT throws_ok($$
  SELECT create_project_from_plan(pg_temp.cv_plan(
    'aaaaaaaa-aaaa-aaaa-aaaa-000000000012', '[1]', 'lenguaje', pg_temp.cv_l1(),
    jsonb_set(pg_temp.cv_fases(), '{1,bloques,1}',
      pg_temp.cv_bloque('actividad', '[{"grados": [1], "contenido": "Dibujan lo que observan."}]'))))
$$, 'P0001', NULL, '12. variantes on a non-band bloque rejected');
SELECT throws_ok($$
  SELECT create_project_from_plan(pg_temp.cv_plan(
    'aaaaaaaa-aaaa-aaaa-aaaa-000000000022', '[1]', 'lenguaje', pg_temp.cv_l1(),
    jsonb_set(pg_temp.cv_fases(), '{1,bloques,1}', pg_temp.cv_bloque('actividad_por_grados'))))
$$, 'P0001', NULL, '12b. actividad_por_grados without variantes rejected');

-- ============================================================
-- 13. tarea_previa '' → NULL
-- ============================================================
INSERT INTO t_result (scenario, project_id)
SELECT 's13', create_project_from_plan(pg_temp.cv_plan(
  'aaaaaaaa-aaaa-aaaa-aaaa-000000000013', '[1]', 'lenguaje', pg_temp.cv_l1(), pg_temp.cv_fases(), ''));
SELECT is((SELECT tarea_previa FROM projects WHERE id = (SELECT project_id FROM t_result WHERE scenario = 's13')),
  NULL::text, '13. empty tarea_previa stored as NULL');

-- ============================================================
-- 14. Unknown bloque tipo
-- ============================================================
SELECT throws_ok($$
  SELECT create_project_from_plan(pg_temp.cv_plan(
    'aaaaaaaa-aaaa-aaaa-aaaa-000000000014', '[1]', 'lenguaje', pg_temp.cv_l1(),
    jsonb_set(pg_temp.cv_fases(), '{2,bloques,0}', pg_temp.cv_bloque('baile'))))
$$, 'P0001', NULL, '14. unknown bloque tipo rejected');

SELECT * FROM finish();
ROLLBACK;
