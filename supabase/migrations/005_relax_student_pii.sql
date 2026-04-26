-- Hide last_name and birth_date from the app surface area until we have
-- explicit permission from teachers/families to store student PII.
--
-- The columns stay in place so existing rows are not lost; we only relax
-- the NOT NULL so new inserts can omit them. When permission is granted,
-- a follow-up migration will SET NOT NULL again after backfill.

ALTER TABLE students
  ALTER COLUMN last_name  DROP NOT NULL,
  ALTER COLUMN birth_date DROP NOT NULL;
