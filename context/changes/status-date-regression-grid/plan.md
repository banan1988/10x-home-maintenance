# Status/Date Regression Grid Implementation Plan

## Overview

Close `test-plan.md` §3 Phase 3 (Risk #6: "the currently-tested status boundary silently stops honoring
FR-008/FR-009 after a future change to status/date logic"). This plan fixes a real, live date-parsing
divergence between `dashboard.astro` and its two sibling call sites, then builds the frequency-unit ×
status-boundary regression grid the phase name calls for, plus a couple of extreme-value documenting cases.

## Current State Analysis

- `src/lib/status.ts` is the single implementation of due-date/status computation (`computeDueDate`,
  `computeStatus`, `compareByUrgency`, `DUE_SOON_THRESHOLD_DAYS = 7`). No duplication exists today.
- `src/lib/status.test.ts` tests the frequency-unit axis (day/week/month/year) and the status-boundary axis
  (-1/0/+7/+8 days) **separately** — never combined, which is exactly the gap the phase name names.
- `computeStatus`'s existing boundary tests construct due dates via `addDays` (date-fns) — the same primitive
  `computeDueDate` uses internally, a partial mirror of the code under test.
- Three call sites parse the same `last_done_date` bare-`YYYY-MM-DD` string two different ways:
  `dashboard.astro:24` uses `parseISO` (local midnight); `src/lib/task-dto.ts:7` and
  `src/pages/tasks/index.astro:20` use `new Date(string)` (UTC midnight, per ECMAScript's date-only grammar).
  At a timezone edge, the same task resolves to a different due date — and therefore a different status —
  depending on which page/route renders it. This is a live bug, not a hypothetical.
- No test file pins this divergence today. `task-schema.test.ts:83-108` forces `TZ=America/New_York` to test
  the schema's own `last_done_date` parsing, but that pattern hasn't been applied to `task-dto.ts`'s call site.
- `computeDueDate` has no internal guard against `frequency_value` extremes or very old `last_done_date`
  (both schema-permitted, unbounded); no test documents what happens at those extremes today.
- `test-plan.md` §6.5 ("Extending status/date logic boundary tests") is a literal `TBD` placeholder.

## Desired End State

- `src/lib/status.test.ts` contains a parameterized grid proving all 4 frequency units correctly cross each
  FR-009 boundary (-1/0/+7/+8 days), using literal `Date` construction rather than date-fns-derived fixtures.
- `task-dto.ts` and `tasks/index.astro` parse `last_done_date` identically to `dashboard.astro` (via
  `parseISO`). `task-dto.ts`'s call site is verified by a TZ-forced regression test in `task-dto.test.ts`;
  `tasks/index.astro`'s identical fix is verified manually only (no `.astro` unit-test tier exists in this
  repo).
- A couple of schema-permitted extreme inputs (very large `frequency_value`, very old `last_done_date`) have
  documented — not necessarily changed — behavior in `status.test.ts`.
- `test-plan.md` §6.5 describes the grid/TZ-forcing pattern for future contributors; the S-07 drift risk is
  flagged as an open risk in this plan.
- `npm run test`, `npm run check`, and `npm run lint` all pass.

### Key Discoveries

- `dashboard.astro:1,24` already uses the correct pattern (`parseISO`) — the parsing fix is copying an
  established in-repo pattern, not introducing a new one.
- `task-schema.test.ts:84-92` already has the exact TZ-forcing (`process.env.TZ` in `beforeAll`/`afterAll`)
  pattern this plan's Phase 1 test reuses.
- No test framework in this repo renders `.astro` frontmatter directly — verifying `dashboard.astro`'s and
  `tasks/index.astro`'s rendered output is Phase 2 (component)/Phase 5 (e2e) territory, out of this phase's
  reach even after the parsing fix lands.
- `test-plan.md:88` fixes this phase's test type as `unit` only — a structural/lint guard against future
  duplication of `status.ts`'s logic is Phase 4's scope (Risk #7, static check), not this phase's.

## What We're NOT Doing

- Not adding a lint/structural guard preventing future duplication of status/date logic — that's Phase 4's
  scope (Risk #7).
- Not adding component or e2e tests verifying `dashboard.astro`'s/`tasks/index.astro`'s rendered output after
  the parsing fix — that's Phase 2/Phase 5's scope.
- Not introducing a new shared `parseTaskDate()` helper module — the fix reuses the existing `parseISO`
  import pattern already established in `dashboard.astro`, not a new abstraction.
- ~~Not fixing or guarding `computeDueDate` against extreme `frequency_value`/`last_done_date` inputs — Phase
  3's tests document current behavior only.~~ **Deviation (Phase 3, user-directed):** the documenting tests
  surfaced a real, reachable crash (`format()` throws `Invalid time value` in `TaskList.tsx:70` /
  `task-dto.ts:11` on an overflowed `dueDate`), and the user chose to fix it in-phase rather than leave it
  flagged-only — see Phase 3's Progress notes for what changed (`task-schema.ts`'s `frequency_value.max(1000)`)
  and why the schema-layer guard was preferred over touching the `format()` call sites directly. The
  `last_done_date` half of this bullet still holds — no guard was added there, since that case doesn't crash
  (documented, not fixed).
- Not writing a new `lessons.md` entry for S-07 (`unified-visual-theme`) — captured as an open risk in this
  plan only.

## Implementation Approach

Phase 1 closes the live parsing bug first (small, well-precedented, and it's the input the regression grid in
Phase 2 should be built against once fixed rather than testing a value known to already diverge). Phase 2
delivers the phase's core deliverable: the frequency × boundary grid. Phase 3 adds narrow, low-cost
documenting coverage for schema-permitted extremes. Phase 4 closes out the phase's paper trail (cookbook,
open-risk note, change status).

## Critical Implementation Details

### Timing & lifecycle

`process.env.TZ` is process-global — Vitest runs test files within the same worker process. The
`beforeAll`/`afterAll` capture-and-restore pattern from `task-schema.test.ts:84-92` must be replicated exactly
(capture the original value, restore it in `afterAll`) or a forced `TZ` will leak into whichever other test
file runs next in the same worker, silently changing its dates.

______________________________________________________________________

## Phase 1: Fix & regression-test the date-parsing divergence

### Overview

Align `task-dto.ts` and `tasks/index.astro` with `dashboard.astro`'s existing `parseISO` usage so all three
call sites treat `last_done_date` as a local-calendar-day, closing the cross-page status/due-date divergence
at timezone edges.

### Changes Required

#### 1. Parsing call sites

**File**: `src/lib/task-dto.ts`

**Intent**: Parse `last_done_date` the same way `dashboard.astro` already does, so `toTaskDto`'s due-date/status
computation no longer diverges from the dashboard page at a timezone edge.

**Contract**: Replace `new Date(task.last_done_date)` (line 7) with `parseISO(task.last_done_date)`, importing
`parseISO` from `date-fns` alongside the existing `format` import.

**File**: `src/pages/tasks/index.astro`

**Intent**: Same alignment as above, for the tasks list page's independent parsing call.

**Contract**: Replace `new Date(task.last_done_date)` (line 20) with `parseISO(task.last_done_date)`, importing
`parseISO` from `date-fns`.

#### 2. Regression test proving the fix

**File**: `src/lib/task-dto.test.ts`

**Intent**: Prove `toTaskDto` now agrees with `dashboard.astro`'s date interpretation instead of silently
drifting a calendar day at a timezone edge.

**Contract**: New `describe` block reusing the `task-schema.test.ts:84-92` TZ-forcing pattern
(`process.env.TZ = "America/New_York"` in `beforeAll`, restored in `afterAll`). With that TZ forced, call
`toTaskDto` with a `last_done_date` chosen so that `new Date(string)` (the pre-fix behavior) would resolve to
the previous local calendar day versus `parseISO`'s same-day result — e.g. `last_done_date: "2026-01-01"`,
`frequency_value: 3`, `frequency_unit: "month"` — and assert `dto.due_date` is `"2026-04-01"` (the
`parseISO`-correct result; the pre-fix `new Date(string)` behavior would have produced `"2026-03-31"`).

### Success Criteria

#### Automated Verification

- Unit tests pass: `npm run test`
- Type checking passes: `npm run check`
- Linting passes: `npm run lint`

#### Manual Verification

- Run the app with a non-UTC system timezone forced (e.g. `TZ=America/New_York npm run dev`) and confirm
  the dashboard and the tasks list page show the same due date/status for the same task whose
  `last_done_date` sits near a local-midnight/UTC-midnight divergence.

______________________________________________________________________

## Phase 2: Frequency × boundary regression grid

### Overview

Combine the frequency-unit axis and the FR-009 status-boundary axis into one parameterized grid, closing the
gap where today's tests exercise each axis independently but never together.

### Changes Required

#### 1. Regression grid

**File**: `src/lib/status.test.ts`

**Intent**: For each of the 4 frequency units, prove that a task computed to land exactly on each FR-009
boundary (-1, 0, +7, +8 days from "today") resolves to the correct `TaskStatus`, closing the gap named
explicitly by the phase goal. Supplements the existing per-function tests; does not replace them.

**Contract**: A new `it.each` table (or `describe.each`) composing `computeDueDate` then `computeStatus` per
row, with **hand-calculated literal `Date` fixtures** for `today`/`lastDoneDate`/`expectedDueDate` — not
`addDays`/`addMonths`/`addYears`-derived ones, per the mirror-implementation anti-pattern this file's existing
tests already partially exhibit. Minimum coverage: 4 frequency units × 4 boundary offsets (16 rows). Also add
at least one row combining a calendar-length edge (e.g. a leap-year February, or the existing Jan-31→Feb-28
clamp) with a status boundary, since today's clamp test isn't combined with a boundary check. Illustrative row
shape (values are illustrative, not prescriptive — the implementer derives the full table):

```ts
{ frequencyUnit: "month", frequencyValue: 1, lastDoneDate: new Date(2026, 4, 25), today: new Date(2026, 5, 22), expectedDueDate: new Date(2026, 5, 25), expectedStatus: "DUE_SOON" }
```

Each row should assert both `computeDueDate`'s literal result (catches a wrong fixture) and
`computeStatus`'s resulting `TaskStatus` (the actual FR-009 assertion).

### Success Criteria

#### Automated Verification

- Unit tests pass: `npm run test`
- Type checking passes: `npm run check`
- Linting passes: `npm run lint`

#### Manual Verification

- Hand-verify 2-3 grid rows against the literal FR-008/FR-009 boundary table (`prd.md:110-119`) to confirm
  the fixtures are correct against the oracle, not just internally consistent.

______________________________________________________________________

## Phase 3: Extreme-value documenting cases

### Overview

Document current `computeDueDate` behavior for schema-permitted extreme inputs research flagged as
unguarded and untested — without changing implementation.

### Changes Required

#### 1. Extreme-value cases

**File**: `src/lib/status.test.ts`

**Intent**: Record what `computeDueDate` actually does today for a very large `frequency_value` and a very old
`last_done_date` (both schema-permitted, per `task-schema.ts`'s `.positive()`-but-unbounded constraint and no
lower bound on `last_done_date`), so a future change that alters this behavior shows up as a failing test
rather than silently.

**Contract**: One or two `it` cases picking concrete values large/old enough to be a meaningful stress case
(the implementer should experiment to find values that exercise the interesting edge, e.g. a `frequency_value`
large enough to approach `Date` overflow, and a `last_done_date` from a implausibly early year). Assert
whatever the actual current output is (a valid far-future `Date`, or `Invalid Date` — whichever it turns out to
be) — do not invent an expected value the code doesn't actually produce.

#### 2. Crash-risk fix (deviation, user-directed — not in the original contract)

**Files**: `src/lib/task-schema.ts`, `src/lib/task-schema.test.ts`

**Intent**: The documenting cases above proved `frequency_value: 100_000_000, frequency_unit: "day"` makes
`computeDueDate` silently return an `Invalid Date`, which then makes `TaskList.tsx:70`'s and
`task-dto.ts:11`'s unguarded `format(dueDate, "yyyy-MM-dd")` throw `RangeError: Invalid time value` — an
unhandled SSR crash reachable by any user submitting a large `frequency_value` (schema-permitted; no
`.max()` existed). Presented as a flagged risk per the original contract; the user chose to fix it now
instead of deferring.

**Contract**: Test-first (RED confirmed, then GREEN): added `.max(1000, "Frequency must be 1000 or less")` to
`frequency_value` in both `addTaskSchema` and `createTaskJsonSchema` (covers `updateTaskJsonSchema` via
`.partial()`). 1000 is comfortably below the ~100,000,000-day overflow threshold for every `frequency_unit`
(day/week/month/year), while remaining far larger than any realistic home-maintenance cadence. Chosen over
guarding the `format()` call sites directly because it stops the invalid value from ever being persisted,
fixing the root cause rather than patching each downstream symptom.

### Success Criteria

#### Automated Verification

- Unit tests pass: `npm run test`
- Type checking passes: `npm run check`
- Linting passes: `npm run lint`

#### Manual Verification

- Confirm the documented extreme-value behavior doesn't itself indicate an unhandled crash risk in a real
  code path (e.g. `task-dto.ts`'s `format(dueDate, "yyyy-MM-dd")` call on an `Invalid Date`); if it does,
  flag it as a new risk rather than silently shipping it.

______________________________________________________________________

## Phase 4: Cookbook update & close-out

### Overview

Fill in `test-plan.md` §6.5 and close out this change's tracking artifacts. The S-07 open-risk note already
exists in `plan-brief.md`'s Open Risks & Assumptions section (written during planning) — this phase reviews
it for clarity, it does not author it.

### Changes Required

#### 1. Cookbook

**File**: `context/foundation/test-plan.md`

**Intent**: Replace §6.5's `TBD` placeholder with the pattern this phase established, so future contributors
extending status/date logic tests follow the same conventions.

**Contract**: §6.5 describes: (a) the frequency × boundary `it.each` grid pattern with literal `Date`
fixtures, referencing `status.test.ts` as the example; (b) the `process.env.TZ` forcing pattern for
parsing-divergence regression tests, referencing `task-schema.test.ts:84-92` and the new `task-dto.test.ts`
case as examples.

#### 2. Close-out

**File**: `context/changes/status-date-regression-grid/change.md`

**Intent**: Reflect the change's completed state per this project's standard close-out convention.

**Contract**: `status: implemented`, `updated: <today>`.

### Success Criteria

#### Automated Verification

- `test-plan.md` §6.5 no longer contains the literal string `TBD`
- `change.md`'s `status` field reads `implemented`

#### Manual Verification

- The S-07 open-risk note (see this plan's brief) reads clearly to someone who wasn't part of this
  planning conversation.

______________________________________________________________________

## Testing Strategy

### Unit Tests

- Frequency × boundary grid (`status.test.ts`) — the phase's core deliverable.
- Parsing-divergence regression (`task-dto.test.ts`, TZ-forced) — closes the live bug.
- Extreme-value documenting cases (`status.test.ts`) — schema-permitted, previously untested edges.

### Integration Tests

- None — this logic is pure functions with no I/O; no integration tier applies (per test-plan.md §1 cost ×
  signal rule).

### Manual Testing Steps

1. Force a non-UTC system timezone and confirm the dashboard and tasks list agree on due date/status for a
   task near the local/UTC-midnight boundary.
1. Hand-verify a sample of grid rows against the literal FR-008/FR-009 table.
1. Review the extreme-value test output for any crash-risk implication in real consumer code.

## Performance Considerations

None — pure-function unit tests with no runtime or I/O impact; no production code path changes performance
characteristics.

## Migration Notes

None — no schema, data, or API contract changes. The two source edits in Phase 1 change only which `date-fns`
parser is called; no persisted data changes shape.

## References

- Related research: `context/changes/status-date-regression-grid/research.md`
- Oracle: `context/foundation/prd.md:110-119` (FR-008/FR-009)
- Canonical implementation: `src/lib/status.ts`
- Existing TZ-forcing pattern: `src/lib/task-schema.test.ts:83-108`
- Parsing pattern to replicate: `src/pages/dashboard.astro:1,24`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append `— <commit sha>` when a step lands. Do not rename step
> titles. See `references/progress-format.md`.

### Phase 1: Fix & regression-test the date-parsing divergence

#### Automated

- [x] 1.1 Unit tests pass: `npm run test` — 1d0830a
- [x] 1.2 Type checking passes: `npm run check` — 1d0830a
- [x] 1.3 Linting passes: `npm run lint` — 1d0830a

#### Manual

- [x] 1.4 N/A as written — verified inapplicable, not skipped: empirically confirmed (throwaway
  `wrangler dev --local` worker, `TZ=America/New_York` forced) that Cloudflare Workers' runtime clock is
  hardcoded to UTC (`Intl.DateTimeFormat().resolvedOptions().timeZone` → `"UTC"`, `getTimezoneOffset()` → `0`)
  regardless of host `TZ`, in local dev *and* any Cloudflare deployment (preview/prod) — there is no way to
  force a non-UTC runtime clock on this platform. Consequently `parseISO` and `new Date` on a bare date string
  always agreed in this app's actual runtime, before and after the Phase 1 fix; the divergence this plan fixes
  was only ever observable in Node/Vitest (which does honor `process.env.TZ`) — exactly where
  `task-dto.test.ts`'s new TZ-forced regression test catches it. The fix and its automated test remain correct
  and valuable (code consistency + real regression coverage in the test tier that can exercise it); this
  manual browser-comparison step just cannot demonstrate anything either way on this platform. — 1d0830a

### Phase 2: Frequency × boundary regression grid

#### Automated

- [x] 2.1 Unit tests pass: `npm run test` — 42e3b5d
- [x] 2.2 Type checking passes: `npm run check` — 42e3b5d
- [x] 2.3 Linting passes: `npm run lint` — 42e3b5d

#### Manual

- [x] 2.4 Hand-verified 3 sample grid rows against FR-008/FR-009 (`prd.md:110-119`): day/-1d→OVERDUE,
  month/0d→DUE_SOON, and the leap-year Jan31→Feb29 clamp row/+7d→DUE_SOON — all match the oracle. All 29
  `status.test.ts` assertions (16 grid rows + 1 leap-year-clamp row) passed on first run with no code change
  needed; `computeDueDate`/`computeStatus` already handled the combined frequency×boundary space correctly —
  this phase closes the "never tested together" gap with real coverage, not a bug fix. — 42e3b5d

### Phase 3: Extreme-value documenting cases

#### Automated

- [x] 3.1 Unit tests pass: `npm run test`
- [x] 3.2 Type checking passes: `npm run check`
- [x] 3.3 Linting passes: `npm run lint`

#### Manual

- [x] 3.4 Extreme-value output reviewed for crash-risk implications — **found a real one, and fixed it
  (user-directed deviation from "document only")**: with `frequency_value: 100_000_000, frequency_unit: "day"`
  (schema-permitted; `frequency_value` had no `.max()`), `computeDueDate` silently returns an `Invalid Date`
  (doesn't throw), but `src/components/tasks/TaskList.tsx:70` (`tasks/index.astro`'s render path) and
  `src/lib/task-dto.ts:11` (`/api/v1/tasks` JSON path) both call `format(dueDate, "yyyy-MM-dd")` unguarded on
  that value, which throws `RangeError: Invalid time value` — an unhandled SSR crash for any user with such a
  task. Pinned in `status.test.ts` (both the silent `Invalid Date` and the downstream `format()` throw), then
  closed test-first at the schema layer: `task-schema.ts`'s `frequency_value` now has `.max(1000, ...)` in
  both `addTaskSchema` and `createTaskJsonSchema`, so the overflowing value can never be persisted in the
  first place. See Phase 3's "Changes Required" §2 for the full contract. The very-old-`last_done_date` case
  does **not** crash — `computeDueDate`/`format` handle it fine, just produces an implausibly old due date —
  so no guard was added there, per the original contract.

### Phase 4: Cookbook update & close-out

#### Automated

- [ ] 4.1 `test-plan.md` §6.5 no longer contains `TBD`
- [ ] 4.2 `change.md` status reads `implemented`

#### Manual

- [ ] 4.3 S-07 open-risk note reviewed for clarity
