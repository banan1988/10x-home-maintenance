# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Feature flags must have a kill date

- **Context**: Feature flags in `src/lib/feature-flags`
- **Problem**: Feature flags without an expiry get silently forgotten and are never removed, accumulating dead code paths and permanent conditional branches.
- **Rule**: Feature flags should always have a kill date; remove or expire the flag once that date passes rather than leaving it in place indefinitely.
- **Applies to**: all

## New Postgres functions must pin search_path

- **Context**: `supabase/migrations/20260827194321_create_maintenance_tasks.sql:36-41` (`set_updated_at()` trigger function)
- **Problem**: The trigger function was created without `set search_path = ...`, calling the unqualified built-in `now()`. This matches Supabase's own database linter warning (`0011_function_search_path_mutable`) — a mutable search_path is a schema-hijacking vector and an easy detail to copy-paste forward into future migrations.
- **Rule**: Every new SQL/PLpgSQL function must set `search_path` (e.g. `set search_path = pg_catalog, pg_temp`).
- **Applies to**: All Supabase migrations that create functions.

## Closing out a plan must also update roadmap.md

- **Context**: `context/foundation/roadmap.md` F-01 status fields (At-a-glance table + Foundations detail section); the plan-closing epilogue step
- **Problem**: When a change's epilogue flips `change.md` to `implemented`/`impl_reviewed` and checks off every Progress item, `roadmap.md`'s per-item status field isn't updated in the same step — leaving the roadmap stale (and in this case internally inconsistent: "in-progress" in one place, "proposed" in another), which risks downstream slices never being recognized as unblocked.
- **Rule**: When closing out a change (`change.md` → `implemented`/`impl_reviewed`), also update the corresponding item's status in `roadmap.md` in the same step.
- **Applies to**: All change close-outs (epilogue steps) for items tracked in `roadmap.md`.
