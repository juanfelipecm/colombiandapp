-- Colombiando Foundation Schema
-- Tables: teachers, schools, students
-- With RLS policies, triggers, and helper functions

-- ============================================================
-- Auto-update trigger function
-- ============================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Teachers table
-- ============================================================
CREATE TABLE teachers (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_teachers_updated_at
  BEFORE UPDATE ON teachers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can read own record"
  ON teachers FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Teachers can update own record"
  ON teachers FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Teachers can insert own record"
  ON teachers FOR INSERT
  WITH CHECK (id = auth.uid());

-- ============================================================
-- Schools table
-- ============================================================
CREATE TABLE schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL UNIQUE REFERENCES teachers(id) ON DELETE CASCADE,
  name text NOT NULL,
  department text NOT NULL,
  municipality text NOT NULL,
  vereda text,  -- optional, rural subdivision smaller than municipality
  grades int[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_schools_updated_at
  BEFORE UPDATE ON schools
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE schools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can read own school"
  ON schools FOR SELECT
  USING (teacher_id = auth.uid());

CREATE POLICY "Teachers can insert own school"
  ON schools FOR INSERT
  WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Teachers can update own school"
  ON schools FOR UPDATE
  USING (teacher_id = auth.uid());

CREATE POLICY "Teachers can delete own school"
  ON schools FOR DELETE
  USING (teacher_id = auth.uid());

-- ============================================================
-- Helper function for student RLS
-- ============================================================
CREATE OR REPLACE FUNCTION get_teacher_school_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$ SELECT id FROM schools WHERE teacher_id = auth.uid() $$;

-- ============================================================
-- Students table
-- ============================================================
CREATE TABLE students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  first_name text NOT NULL,
  last_name text NOT NULL,
  birth_date date NOT NULL,
  grade int NOT NULL CHECK (grade BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER set_students_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can read own students"
  ON students FOR SELECT
  USING (school_id IN (SELECT get_teacher_school_ids()));

CREATE POLICY "Teachers can insert own students"
  ON students FOR INSERT
  WITH CHECK (school_id IN (SELECT get_teacher_school_ids()));

CREATE POLICY "Teachers can update own students"
  ON students FOR UPDATE
  USING (school_id IN (SELECT get_teacher_school_ids()));

CREATE POLICY "Teachers can delete own students"
  ON students FOR DELETE
  USING (school_id IN (SELECT get_teacher_school_ids()));
