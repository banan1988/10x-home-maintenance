-- Pin search_path on set_updated_at() to close the schema-hijack surface Supabase's linter flags
-- (0011_function_search_path_mutable). No behavior change: the function still only sets new.updated_at = now().
alter function set_updated_at() set search_path = pg_catalog, pg_temp;
