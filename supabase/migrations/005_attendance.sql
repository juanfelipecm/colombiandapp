-- Colombiando Attendance Schema
-- One row per (student, attendance_date). Teacher edits = upserts.
-- All time math pinned to America/Bogota — server runs UTC, teachers don't.
--
-- Eng-review fixes baked in:
--   * Bogotá tz in CHECK and view (no UTC drift)
--   * recorded_by ON DELETE SET NULL (was RESTRICT — would deadlock the
--     auth.users → teachers cascade chain on account purge)
--   * No denormalized school_id on attendance_records (closes RLS bypass:
--     attendance_student_owned() traces student → school → teacher)
--   * Idempotent type/table creation (safe to rerun)
--   * Note length capped at 1000 chars

-- ============================================================
-- attendance_status enum (idempotent for reruns)
-- ============================================================
DO $$ BEGIN
  CREATE TYPE attendance_status AS ENUM ('presente', 'ausente', 'tardanza');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- attendance_records: one row per student per day
-- ============================================================
CREATE TABLE IF NOT EXISTS attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  status attendance_status NOT NULL,
  -- Only meaningful when status = 'ausente'. CHECK below enforces.
  justified boolean NOT NULL DEFAULT false,
  note text,
  -- SET NULL not RESTRICT: auth.users → teachers cascade must complete cleanly
  -- on account purge. Audit reference is best-effort, not load-bearing.
  recorded_by uuid REFERENCES teachers(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT attendance_records_unique UNIQUE (student_id, attendance_date),
  CONSTRAINT justified_only_when_absent CHECK (
    NOT justified OR status = 'ausente'
  ),
  CONSTRAINT note_length_reasonable CHECK (
    note IS NULL OR char_length(note) <= 1000
  ),
  -- Bogotá time, not UTC. Otherwise 23:00 Bogotá = 04:00 UTC next day and
  -- CURRENT_DATE returns tomorrow.
  CONSTRAINT date_not_in_future CHECK (
    attendance_date <= ((now() AT TIME ZONE 'America/Bogota')::date)
  )
);

-- The UNIQUE on (student_id, attendance_date) gives us a btree index on that
-- pair, so we don't need a redundant idx_attendance_student_date. We do want
-- a status-augmented index for the resumen window scan.
CREATE INDEX IF NOT EXISTS idx_attendance_student_date_status
  ON attendance_records (student_id, attendance_date DESC, status);

CREATE TRIGGER set_attendance_records_updated_at
  BEFORE UPDATE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- attendance_student_owned: RLS helper
--
-- Encapsulates "this student belongs to a school I teach." SECURITY DEFINER
-- so we don't recurse into students' RLS during policy eval. Mirrors the
-- pattern already used by is_project_owner() and get_teacher_school_ids().
-- ============================================================
CREATE OR REPLACE FUNCTION attendance_student_owned(p_student_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM students s
    JOIN schools sch ON sch.id = s.school_id
    WHERE s.id = p_student_id
      AND sch.teacher_id = auth.uid()
  );
$$;

-- ============================================================
-- RLS policies — derive ownership via student → school → teacher
-- ============================================================
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can read own students attendance"
  ON attendance_records FOR SELECT
  USING (attendance_student_owned(student_id));

CREATE POLICY "Teachers can insert own students attendance"
  ON attendance_records FOR INSERT
  WITH CHECK (
    attendance_student_owned(student_id)
    AND (recorded_by IS NULL OR recorded_by = auth.uid())
  );

CREATE POLICY "Teachers can update own students attendance"
  ON attendance_records FOR UPDATE
  USING (attendance_student_owned(student_id))
  WITH CHECK (
    attendance_student_owned(student_id)
    AND (recorded_by IS NULL OR recorded_by = auth.uid())
  );

CREATE POLICY "Teachers can delete own students attendance"
  ON attendance_records FOR DELETE
  USING (attendance_student_owned(student_id));

-- ============================================================
-- student_attendance_summary VIEW — last 30 days (Bogotá), per student
--
-- security_invoker = true: RLS on students + attendance_records flows
-- through the view, so a teacher only sees their own school's rows.
--
-- bogota_today CTE captures "today" once so all FILTERs use the same anchor.
-- ============================================================
CREATE OR REPLACE VIEW student_attendance_summary
  WITH (security_invoker = true) AS
WITH bogota_today AS (
  SELECT (now() AT TIME ZONE 'America/Bogota')::date AS today
)
SELECT
  s.id AS student_id,
  s.school_id,
  s.first_name,
  s.last_name,
  s.grade,
  s.created_at AS student_created_at,
  bt.today AS as_of_date,
  COUNT(ar.id) FILTER (
    WHERE ar.attendance_date >= bt.today - INTERVAL '30 days'
  )::int AS days_marked_30,
  COUNT(ar.id) FILTER (
    WHERE ar.status = 'ausente'
      AND ar.attendance_date >= bt.today - INTERVAL '30 days'
  )::int AS absences_30,
  COUNT(ar.id) FILTER (
    WHERE ar.status = 'tardanza'
      AND ar.attendance_date >= bt.today - INTERVAL '30 days'
  )::int AS lates_30,
  COUNT(ar.id) FILTER (
    WHERE ar.status = 'ausente'
      AND NOT ar.justified
      AND ar.attendance_date >= bt.today - INTERVAL '30 days'
  )::int AS unjustified_absences_30
FROM students s
CROSS JOIN bogota_today bt
LEFT JOIN attendance_records ar ON ar.student_id = s.id
GROUP BY s.id, s.school_id, s.first_name, s.last_name, s.grade, s.created_at, bt.today;
