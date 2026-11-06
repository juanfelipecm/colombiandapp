-- ============================================================
-- 008b_archive_pbl_v1.sql — data step, run after 008_clase_viva.sql.
-- Legacy pbl-v1 projects (2–4 grid fases, no bloques) cannot render in the
-- Clase Viva view. Archive them so they leave the active lists; the UI also
-- hides prompt_version = 'pbl-v1' rows from every list and opens them to the
-- "Volver a generar" empty state. Reversible: rows and phases are untouched.
-- Idempotent.
-- ============================================================

UPDATE projects
SET status = 'archivado'
WHERE prompt_version = 'pbl-v1'
  AND status <> 'archivado';
