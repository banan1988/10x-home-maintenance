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

## Parallel slices sharing a foundation must pin shared-file contracts as check-before-create

- **Context**: `first-task-on-dashboard` (S-01) and `manage-maintenance-tasks` (S-02) both depend only on `F-01`
  and are explicitly parallel (`roadmap.md` Streams A/B), but both plans independently need `src/lib/status.ts`,
  `src/lib/task-schema.ts`, and the shadcn `Dialog` component — with neither slice's implementation order
  guaranteed.
- **Problem**: A plan written as "create file X" is only correct if that plan's own slice is guaranteed to be
  implemented first. When a sibling slice not yet implemented needs the exact same file, an unconditional
  "create" step either silently duplicates/overwrites the other slice's work (if implemented second) or never
  gets written at all as the plan expects (if the sibling created it first and the plan wasn't updated).
- **Rule**: When two roadmap items are marked "Parallel with" each other and both need a shared file, both
  plans must specify that file's creation as conditional: check whether the file already exists before creating
  it; if present, read it, confirm it matches the (identically pinned) contract, and reuse rather than recreate;
  if absent, create it exactly as specified. Pin the exact same contract (exported names/signatures) in both
  plans so reuse is safe either way.
- **Applies to**: Any future roadmap item pair marked "Parallel with" each other that shares a foundation and
  needs common files/components.

## Server-side "no future date" checks on a bare calendar-day string need a timezone grace window

- **Context**: `src/lib/task-schema.ts:16` (`last_done_date`'s future-date `.refine`), discovered via F4 in
  `context/changes/first-task-on-dashboard/reviews/impl-review.md`
- **Problem**: When a form submits a date-only string (`YYYY-MM-DD`) with no timezone info, and the server
  (Cloudflare Workers, UTC) validates it against its own `new Date()`, a user whose local timezone is ahead of
  UTC (e.g. Warsaw, UTC+1/+2) can have their genuine "today" rejected as a future date during the 1-2 hour
  window between their local midnight and UTC midnight — even though the client-side picker already used the
  browser's own clock to prevent picking a truly future date.
- **Rule**: When validating a bare calendar-day string server-side against "today," add a small grace window
  (e.g. `date <= addDays(new Date(), 1)`) rather than comparing directly to the server's instant — unless the
  app already captures and validates against the user's actual timezone offset. Don't build full
  timezone-tracking infrastructure for this unless the product actually needs precise multi-timezone
  correctness.
- **Applies to**: Any future server-side validation of a date-only (no time/timezone) field submitted from a
  client against "today" or "now."

## String fields must always have a maximum length

- **Context**: `src/lib/task-schema.ts:7` (`addTaskSchema.name`), discovered via F5 in
  `context/changes/first-task-on-dashboard/reviews/impl-review.md`
- **Problem**: `name: z.string().trim().min(1, ...)` had no `.max()`, and the underlying `name text` DB column
  is unbounded too — nothing stopped an arbitrarily large string from being submitted and stored.
- **Rule**: Every string/text form field's zod schema must declare an explicit `.max()`, sized to what's
  realistic for that field (e.g. ~200 for a short title/name-style field, larger for free-text/description
  fields). Pick a value using comparable real-world conventions (e.g. Jira summary ≈255, GitHub issue title
  ≈256) rather than an arbitrary guess, and don't leave it unbounded even if the DB column itself has no length
  constraint.
- **Applies to**: Any new zod schema for a string/text form field, client or server side.

## `roadmap.md` status must only be synced by the epilogue step, not a mid-phase commit

- **Context**: `context/foundation/roadmap.md`, commit `ffac278` ("shared status & validation modules (p1)" —
  S-02's _first_ implementation phase). The commit message claims "Syncs roadmap.md S-02 status to in-progress",
  but the actual diff set S-02 straight to `done` and also flipped S-01 from `in-progress` to `done`, skipping
  `in-progress` entirely — three-plus phases before either slice was actually finished. Neither slice's real
  epilogue commit (the one that closes out the plan and flips `change.md` to `implemented`/`impl_reviewed`) ever
  touched `roadmap.md` afterward, so the file was never re-synced at actual completion — it happened to already
  read `done` by coincidence once both slices genuinely finished, not because the process worked.
- **Problem**: A mid-phase commit silently wrote a final (`done`) roadmap status while its own commit message
  described a different, more conservative status (`in-progress`) — a discrepancy between message and diff that
  a reviewer skimming commit messages would miss entirely. If either slice had stalled or been abandoned after
  that commit, `roadmap.md` would have shown `done` for work that was never finished, and nothing downstream
  would have caught it, since the epilogue step (which the existing lesson "Closing out a plan must also update
  roadmap.md" assumes is the one touching this file) never ran against `roadmap.md` at all for either slice.
- **Rule**: `roadmap.md`'s per-item `Status` field should only ever be written by the epilogue close-out step
  (when `change.md` flips to `implemented`/`impl_reviewed`), never by an earlier implementation-phase commit. If
  an earlier commit's message claims to sync roadmap status, diff-check that the file change actually matches
  the claimed status before merging — a message/diff mismatch on a status field is a signal the sync logic (or
  the person/agent invoking it) made a mistake.
- **Applies to**: Any commit during a change's implementation phases that touches `roadmap.md`'s status
  fields; `/10x-impl-review` and plan/PR review should flag a phase-N commit that sets a roadmap item straight
  to `done`.

## Every `/api/*` route must use the shared auth-check contract

- **Context**: `context/changes/testing-auth-isolation-contract/plan.md` (test-plan.md §3 Phase 1) — before
  this change, all 4 mutation routes under `src/pages/api/tasks/` independently repeated
  `if (!context.locals.user) return context.redirect("/auth/signin");` inline, with no shared helper and no
  test constructing two distinct users, despite ownership already being correctly deferred to RLS.
- **Problem**: A documented-only convention ("self-check `locals.user` first, defer ownership to RLS") with
  nothing enforcing it lets a new route (e.g. S-03's public CRUD API) silently ship without its own auth check,
  or copy the inline pattern incorrectly, because nothing forces it through one importable implementation.
- **Rule**: Every new `/api/*` route must call `requireUser(context)` (`src/lib/auth.ts`) for its auth check —
  never repeat the inline `locals.user` check. Its test file must call `assertRequiresAuth` from
  `@/test-utils/auth-contract` for the unauthenticated case, and add a cross-user case (another user's row
  produces the identical generic not-found redirect as a nonexistent one) whenever the route defers ownership
  to RLS, following the Phase 2 pattern in `src/pages/api/tasks/[id].test.ts`. Routes whose ownership check
  matters for RLS correctness should also be covered by the Phase 3 real-RLS integration tier's pattern
  (`src/pages/api/tasks/isolation.integration.test.ts`, `supabase/seed.sql`) — see test-plan.md §6.2/§6.7.
- **Applies to**: Any future `/api/*` route, including S-03 (`maintenance-tasks-api`) and any route added after
  it.

## RLS-only ownership filters need an explicit code comment

- **Context**: `src/pages/api/tasks/[id].ts:42-44`, `complete.ts:28-30`, `delete.ts:22-24`
  (`testing-auth-isolation-contract`) — all three mutation routes filter only by `.eq("id", ...)`, deferring
  ownership enforcement entirely to RLS.
- **Problem**: This is a deliberate, already-tested design (proven by the real-RLS integration tier), but
  nothing in the route code itself said so — a future editor unfamiliar with the plan could mistake the
  missing `user_id` filter for a bug and "fix" it by adding a redundant or subtly wrong app-layer check.
- **Rule**: Any query that relies on RLS alone for row-ownership enforcement (i.e. filters only by primary key,
  no `user_id`/`owner_id` clause) must carry a one-line comment pointing to the RLS migration/policy that
  enforces it.
- **Applies to**: Any `/api/*` route or service-layer query that intentionally omits an app-layer ownership
  filter in favor of RLS.

## Test titles must use the `it("should ...")` phrasing

- **Context**: `src/lib/auth.test.ts:13,21` (`testing-auth-isolation-contract`) — used bare descriptions
  ("returns the authenticated user when present") instead of the "should ..." phrasing every other
  `*.test.ts` file in the repo uses.
- **Problem**: A new test file that skips the established `it("should ...")` convention is a small but real
  inconsistency — test output reads oddly next to sibling suites, and nothing currently catches this at review
  time besides a human noticing.
- **Rule**: Every `it(...)` description in this repo must start with "should " (e.g.
  `it("should return X when Y", ...)`), matching the convention already used in `task-schema.test.ts`,
  `status.test.ts`, `supabase.test.ts`, and all `src/pages/api/tasks/*.test.ts` files.
- **Applies to**: Any new or edited Vitest `it(...)` block in this repo.

## Cloudflare Workers always run in UTC — forcing `TZ` on the host does nothing

- **Context**: `context/changes/status-date-regression-grid/plan.md` Phase 1 — the plan's manual
  verification step called for forcing a non-UTC host `TZ` and running `npm run dev` to observe a
  `parseISO`/`new Date` parsing divergence between pages.
- **Problem**: This app's actual runtime — Cloudflare Workers (`workerd`), used by both `npm run dev` (via
  the `@astrojs/cloudflare` adapter) and every real deployment (preview and production) — hardcodes its
  clock to UTC and ignores the host's `TZ` environment variable entirely. Verified empirically: a throwaway
  `wrangler dev --local` worker reported `Intl.DateTimeFormat().resolvedOptions().timeZone === "UTC"` and
  `getTimezoneOffset() === 0` even with `TZ=America/New_York` forced on the host shell. A timezone-dependent
  bug (e.g. a bare-date-string parsing divergence) that only manifests under a non-UTC local timezone is
  therefore **unobservable in this app's dev server, preview builds, or production** — only in Node-based
  tooling (Vitest, scripts) that actually honors `process.env.TZ`.
- **Rule**: Never rely on forcing a host `TZ` and running `npm run dev`/a Cloudflare preview to manually
  verify timezone-dependent behavior in this app — it will show no difference either way, regardless of
  whether the underlying bug is fixed. Pin timezone-dependent behavior with a Vitest `process.env.TZ`-forced
  test instead (see §6.5 in `test-plan.md` for the pattern); treat that test, not a manual browser check, as
  the real regression protection.
- **Applies to**: Any future manual verification step that proposes forcing a system/host timezone to observe
  behavior in this app's dev server, preview build, or production — and any code that assumes the deployed
  runtime has a non-UTC local timezone.

## Numeric input fields need an explicit upper bound too, not just strings

- **Context**: `src/lib/task-schema.ts` (`addTaskSchema`/`createTaskJsonSchema`'s `frequency_value`),
  discovered via Phase 3's extreme-value documenting tests in
  `context/changes/status-date-regression-grid/plan.md`.
- **Problem**: `frequency_value: z.coerce.number().int().positive(...)` had no `.max()` — schema-permitted an
  arbitrarily large integer. A large enough value (e.g. `100_000_000` with `frequency_unit: "day"`) makes
  `computeDueDate`'s `addDays`/`addMonths`/`addYears` silently overflow `Date`'s representable range into an
  `Invalid Date` (no throw at that point), which then makes every unguarded downstream
  `format(dueDate, "yyyy-MM-dd")` call (`src/components/tasks/TaskList.tsx:70`, `src/lib/task-dto.ts:11`)
  throw `RangeError: Invalid time value` — an unhandled SSR crash reachable by any user who submits a large
  enough number. This is the same root problem as the existing "string fields must always have a maximum
  length" lesson, just for numbers instead of strings — an unbounded numeric field is as much an attack/crash
  surface as an unbounded string one.
- **Rule**: Every numeric zod field that feeds date arithmetic (or any other operation with a representable
  range) must declare an explicit `.max()`, sized well below the point where downstream arithmetic could
  overflow — e.g. `frequency_value.max(1000)`, comfortably below the ~100,000,000-day threshold where
  `computeDueDate` overflows `Date`, while still far larger than any realistic input. Don't leave a numeric
  field unbounded just because the "positive integer" validation already looks sufficient.
- **Applies to**: Any new or edited zod schema for a numeric field, especially one that feeds date/time
  arithmetic or any other operation with a hard representable range.

## `stryker run --mutate` with multiple files needs one comma-separated string, not repeated flags

- **Context**: Running Stryker scoped to `status-date-regression-grid`'s three changed production files
  (`src/lib/status.ts`, `src/lib/task-dto.ts`, `src/lib/task-schema.ts`), per `test-plan.md`'s "Mutation
  testing (Stryker) — selective quality gate" workflow (narrow scope to the changed module(s)).
- **Problem**: `npx stryker run --mutate "a.ts" --mutate "b.ts" --mutate "c.ts"` (repeated `--mutate` flags)
  silently keeps only the last value — Stryker prints no error or warning, runs to completion, and produces a
  plausible-looking report that only covers `c.ts`. The first run here silently dropped `status.ts` and
  `task-dto.ts` from scope entirely; this was only caught by noticing the report's per-file table listed a
  single file instead of three.
- **Rule**: To scope `stryker run --mutate` to more than one file, pass a single comma-separated string:
  `--mutate "src/lib/a.ts,src/lib/b.ts,src/lib/c.ts"` — never repeated `--mutate` flags. After any scoped run,
  check the report's per-file breakdown table actually lists every file intended to be in scope before trusting
  the mutation score; a missing file is a silent scope-narrowing bug, not a "0 mutants found" signal.
- **Applies to**: Any future `npx stryker run --mutate ...` invocation scoping to more than one file.
