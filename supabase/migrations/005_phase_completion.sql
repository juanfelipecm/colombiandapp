-- ============================================================
-- 005_phase_completion.sql
-- Add per-phase completion timestamp so a teacher can mark
-- individual phases done as the project unfolds. Used by the
-- project view's progress strip and "current phase" auto-open.
-- Additive, nullable column. RLS already covers writes via the
-- existing project_phases policy chain (project_id → owner).
-- ============================================================

ALTER TABLE project_phases
  ADD COLUMN completed_at timestamptz NULL;

-- Partial index supports any future "phases completed across my
-- projects" queries without bloating the table during writes.
CREATE INDEX idx_phases_completed
  ON project_phases (project_id)
  WHERE completed_at IS NOT NULL;
