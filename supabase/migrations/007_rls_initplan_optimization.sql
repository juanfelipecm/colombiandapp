-- Rewrite all RLS policies that call `auth.uid()` directly to use
-- `(SELECT auth.uid())` instead. With the bare call, Postgres re-evaluates
-- the function for every row scanned by the policy. Wrapping it in a SELECT
-- makes the planner treat it as an InitPlan — evaluated once per query.
--
-- Surfaced by Supabase's `auth_rls_initplan` advisor lint after migration 005
-- landed. Mechanical rewrite, no behavior change. Affects 18 policy
-- expressions across 7 tables (attendance_records, project_activities,
-- project_activity_dba_refs, project_generation_logs, projects, schools,
-- teachers).
--
-- ALTER POLICY preserves identity and dependencies — cleaner than DROP/CREATE.

-- ============================================================
-- attendance_records
-- ============================================================
ALTER POLICY "Teachers can insert own students attendance"
  ON attendance_records
  WITH CHECK (
    attendance_student_owned(student_id)
    AND (recorded_by IS NULL OR recorded_by = (SELECT auth.uid()))
  );

ALTER POLICY "Teachers can update own students attendance"
  ON attendance_records
  USING (attendance_student_owned(student_id))
  WITH CHECK (
    attendance_student_owned(student_id)
    AND (recorded_by IS NULL OR recorded_by = (SELECT auth.uid()))
  );

-- ============================================================
-- project_activities
-- ============================================================
ALTER POLICY "Teachers can read own activities"
  ON project_activities
  USING (
    EXISTS (
      SELECT 1
      FROM project_phases ph
      JOIN projects p ON p.id = ph.project_id
      WHERE ph.id = project_activities.phase_id
        AND p.teacher_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "Teachers can write own activities"
  ON project_activities
  USING (
    EXISTS (
      SELECT 1
      FROM project_phases ph
      JOIN projects p ON p.id = ph.project_id
      WHERE ph.id = project_activities.phase_id
        AND p.teacher_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM project_phases ph
      JOIN projects p ON p.id = ph.project_id
      WHERE ph.id = project_activities.phase_id
        AND p.teacher_id = (SELECT auth.uid())
    )
  );

-- ============================================================
-- project_activity_dba_refs
-- ============================================================
ALTER POLICY "Teachers can read own activity_dba_refs"
  ON project_activity_dba_refs
  USING (
    EXISTS (
      SELECT 1
      FROM project_activities a
      JOIN project_phases ph ON ph.id = a.phase_id
      JOIN projects p ON p.id = ph.project_id
      WHERE a.id = project_activity_dba_refs.activity_id
        AND p.teacher_id = (SELECT auth.uid())
    )
  );

ALTER POLICY "Teachers can write own activity_dba_refs"
  ON project_activity_dba_refs
  USING (
    EXISTS (
      SELECT 1
      FROM project_activities a
      JOIN project_phases ph ON ph.id = a.phase_id
      JOIN projects p ON p.id = ph.project_id
      WHERE a.id = project_activity_dba_refs.activity_id
        AND p.teacher_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM project_activities a
      JOIN project_phases ph ON ph.id = a.phase_id
      JOIN projects p ON p.id = ph.project_id
      WHERE a.id = project_activity_dba_refs.activity_id
        AND p.teacher_id = (SELECT auth.uid())
    )
  );

-- ============================================================
-- project_generation_logs
-- ============================================================
ALTER POLICY "Teachers can read own generation logs"
  ON project_generation_logs
  USING (teacher_id = (SELECT auth.uid()));

-- ============================================================
-- projects
-- ============================================================
ALTER POLICY "Teachers can read own projects"
  ON projects
  USING (teacher_id = (SELECT auth.uid()));

ALTER POLICY "Teachers can insert own projects"
  ON projects
  WITH CHECK (teacher_id = (SELECT auth.uid()));

ALTER POLICY "Teachers can update own projects"
  ON projects
  USING (teacher_id = (SELECT auth.uid()));

ALTER POLICY "Teachers can delete own projects"
  ON projects
  USING (teacher_id = (SELECT auth.uid()));

-- ============================================================
-- schools
-- ============================================================
ALTER POLICY "Teachers can read own school"
  ON schools
  USING (teacher_id = (SELECT auth.uid()));

ALTER POLICY "Teachers can insert own school"
  ON schools
  WITH CHECK (teacher_id = (SELECT auth.uid()));

ALTER POLICY "Teachers can update own school"
  ON schools
  USING (teacher_id = (SELECT auth.uid()));

ALTER POLICY "Teachers can delete own school"
  ON schools
  USING (teacher_id = (SELECT auth.uid()));

-- ============================================================
-- teachers
-- ============================================================
ALTER POLICY "Teachers can read own record"
  ON teachers
  USING (id = (SELECT auth.uid()));

ALTER POLICY "Teachers can insert own record"
  ON teachers
  WITH CHECK (id = (SELECT auth.uid()));

ALTER POLICY "Teachers can update own record"
  ON teachers
  USING (id = (SELECT auth.uid()));
