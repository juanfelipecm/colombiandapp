-- Persist HTML documents sent to teachers via Telegram so they can be
-- referenced in future conversation context and eventually edited.

CREATE TABLE telegram_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
  title text NOT NULL,
  html_content text NOT NULL,
  source text NOT NULL DEFAULT 'freeform'
    CHECK (source IN ('freeform', 'project')),
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_telegram_documents_teacher
  ON telegram_documents (teacher_id, created_at DESC);

ALTER TABLE telegram_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can read own telegram_documents"
  ON telegram_documents FOR SELECT
  USING (teacher_id = auth.uid());
