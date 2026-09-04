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

## `npx shadcn add` needs `-y` AND `-o`, and its generated imports need manual remapping

- **Context**: `chore/shared-ui-primitives` branch — installing `select`, `alert-dialog`, `calendar`, `popover`, `sonner` in one batch for S-01/S-02 (`context/changes/manage-maintenance-tasks/research.md` Decision 4).
- **Problem**: `-y` only skips the "proceed with install?" confirmation. A separate per-file "this file already exists, overwrite?" prompt (here: `button.tsx`, silently touched because another requested component depends on it) is not covered by `-y` and blocks non-interactively without ever asking `-o` — the whole batch silently stopped partway through (`alert-dialog`/`calendar` were never written) with exit code 0, no error surfaced. Separately, the CLI's generated files used generic placeholder imports — `import { cn } from "cn"` (installed a phantom `cn` npm package instead of remapping to this project's `@/lib/utils`) and `import { useTheme } from "next-themes"` in `sonner.tsx` (an unrequested dependency; this project has no theme-switching system) — neither got rewritten to match `components.json`'s configured aliases.
- **Rule**: Always pass both `-y -o` for a multi-component `shadcn add` batch, then diff `git status`/`git diff` against every touched file before committing — check for (a) unintended overwrites of already-installed components, (b) literal `"cn"` imports that must become `@/lib/utils`, (c) `next-themes` or other framework-specific imports that assume infrastructure (theme providers, etc.) this project doesn't have, and (d) missing `React`-namespace type imports (`React.CSSProperties` etc.) since generated files aren't always self-consistent on that. Run `npm run build && npm run lint && npm run test` after, not just `shadcn diff` beforehand (the diff command can report "no updates" for a file the actual `add` command then rewrites substantially).
- **Applies to**: Any future `npx shadcn add` invocation, especially multi-component batches.
