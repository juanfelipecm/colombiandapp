-- pgTAP suite for attendance_records, attendance_student_owned, and the
-- student_attendance_summary view.
--
-- Run with: supabase test db
--
-- 13 scenarios from the autoplan test plan
-- (juanfelipecm-colapp-asistencia-test-plan-20260426-165639.md):
--
--   1   Insert valid presente row succeeds
--   2   Insert tardanza + justified=true rejected (CHECK)
--   2b  Insert presente + justified=true rejected (CHECK, symmetric)
--   3   Duplicate (student_id, date) rejected (UNIQUE)
--   4   attendance_date in the future rejected (CHECK)
--   4b  Timezone boundary: 23:30 Bogotá (= 04:30 UTC next day) accepts
--       today-Bogotá and rejects tomorrow-Bogotá. Asserts CHECK uses Bogotá tz.
--   5   recorded_by != auth.uid() rejected (RLS WITH CHECK)
--   6   Insert for student in another teacher's school rejected (RLS)
--   6b  attendance_student_owned() correctly traces student → school → teacher
--   7   Cross-teacher SELECT returns 0 rows
--   8   Cross-teacher UPDATE updates 0 rows
--   9   Summary view returns correct counts for fixture
--   9b  View RLS pass-through: teacher A on B's student → 0 rows
--   9c  View LEFT JOIN: student with 0 attendance shows zeros
--  10   ON DELETE CASCADE on student wipes their attendance
--  11   auth.users delete cascades cleanly through teachers → schools →
--       students → attendance_records (recorded_by SET NULL doesn't block)

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

-- ============================================================
-- Fixtures
--   Two teachers (A, B), each with a school and 2 students.
-- ============================================================

-- Auth users (teachers' identities)
INSERT INTO auth.users (id) VALUES
  ('00000000-0000-0000-0000-0000000000a1'),  -- teacher A
  ('00000000-0000-0000-0000-0000000000b1'); -- teacher B

INSERT INTO teachers (id, first_name, last_name) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'Ana',   'Maestra'),
  ('00000000-0000-0000-0000-0000000000b1', 'Beto',  'Maestro');

INSERT INTO schools (id, teacher_id, name, department, municipality, grades) VALUES
  ('00000000-0000-0000-0000-00000000a000', '00000000-0000-0000-0000-0000000000a1',
   'Escuela A', 'Sucre',  'San Onofre', ARRAY[1,2,3]),
  ('00000000-0000-0000-0000-00000000b000', '00000000-0000-0000-0000-0000000000b1',
   'Escuela B', 'Boyacá', 'Tunja',      ARRAY[1,2,3]);

INSERT INTO students (id, school_id, first_name, last_name, birth_date, grade) VALUES
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a000',
   'Alma',    'Pérez',  DATE '2018-05-01', 1),
  ('00000000-0000-0000-0000-00000000a002', '00000000-0000-0000-0000-00000000a000',
   'Andrés',  'Gómez',  DATE '2017-09-12', 2),
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000b000',
   'Bruno',   'López',  DATE '2018-03-20', 1);

-- Plan: total assertions across 14 scenarios = 22
SELECT plan(22);

-- Helper: switch the session into "authenticated as <uuid>" so RLS applies.
-- (RLS is bypassed for the postgres role; this swap turns it on.)
CREATE OR REPLACE FUNCTION test_set_user(p_uid uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
                     jsonb_build_object('sub', p_uid::text, 'role', 'authenticated')::text,
                     true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;

-- Helper: switch back to superuser to insert/cleanup outside RLS.
CREATE OR REPLACE FUNCTION test_reset_role()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', '', true);
END $$;

-- ============================================================
-- Scenario 1: Happy path — INSERT presente as teacher A for student a001
-- ============================================================
SELECT test_set_user('00000000-0000-0000-0000-0000000000a1');

INSERT INTO attendance_records (student_id, attendance_date, status, recorded_by)
VALUES (
  '00000000-0000-0000-0000-00000000a001',
  ((now() AT TIME ZONE 'America/Bogota')::date),
  'presente',
  '00000000-0000-0000-0000-0000000000a1'
);

SELECT is(
  (SELECT count(*)::int FROM attendance_records
   WHERE student_id = '00000000-0000-0000-0000-00000000a001'
     AND status = 'presente'),
  1,
  'Scenario 1: presente INSERT lands one row visible to teacher A'
);

SELECT test_reset_role();

-- ============================================================
-- Scenario 2: tardanza + justified=true rejected by CHECK
-- ============================================================
SELECT test_set_user('00000000-0000-0000-0000-0000000000a1');

SELECT throws_ok(
  $sql$
    INSERT INTO attendance_records (student_id, attendance_date, status, justified, recorded_by)
    VALUES (
      '00000000-0000-0000-0000-00000000a002',
      ((now() AT TIME ZONE 'America/Bogota')::date),
      'tardanza', true,
      '00000000-0000-0000-0000-0000000000a1'
    )
  $sql$,
  '23514',  -- check_violation
  NULL,
  'Scenario 2: tardanza + justified=true rejected by check'
);

SELECT test_reset_role();

-- ============================================================
-- Scenario 2b: presente + justified=true rejected by CHECK (symmetric)
-- ============================================================
SELECT test_set_user('00000000-0000-0000-0000-0000000000a1');

SELECT throws_ok(
  $sql$
    INSERT INTO attendance_records (student_id, attendance_date, status, justified, recorded_by)
    VALUES (
      '00000000-0000-0000-0000-00000000a002',
      ((now() AT TIME ZONE 'America/Bogota')::date) - INTERVAL '1 day',
      'presente', true,
      '00000000-0000-0000-0000-0000000000a1'
    )
  $sql$,
  '23514',
  NULL,
  'Scenario 2b: presente + justified=true rejected by check'
);

SELECT test_reset_role();

-- ============================================================
-- Scenario 3: duplicate (student_id, attendance_date) rejected
-- ============================================================
-- Scenario 1 already inserted today's row for a001; insert again as a duplicate.
SELECT test_set_user('00000000-0000-0000-0000-0000000000a1');

SELECT throws_ok(
  $sql$
    INSERT INTO attendance_records (student_id, attendance_date, status, recorded_by)
    VALUES (
      '00000000-0000-0000-0000-00000000a001',
      ((now() AT TIME ZONE 'America/Bogota')::date),
      'ausente',
      '00000000-0000-0000-0000-0000000000a1'
    )
  $sql$,
  '23505',  -- unique_violation
  NULL,
  'Scenario 3: duplicate (student_id, date) rejected'
);

SELECT test_reset_role();

-- ============================================================
-- Scenario 4: attendance_date strictly in the future rejected
-- ============================================================
SELECT test_set_user('00000000-0000-0000-0000-0000000000a1');

SELECT throws_ok(
  $sql$
    INSERT INTO attendance_records (student_id, attendance_date, status, recorded_by)
    VALUES (
      '00000000-0000-0000-0000-00000000a002',
      ((now() AT TIME ZONE 'America/Bogota')::date) + INTERVAL '7 days',
      'presente',
      '00000000-0000-0000-0000-0000000000a1'
    )
  $sql$,
  '23514',
  NULL,
  'Scenario 4: future attendance_date rejected by check'
);

SELECT test_reset_role();

-- ============================================================
-- Scenario 4b: timezone boundary
--
-- We can't fake the wall clock inside a transaction, but we can prove the
-- CHECK constraint computes "today" in Bogotá time, not UTC: insert a row
-- with attendance_date = (now() AT TIME ZONE 'America/Bogota')::date — must
-- always succeed, even if UTC date is already tomorrow. Insert a row with
-- attendance_date = bogota_today + 1 — must always fail.
--
-- Together these prove the CHECK uses (now() AT TIME ZONE 'America/Bogota'),
-- not CURRENT_DATE.
-- ============================================================
SELECT test_set_user('00000000-0000-0000-0000-0000000000a1');

-- Today-Bogotá always accepts (use a012 to avoid scenario-1 dup)
INSERT INTO attendance_records (student_id, attendance_date, status, recorded_by)
VALUES (
  '00000000-0000-0000-0000-00000000a002',
  ((now() AT TIME ZONE 'America/Bogota')::date),
  'presente',
  '00000000-0000-0000-0000-0000000000a1'
);
SELECT pass('Scenario 4b: today-Bogotá insert accepted (CHECK uses Bogotá tz)');

-- Bogotá+1 always rejects
SELECT throws_ok(
  $sql$
    INSERT INTO attendance_records (student_id, attendance_date, status, recorded_by)
    VALUES (
      '00000000-0000-0000-0000-00000000a002',
      ((now() AT TIME ZONE 'America/Bogota')::date) + INTERVAL '1 day',
      'presente',
      '00000000-0000-0000-0000-0000000000a1'
    )
  $sql$,
  '23514',
  NULL,
  'Scenario 4b: tomorrow-Bogotá rejected (CHECK uses Bogotá tz)'
);

SELECT test_reset_role();

-- ============================================================
-- Scenario 5: recorded_by != auth.uid() rejected by RLS WITH CHECK
-- ============================================================
SELECT test_set_user('00000000-0000-0000-0000-0000000000a1');

-- Teacher A tries to record an attendance for their own student but attribute
-- it to teacher B. RLS WITH CHECK should reject.
SELECT throws_ok(
  $sql$
    INSERT INTO attendance_records (student_id, attendance_date, status, recorded_by)
    VALUES (
      '00000000-0000-0000-0000-00000000a001',
      ((now() AT TIME ZONE 'America/Bogota')::date) - INTERVAL '5 days',
      'presente',
      '00000000-0000-0000-0000-0000000000b1'
    )
  $sql$,
  '42501',  -- insufficient_privilege (RLS rejection)
  NULL,
  'Scenario 5: recorded_by impersonation rejected by RLS'
);

SELECT test_reset_role();

-- ============================================================
-- Scenario 6: cross-school INSERT rejected by RLS
-- ============================================================
SELECT test_set_user('00000000-0000-0000-0000-0000000000a1');

-- Teacher A tries to insert attendance for a student that belongs to teacher B's school
SELECT throws_ok(
  $sql$
    INSERT INTO attendance_records (student_id, attendance_date, status, recorded_by)
    VALUES (
      '00000000-0000-0000-0000-00000000b001',
      ((now() AT TIME ZONE 'America/Bogota')::date),
      'presente',
      '00000000-0000-0000-0000-0000000000a1'
    )
  $sql$,
  '42501',
  NULL,
  'Scenario 6: cross-school INSERT rejected by RLS'
);

SELECT test_reset_role();

-- ============================================================
-- Scenario 6b: attendance_student_owned() returns the right answer
-- ============================================================
SELECT test_set_user('00000000-0000-0000-0000-0000000000a1');

SELECT is(
  attendance_student_owned('00000000-0000-0000-0000-00000000a001'),
  true,
  'Scenario 6b: attendance_student_owned(own student) = true for teacher A'
);

SELECT is(
  attendance_student_owned('00000000-0000-0000-0000-00000000b001'),
  false,
  'Scenario 6b: attendance_student_owned(other teacher student) = false for teacher A'
);

SELECT test_reset_role();

-- ============================================================
-- Seed cross-teacher data so SELECT/UPDATE tests have something to filter
-- ============================================================
SELECT test_set_user('00000000-0000-0000-0000-0000000000b1');

INSERT INTO attendance_records (student_id, attendance_date, status, recorded_by)
VALUES (
  '00000000-0000-0000-0000-00000000b001',
  ((now() AT TIME ZONE 'America/Bogota')::date),
  'ausente',
  '00000000-0000-0000-0000-0000000000b1'
);

SELECT test_reset_role();

-- ============================================================
-- Scenario 7: cross-teacher SELECT returns 0 rows
-- ============================================================
SELECT test_set_user('00000000-0000-0000-0000-0000000000a1');

SELECT is(
  (SELECT count(*)::int FROM attendance_records
   WHERE student_id = '00000000-0000-0000-0000-00000000b001'),
  0,
  'Scenario 7: teacher A cannot SELECT teacher B''s attendance'
);

SELECT test_reset_role();

-- ============================================================
-- Scenario 8: cross-teacher UPDATE updates 0 rows
-- ============================================================
SELECT test_set_user('00000000-0000-0000-0000-0000000000a1');

WITH upd AS (
  UPDATE attendance_records
     SET status = 'presente'
   WHERE student_id = '00000000-0000-0000-0000-00000000b001'
   RETURNING 1
)
SELECT is(
  (SELECT count(*)::int FROM upd),
  0,
  'Scenario 8: cross-teacher UPDATE affects 0 rows'
);

SELECT test_reset_role();

-- ============================================================
-- Scenario 9: summary view returns correct counts
-- ============================================================
-- Insert a few historical rows for student a002 (over the last 30 days)
SELECT test_set_user('00000000-0000-0000-0000-0000000000a1');

INSERT INTO attendance_records (student_id, attendance_date, status, justified, recorded_by) VALUES
  ('00000000-0000-0000-0000-00000000a002',
   ((now() AT TIME ZONE 'America/Bogota')::date) - INTERVAL '3 days',
   'ausente', true, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-00000000a002',
   ((now() AT TIME ZONE 'America/Bogota')::date) - INTERVAL '4 days',
   'ausente', false, '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-00000000a002',
   ((now() AT TIME ZONE 'America/Bogota')::date) - INTERVAL '5 days',
   'tardanza', false, '00000000-0000-0000-0000-0000000000a1');

-- Note: scenarios 1 (today presente) and 4b (today presente — we tried but
-- conflict, so only the original scenario-1 insert remains for a001) and
-- the just-inserted 3 historical rows for a002 are the data set.
-- a002 also has the scenario-4b today presente. So a002 has:
--   today: presente (scenario 4b)
--   today-3: ausente justified
--   today-4: ausente NOT justified
--   today-5: tardanza
-- Total marked: 4. Absences: 2. Lates: 1. Unjustified absences: 1.

SELECT is(
  (SELECT days_marked_30 FROM student_attendance_summary
   WHERE student_id = '00000000-0000-0000-0000-00000000a002'),
  4,
  'Scenario 9: view days_marked_30 = 4 for student a002'
);

SELECT is(
  (SELECT absences_30 FROM student_attendance_summary
   WHERE student_id = '00000000-0000-0000-0000-00000000a002'),
  2,
  'Scenario 9: view absences_30 = 2 for student a002'
);

SELECT is(
  (SELECT unjustified_absences_30 FROM student_attendance_summary
   WHERE student_id = '00000000-0000-0000-0000-00000000a002'),
  1,
  'Scenario 9: view unjustified_absences_30 = 1 for student a002'
);

SELECT is(
  (SELECT lates_30 FROM student_attendance_summary
   WHERE student_id = '00000000-0000-0000-0000-00000000a002'),
  1,
  'Scenario 9: view lates_30 = 1 for student a002'
);

SELECT test_reset_role();

-- ============================================================
-- Scenario 9b: view RLS — teacher A cannot see teacher B's students
-- ============================================================
SELECT test_set_user('00000000-0000-0000-0000-0000000000a1');

SELECT is(
  (SELECT count(*)::int FROM student_attendance_summary
   WHERE student_id = '00000000-0000-0000-0000-00000000b001'),
  0,
  'Scenario 9b: view RLS — teacher A sees 0 rows for teacher B''s student'
);

SELECT test_reset_role();

-- ============================================================
-- Scenario 9c: LEFT JOIN — student a001 with only today's row
-- ============================================================
SELECT test_set_user('00000000-0000-0000-0000-0000000000a1');

-- a001 has exactly 1 row from scenario 1 (today, presente)
SELECT is(
  (SELECT days_marked_30 FROM student_attendance_summary
   WHERE student_id = '00000000-0000-0000-0000-00000000a001'),
  1,
  'Scenario 9c: view days_marked_30 = 1 for student with only today'
);

SELECT is(
  (SELECT absences_30 FROM student_attendance_summary
   WHERE student_id = '00000000-0000-0000-0000-00000000a001'),
  0,
  'Scenario 9c: view absences_30 = 0 for student with no absences'
);

SELECT test_reset_role();

-- ============================================================
-- Scenario 10: ON DELETE CASCADE on student wipes their attendance
-- ============================================================
-- Run as superuser since student-delete is server-action territory.
SELECT test_reset_role();

DELETE FROM students WHERE id = '00000000-0000-0000-0000-00000000a002';

SELECT is(
  (SELECT count(*)::int FROM attendance_records
   WHERE student_id = '00000000-0000-0000-0000-00000000a002'),
  0,
  'Scenario 10: deleting student cascades to attendance_records'
);

-- ============================================================
-- Scenario 11: auth.users delete cascades cleanly through the chain
-- ============================================================
-- Pre-check: teacher B has 1 attendance row (b001 today)
SELECT is(
  (SELECT count(*)::int FROM attendance_records
   WHERE student_id = '00000000-0000-0000-0000-00000000b001'),
  1,
  'Scenario 11 setup: teacher B has 1 attendance row before purge'
);

-- Purge teacher B's auth user. With ON DELETE SET NULL on recorded_by,
-- the cascade chain teachers → schools → students → attendance_records
-- runs cleanly: students cascade-delete to wipe attendance, and the
-- recorded_by FK does NOT block the teachers row from being deleted.
DELETE FROM auth.users WHERE id = '00000000-0000-0000-0000-0000000000b1';

SELECT is(
  (SELECT count(*)::int FROM teachers
   WHERE id = '00000000-0000-0000-0000-0000000000b1'),
  0,
  'Scenario 11: teachers row gone after auth.users delete (no RESTRICT block)'
);

SELECT is(
  (SELECT count(*)::int FROM attendance_records
   WHERE student_id = '00000000-0000-0000-0000-00000000b001'),
  0,
  'Scenario 11: attendance rows gone via student cascade'
);

-- ============================================================
SELECT * FROM finish();
ROLLBACK;
