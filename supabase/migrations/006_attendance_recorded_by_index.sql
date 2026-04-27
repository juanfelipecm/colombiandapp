-- Add covering index for the attendance_records.recorded_by FK.
-- Surfaced by the Supabase performance advisor (lint 0001_unindexed_foreign_keys)
-- after migration 005 landed. Low-impact at current scale, but cheap to add.

CREATE INDEX IF NOT EXISTS idx_attendance_records_recorded_by
  ON attendance_records (recorded_by)
  WHERE recorded_by IS NOT NULL;
