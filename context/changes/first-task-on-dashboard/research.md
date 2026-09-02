---
date: 2026-09-01T22:15:48+02:00
researcher: Claude (10x-research)
git_commit: 8b5f20c04cdbee4f066ca34921541ffc13efd436
branch: main
repository: 10x-home-maintenance
topic: "Is date-fns-api-docs.md compatible with the codebase for implementing S-01?"
tags: [research, codebase, date-fns, s-01, maintenance-tasks, dashboard]
status: complete
last_updated: 2026-09-02
last_updated_by: Claude (10x-research)
last_updated_note: "Fixed the frequency_unit plural/singular mismatch directly in date-fns-api-docs.md"
---

# Research: date-fns compatibility for S-01 (`first-task-on-dashboard`)

**Date**: 2026-09-01T22:15:48+02:00
**Researcher**: Claude (10x-research)
**Git Commit**: 8b5f20c04cdbee4f066ca34921541ffc13efd436
**Branch**: main
**Repository**: 10x-home-maintenance

## Research Question

Review the codebase and decide whether `context/changes/first-task-on-dashboard/date-fns-api-docs.md` is
compatible with it, to implement S-01 (`first-task-on-dashboard`) from `context/foundation/roadmap.md`.

## Summary

**date-fns v4 itself is fully compatible with this codebase — no infra, runtime, or tooling blocker exists.**
Cloudflare Workers `nodejs_compat` is already enabled, Node 26.7.0 far exceeds date-fns' floor, the project is
already pure ESM, and there's no existing date library to migrate away from or conflict with.

**However, the reference implementation embedded in `date-fns-api-docs.md` is NOT compatible as written** — it
uses the wrong vocabulary for `frequency_unit`. The doc's `FrequencyUnit` type and `computeDueDate` switch use
**plural** string literals (`"days" | "weeks" | "months" | "years"`), but the real, already-shipped Postgres enum
(`maintenance_frequency_unit`, from F-01) and its generated TypeScript type (`MaintenanceFrequencyUnit` in
`src/types.ts:9`) use **singular** values (`"day" | "week" | "month" | "year"`). This is not a naming nitpick —
copy-pasting the doc's switch verbatim compiles cleanly (this repo's `tsconfig.json` extends
`astro/tsconfigs/strict`, not `strictest`, so `noImplicitReturns` is off) but fails silently at runtime: every
call falls through every case, `computeDueDate` returns `undefined` for 100% of tasks, and every downstream
date-fns call (`differenceInCalendarDays(undefined, today)`) throws `RangeError: Invalid time value` — breaking
the dashboard for every task, on every render, with no type error to catch it. **The plan must rewrite the switch
to use `"day" | "week" | "month" | "year"`, not adapt the schema to match the doc.**

Two secondary, non-blocking gaps: `zod` and `react-hook-form` (recommended in `external-research.md`) are both
genuinely net-new — no existing code uses either, so there's no established convention to align with, but also no
conflict. The existing auth forms are hand-rolled (`useState` + native `<form>` POST + React 19's
`useFormStatus()`), so introducing `react-hook-form` for the add-task form is a deliberate new pattern, not a
continuation of one — worth a conscious decision in `plan.md` rather than defaulting silently.

## Detailed Findings

### 1. date-fns v4 — infra/runtime/tooling compatibility: clean

- `wrangler.jsonc:5-6` already sets `"compatibility_flags": ["nodejs_compat"]` and a recent
  `"compatibility_date": "2026-05-08"`. date-fns v4 needs no Node builtins (pure functions over native `Date`), so
  nothing further is required — `nodejs_compat` is already more than sufficient.
- `.nvmrc:1` → Node `26.7.0`; `package.json` has no `engines` field. Node 26 is far above date-fns v4's floor
  (Node ≥14, dual ESM/CJS build).
- `package.json:2` → `"type": "module"` — the project is already ESM-native; Vite 7 (pinned via the `overrides`
  block, `package.json:62-66`) resolves date-fns' ESM build with no special config.
- `astro.config.mjs:9-11` has no `vite.ssr.noExternal` or `optimizeDeps` entries today. The Astro-SSR gotcha
  documented in `external-research.md:38-45` (`ssr: { noExternal: ['react-hook-form'] }`) is about
  **react-hook-form**, not date-fns — date-fns is not flagged as needing that treatment in either research
  document, consistent with it being dependency-free.
- Grep for `date-fns|dayjs|luxon|moment` across `package.json` and `src/` returns zero hits — this is a genuinely
  net-new dependency with nothing to migrate away from or conflict with.

### 2. `frequency_unit` singular-vs-plural mismatch — confirmed real, must be corrected in the plan

- DB enum (authoritative, already shipped): `supabase/migrations/20260827194321_create_maintenance_tasks.sql:16`
  → `create type maintenance_frequency_unit as enum ('day', 'week', 'month', 'year');`
- Generated type: `src/db/database.types.ts:58` → `maintenance_frequency_unit: "day" | "week" | "month" | "year";`, re-exported as `MaintenanceFrequencyUnit` at `src/types.ts:9`.
- PRD is explicit and deliberate about singular: `context/foundation/prd.md:114-115` — "Frequency model:
  `frequency_value` (integer) combined with `frequency_unit`, limited to `day` | `week` | `month` | `year`."
- F-01's own plan repeats singular throughout: `context/changes/maintenance-task-data-model/plan.md:39-40, 116-118, 191, 202`.
- The doc's reference implementation (`context/changes/first-task-on-dashboard/date-fns-api-docs.md:22-35`) is the
  **only** place in the entire project — code or docs — using plural (`"days" | "weeks" | "months" | "years"`).
  Grep for `frequency_unit`/`FrequencyUnit` across `src/` confirms there is no adapter/mapping function anywhere
  that translates between the two forms.
- Failure mode if copy-pasted with `MaintenanceFrequencyUnit` substituted for the doc's `FrequencyUnit` alias:
  `tsconfig.json:2` extends `astro/tsconfigs/strict`, which (unlike `astro/tsconfigs/strictest`) does not set
  `noImplicitReturns`. So a switch whose case labels (`"days"`, etc.) never match the narrowed discriminant
  (`"day"`, etc.) compiles with **no TS error** (not TS2678/TS7030) despite the declared `Date` return type. At
  runtime every call falls through and returns `undefined`; the first date-fns call on that value
  (`differenceInCalendarDays`/`format`) throws `RangeError: Invalid time value`. This breaks status computation
  for every task, silently, until someone tests with a real date.
- **Fix for `plan.md`**: use `"day" | "week" | "month" | "year"` as the switch's case labels (matching
  `MaintenanceFrequencyUnit` directly — no adapter needed, just correct literals), not the plural placeholders
  shown in the doc's illustrative snippet.

### 3. F-01 deliberately deferred status/due-date computation to S-01

- `context/changes/maintenance-task-data-model/plan.md:35-38` — "Roadmap F-01 … scopes this change to raw stored
  fields only … not the derived `next_due_date`/`status` fields from FR-008/FR-009. Those are computed by
  consumers (S-01, S-03), not stored here."
- `context/changes/maintenance-task-data-model/plan.md:62-63` — "No `next_due_date` or `status` columns,
  generated columns, or SQL functions — status/due-date computation is explicitly deferred to S-01/S-03."
- This confirms S-01 is the correct, and first, place to introduce date-fns and the status-computation logic —
  there is no existing (and possibly conflicting) implementation to reconcile with.

### 4. Documented date-fns gotchas (from `date-fns-api-docs.md`) — still applicable, carry into the plan

- `differenceInCalendarDays` (not `differenceInDays`) is the correct function for the OK/DUE SOON/OVERDUE
  thresholds, since `last_done_date` is a date-only Postgres `date` column
  (`supabase/migrations/20260827194321_create_maintenance_tasks.sql:29`) with no time-of-day component to
  misinterpret.
- `addMonths` clamps to month-end for short months (e.g. Jan 31 + 1 month → Feb 28) — worth an explicit test case,
  as the doc already suggests.
- Use lowercase `format` tokens (`yyyy-MM-dd`), not Moment-style uppercase.

These are internal to date-fns' own semantics, unaffected by anything in this codebase, and remain accurate.

### 5. Existing conventions the new code should follow

- **Validation**: `zod` is not used anywhere today (`src/pages/api/auth/{signin,signup,signout}.ts` all use raw
  `context.request.formData()` + `form.get(...) as string` casts, no schema, no `zod` import; grep for `zod`
  across `src/` and `package.json` returns zero hits). CLAUDE.md's "validate input with zod" is aspirational, not
  an established pattern yet — S-01 would be the first code to actually follow it. No conflict, but also no
  precedent to copy from.
- **Forms**: `src/components/auth/SignInForm.tsx` / `SignUpForm.tsx` are hand-rolled — per-field `useState`,
  regex/length validation in a local `validate()` function, native `<form method="POST" action="...">` full-page
  submission, `SubmitButton.tsx` using React 19's `useFormStatus()`. No `react-hook-form` anywhere in
  `package.json` or `src/`. Introducing `react-hook-form` + `@hookform/resolvers` (per `external-research.md`) is
  net-new tooling, not a deviation from an established pattern — but it does mean the add-task form would be the
  first form in the repo not following the existing "native POST + useFormStatus" style. Worth a deliberate call
  in `plan.md`, not a default.
- **Tests**: `src/lib/supabase.test.ts` and `src/lib/utils.test.ts` are the only two test files in the repo — both
  colocated `*.test.ts` (no `__tests__` folder anywhere), using `describe(<subject>, ...)` /
  `it("should <behavior>", ...)` from Vitest, plain `expect().toBe()`/`toHaveBeenCalledWith()` assertions, and
  `vi.hoisted()` + dynamic `await import(...)` for mocking modules with side-effecting top-level state
  (`supabase.test.ts:22`). No existing date/status test exists — a new `computeStatus`/`computeDueDate` test suite
  would be the first, free to set its own fixtures but should follow the `describe`/`it("should ...")` +
  colocated-file convention.
- **Where the new helper belongs**: `src/lib/` currently has only `config-status.ts`, `supabase.ts`, `utils.ts`
  (plus their `*.test.ts`) — no `src/lib/services/` directory exists yet. Per CLAUDE.md ("Services/helpers go in
  `src/lib/`"), a flat `src/lib/status.ts` (or similar) with a colocated `status.test.ts` matches the only pattern
  with actual precedent today.
- **Where status computation should run**: `src/pages/dashboard.astro:1-16` already exists and destructures
  `const { user } = Astro.locals;` directly in frontmatter (populated by `src/middleware.ts:6-16` via
  `supabase.auth.getUser()`). This confirms the established pattern is server-side computation inside `.astro`
  frontmatter — query `maintenance_tasks` scoped to `user.id` (RLS-enforced), compute due date/status per task
  there using date-fns, sort, then pass the already-computed, already-sorted list as props into any React island
  used for the interactive add-task form — rather than fetching/computing client-side.
- **Types already in place**: `src/types.ts` already exports `MaintenanceTask`, `MaintenanceTaskInsert`,
  `MaintenanceTaskUpdate`, `MaintenanceCategory`, `MaintenanceImportance`, `MaintenanceFrequencyUnit`, all derived
  from `Database` (`src/db/database.types.ts`, generated from the live schema). A new `computeStatus(task: MaintenanceTask)` helper should consume these directly — no new type definitions needed for the DB-shape side.

### 6. Adjacent observation (not blocking S-01, flagged for awareness)

None of the three existing auth API routes (`signin.ts`, `signup.ts`, `signout.ts`) export
`const prerender = false;`, despite CLAUDE.md:21 stating "API routes must export `const prerender = false`." This
is a pre-existing gap unrelated to date-fns compatibility, surfaced here only because S-01 will add the first new
API-route code since that convention was written — worth deciding whether new S-01 routes should also fix this on
the routes they touch, or leave it as a separate cleanup.

## Code References

- `wrangler.jsonc:5-6` — `nodejs_compat` flag + compatibility date, already sufficient for date-fns v4.
- `.nvmrc:1` — Node `26.7.0`.
- `package.json:2` — `"type": "module"`.
- `astro.config.mjs:9-11` — `vite` config, no `noExternal`/`optimizeDeps` entries yet.
- `supabase/migrations/20260827194321_create_maintenance_tasks.sql:16` — `maintenance_frequency_unit` enum,
  singular values.
- `src/db/database.types.ts:58` — generated `maintenance_frequency_unit` literal union.
- `src/types.ts:1-9` — `MaintenanceTask*`/`MaintenanceFrequencyUnit` type re-exports.
- `context/changes/first-task-on-dashboard/date-fns-api-docs.md:22-35` — the reference implementation with the
  plural `FrequencyUnit` mismatch.
- `context/foundation/prd.md:114-115` — PRD's authoritative singular frequency vocabulary.
- `context/changes/maintenance-task-data-model/plan.md:35-38,62-63,116-118` — F-01's deferral of status/due-date
  computation to S-01, and its singular enum decision.
- `tsconfig.json:1-2` — extends `astro/tsconfigs/strict` (not `strictest`), explaining why the mismatch wouldn't
  be caught at compile time.
- `src/pages/api/auth/signin.ts:1-20`, `signup.ts:1-20`, `signout.ts:1-10` — no zod, no `prerender = false`,
  redirect-based error handling.
- `src/components/auth/SignInForm.tsx`, `SignUpForm.tsx`, `SubmitButton.tsx` — hand-rolled form convention.
- `src/lib/supabase.test.ts:22`, `src/lib/utils.test.ts:1-17` — Vitest conventions.
- `src/pages/dashboard.astro:1-16` — existing server-side `Astro.locals.user` access pattern.
- `src/middleware.ts:6-16`, `src/env.d.ts:1-5` — user resolution/typing.

## Architecture Insights

- This project treats the DB-generated enum literals as the single source of truth for domain vocabulary
  (`frequency_unit`, `category`, `importance` all flow from `supabase gen types typescript` into `src/types.ts`
  with zero hand-written duplicate string unions). Any new code introducing its own parallel vocabulary (as the
  external date-fns doc's illustrative snippet does) is a smell to catch during planning, not implementation.
- `astro/tsconfigs/strict` (not `strictest`) is a real gap in this project's type-safety net: non-exhaustive
  switches over string-literal unions don't get caught by `noImplicitReturns`. Worth a `lessons.md` entry if this
  class of bug is a concern beyond S-01 — e.g. always add a `default: never` exhaustiveness check in switches
  over generated enum types rather than relying on the compiler.
- Server-rendered `.astro` frontmatter is the established integration point for reading `Astro.locals.user` and
  querying Supabase — React islands are used for the fully-interactive layer only, not for data-fetching
  orchestration.

## Historical Context (from prior changes)

- `context/changes/maintenance-task-data-model/plan.md` (F-01) — established the `maintenance_tasks` schema,
  fixed `frequency_unit` as singular (`day|week|month|year`), and explicitly deferred all status/due-date
  computation to S-01/S-03. This is the direct upstream dependency for everything in this research.
- `context/changes/first-task-on-dashboard/external-research.md` — the external (exa.ai) research that
  recommended date-fns v4, zod, react-hook-form + `@hookform/resolvers` for S-01, and flagged the
  react-hook-form/Astro SSR `noExternal` gotcha (unrelated to date-fns).
- `context/changes/first-task-on-dashboard/date-fns-api-docs.md` — the Context7-sourced date-fns API reference
  this research was asked to validate; contains the plural/singular mismatch documented above.
- `context/archive/` — contains only a placeholder `README.md`; no archived changes exist yet, so no further
  historical precedent to check.

## Related Research

None yet — this is the first `research.md` in `context/changes/first-task-on-dashboard/`.

## Open Questions

- Should the add-task form use `react-hook-form` (per `external-research.md`'s recommendation) or follow the
  existing hand-rolled `useState` + native-POST convention used by the auth forms? Both are viable; this is a
  deliberate design choice for `plan.md`, not something this research resolves.
- Should S-01's new API route(s) (if any are added as genuine JSON endpoints rather than `.astro`-frontmatter
  queries) also add the missing `export const prerender = false;` to the existing auth routes it touches, or
  leave that as separate cleanup? Flagged as adjacent, not blocking.

## Follow-up Research 2026-09-02

The `frequency_unit` singular/plural mismatch documented above (section 2 of Detailed Findings) has been fixed
directly at the source: `context/changes/first-task-on-dashboard/date-fns-api-docs.md`'s `FrequencyUnit` type
alias and `computeDueDate` switch now use the correct singular literals (`"day" | "week" | "month" | "year"`),
matching the shipped `maintenance_frequency_unit` enum and `MaintenanceFrequencyUnit` type
(`src/types.ts:9`), with an inline comment noting why. A copy-paste of the doc's reference implementation into
`plan.md`/implementation will now produce a correct, exhaustive switch instead of the silent
`undefined`-for-every-task failure described above.

**Rationale for fixing the doc itself** (rather than only flagging it here): the doc's "Reference implementation
shape" section was already a synthesized example using this project's own field names (`frequency_unit`,
`last_done_date`) — not a verbatim Context7 quote — so correcting it completes its stated purpose ("the exact
functions needed to implement S-01's status computation") rather than altering a factual record. The `## Sources`
links (actual Context7-sourced date-fns doc/source references) were left untouched.

No other content in `date-fns-api-docs.md` changed — the documented gotchas (calendar-days semantics, `addMonths`
clamping, lowercase format tokens), the dashboard-sort snippet, and the sources list are unaffected and remain
accurate.

**Updated compatibility verdict**: `date-fns-api-docs.md` is now fully compatible with the codebase — no
remaining corrections needed before it feeds into `/10x-plan`.
