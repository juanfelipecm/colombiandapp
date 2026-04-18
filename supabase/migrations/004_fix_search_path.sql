-- Harden the two foundation functions to satisfy Supabase's
-- `function_search_path_mutable` advisor. No behavior change — just pins the
-- schema lookup path the way `is_project_owner`, `create_project_from_plan`,
-- and `check_activity_dba_ref_consistency` already do.

ALTER FUNCTION set_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION get_teacher_school_ids() SET search_path = public, pg_temp;
