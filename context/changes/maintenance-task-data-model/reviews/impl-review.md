<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Maintenance Task Data Model Implementation Plan

- **Plan**: `context/changes/maintenance-task-data-model/plan.md`
- **Scope**: Phase 1, 2, 3 of 3 (full plan, all complete)
- **Date**: 2026-08-28
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — `set_updated_at()` trigger function has a mutable `search_path`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260827194321_create_maintenance_tasks.sql:36-41`
- **Detail**: The `before update` trigger function is created without `set search_path = ...` and calls the
  unqualified built-in `now()`. It runs as `SECURITY INVOKER` (the default), so today's exploitability is low —
  it would require the invoking `authenticated` role to have `CREATE` on a schema earlier in its search path that
  shadows `now()`. Still, this is exactly the pattern Supabase's own database linter flags
  (`0011_function_search_path_mutable`), and it's the first trigger function in the repo — worth closing before
  it's copy-pasted into future migrations.
- **Fix**: Author a new migration that runs `alter function set_updated_at() set search_path = pg_catalog, pg_temp;`
  (the original migration is already applied locally and on the hosted project, so editing that file in place has
  no effect).
  - Strength: Closes the search-path-hijack surface with a one-line, well-documented hardening step; no behavior
    change to the trigger's logic.
  - Tradeoff: One more small migration file for a single-line change.
  - Confidence: HIGH — standard Postgres/Supabase best practice, matches the linter's own recommendation.
  - Blind spot: None significant — current exploitability is low given this migration's grants.
- **Decision**: PENDING

### F2 — `roadmap.md` still shows F-01 as unfinished, and inconsistently so

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `context/foundation/roadmap.md:54` (At-a-glance table says `in-progress`), `:107` (Foundations
  detail section says `proposed`)
- **Detail**: `change.md` was flipped to `status: implemented` and every Phase 1-3 Progress checkbox is `[x]`
  with commit SHAs, but the epilogue commit (`a25c770`) only touched `change.md` and `plan.md` — it never touched
  `roadmap.md`. The roadmap's own two references to F-01 don't even agree with each other (`in-progress` vs.
  `proposed`), and neither reflects the real, verified-complete state. Since the plan's own Overview states this
  change's purpose is to unlock S-01/S-02/S-03, a stale roadmap risks those slices staying un-planned even though
  their sole prerequisite is done.
- **Fix**: Update `context/foundation/roadmap.md` — flip F-01's status to `done` in the At-a-glance table (line 54)
  and the Foundations detail section (line 107), then reassess whether S-01/S-02/S-03 should move off `proposed`
  now that F-01 is satisfied.
  - Strength: Keeps the roadmap — the doc future planning sessions and `/10x-roadmap` read — truthful about what's
    actually unblocked.
  - Tradeoff: None; pure documentation catch-up, no code risk.
  - Confidence: HIGH — `change.md` and the plan's Progress section independently confirm completion, verified
    against both local and hosted Supabase.
  - Blind spot: Whether to also run `/10x-roadmap`'s slice-closing flow now vs. just fixing the status field is a
    call for the user.
- **Decision**: PENDING

### F3 — Unplanned but benign tooling changes outside the plan's file list

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `.gitignore`, `eslint.config.js`
- **Detail**: `.gitignore` (adds `supabase/.temp/`, `supabase/.branches/`) and `eslint.config.js` (adds a
  `no-redundant-type-constituents` override scoped only to `src/db/database.types.ts`) both changed but neither is
  named in the plan's file list. Both are confirmed necessary side effects of running the local Supabase CLI and
  of the generated-types file's codegen shape (`[_ in never]: never`), not scope creep — the ESLint override is
  narrowly scoped to one file, not project-wide.
- **Fix**: No code change needed. Optionally add a one-line addendum to `plan.md`'s Phase 1/2 "Changes Required"
  noting these two files, so a future reader of the plan isn't surprised they exist outside its listed contract.
- **Decision**: PENDING

### F4 — Plan's migration contract omitted the required `GRANT` statement

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `plan.md` Phase 1 "Changes Required #1"; `supabase/migrations/20260827194321_create_maintenance_tasks.sql:50-53`
- **Detail**: The plan's Phase 1 contract lists the four RLS policies but never mentions
  `grant select, insert, update, delete on table maintenance_tasks to authenticated;`. RLS policies only restrict
  rows within privileges a role already holds — they don't confer base table privileges — so without this GRANT
  the `authenticated` role would get permission-denied regardless of passing policies. The implementer added it
  correctly and commented why; the plan itself just never asked for it.
- **Fix**: Add a short addendum to Phase 1's contract in `plan.md` documenting the GRANT requirement, and consider
  carrying it into `/10x-lesson` as a recurring rule for any future RLS-protected table in this project.
  - Fix: Amend `plan.md`'s Phase 1 contract text with the GRANT line for an accurate historical record.
- **Decision**: PENDING
