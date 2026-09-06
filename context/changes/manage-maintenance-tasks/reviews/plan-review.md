<!-- PLAN-REVIEW-REPORT -->

# Plan Review: User views, edits, and deletes their maintenance tasks

- **Plan**: `context/changes/manage-maintenance-tasks/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-06
- **Verdict**: REVISE (pre-triage) → **SOUND** (post-triage — all 3 findings fixed in plan.md)
- **Findings**: 0 critical, 2 warnings, 1 observation — all FIXED

## Verdicts

| Dimension             | Verdict                            |
| --------------------- | ---------------------------------- |
| End-State Alignment   | PASS                               |
| Lean Execution        | PASS                               |
| Architectural Fitness | PASS                               |
| Blind Spots           | WARNING (fixed → PASS post-triage) |
| Plan Completeness     | WARNING (fixed → PASS post-triage) |

## Grounding

9/9 paths ✓ (`src/middleware.ts`, `src/pages/api/auth/signout.ts`, `src/pages/api/auth/signup.ts`,
`src/pages/dashboard.astro`, `src/lib/supabase.ts`, `src/lib/supabase.test.ts`,
`supabase/migrations/20260827194321_create_maintenance_tasks.sql`, `src/types.ts`,
`src/db/database.types.ts`), 3/3 symbols ✓ (`MaintenanceFrequencyUnit` singular enum values, RLS
`using`/`with check` clauses on update/delete, `zod` absent from `package.json` dependencies),
brief↔plan ✓ (decisions, scope, and phases-at-a-glance all consistent with the full plan).

## Findings

### F1 — `zod` isn't pinned as a direct dependency, and this plan doesn't fix it

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1, Item 3 (Validation schema)
- **Detail**: `zod` is reachable today only transitively (confirmed: absent from `package.json`
  dependencies/devDependencies, present only in `package-lock.json` as a dependency of another
  package). The sibling plan (`first-task-on-dashboard/plan.md:221-227`) explicitly flags this as
  fragile and fixes it: "Run `npm install zod` before writing `src/lib/task-schema.ts`, pinning it
  as a direct dependency." This plan's Phase 1 Item 3 creates the identical file under the same
  check-before-create contract but never mentions installing `zod`. Since the plan's own design is
  symmetric (either slice may land first), if S-02 lands first, `task-schema.ts` gets built against
  a phantom transitive dependency — the exact risk the sibling plan calls out and closes.
- **Fix**: Add "run `npm install zod` (pin as a direct dependency) before creating `task-schema.ts`"
  to Phase 1 Item 3, mirroring S-01's Phase 2 Item 1 — but only if the file doesn't already exist
  (if S-01 landed first, `zod` is already a direct dependency and this step is a no-op).
- **Decision**: FIXED

### F2 — Mutation routes only check "empty result," never the Supabase error branch

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 Item 4, Phase 4 Item 3, Phase 5 Item 1 (all three API routes)
- **Detail**: All three contracts (`update(...).eq("id", ...).select()`, `delete(...).eq("id", ...).select()`) are written as "if the returned row array is empty, redirect... Task not found" —
  with no mention of destructuring or checking `error`. Confirmed against the migration
  (`supabase/migrations/20260827194321_create_maintenance_tasks.sql`): `id` is a `uuid` column. A
  request to `/api/tasks/<non-uuid-string>` (trivially craftable by any authenticated user via a
  REST client, no cross-user access needed) makes PostgREST fail to cast the filter value,
  returning `{ data: null, error: {...} }` — not an empty array. Code written literally to this
  plan's contract (`data.length === 0`) throws on `null.length`, an unhandled crash rather than the
  intended generic "Task not found" — undermining the plan's own stated goal ("no user's data ever
  exposed," achieved via one indistinguishable error message for every failure mode). The sibling
  plan's insert route does gesture at an error branch ("or `/dashboard?error=...` if the insert
  itself fails"); this plan's three routes don't carry that over.
- **Fix**: In each route's contract, destructure `{ data, error }` and treat `error` the same as an
  empty `data` array — redirect to the same generic "Task not found" message either way.
- **Decision**: FIXED

### F3 — Redirect error messages aren't explicitly shown as URL-encoded

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 Item 4 (`/tasks?error=<first issue message>`), Phases 3–5
  (`/tasks?error=Task not found`)
- **Detail**: S-01's plan spells out `encodeURIComponent(<message>)` for its equivalent redirect;
  S-02's prose drops the wrapper. A zod issue message can contain characters (`&`, `=`, quotes) that
  break query-string parsing if pasted in raw. Likely just prose shorthand rather than an intended
  omission, but worth being explicit so the implementer doesn't copy the literal template.
- **Fix**: Wrap both error values in `encodeURIComponent(...)` in the route contracts, matching
  S-01's phrasing.
- **Decision**: FIXED
