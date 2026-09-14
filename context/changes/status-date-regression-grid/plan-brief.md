# Status/Date Regression Grid — Plan Brief

> Full plan: `context/changes/status-date-regression-grid/plan.md`
> Research: `context/changes/status-date-regression-grid/research.md`

## What & Why

Close test-plan.md §3 Phase 3 (Risk #6): the currently-tested status boundary (exactly 7 days, exactly today)
could silently stop honoring FR-008/FR-009 after a future change to status/date logic, because today's tests
exercise the frequency-unit axis and the status-boundary axis separately, never combined. Along the way,
research surfaced a live, unrelated bug — a date-parsing divergence between pages — that this plan fixes too.

## Starting Point

`src/lib/status.ts` is the single, unduplicated implementation of due-date/status computation. Its test file
covers each frequency unit and each status boundary independently, but never combines them. Separately,
`dashboard.astro` parses `last_done_date` via `parseISO` (local midnight) while `task-dto.ts` and
`tasks/index.astro` use `new Date(string)` (UTC midnight) — at a timezone edge, the same task can show a
different status depending on which page renders it.

## Desired End State

Every frequency unit correctly crosses every FR-009 status boundary, proven by one parameterized test grid.
All three call sites parse `last_done_date` the same way, proven by a timezone-forced regression test. A
couple of schema-permitted extreme inputs have documented (not silently unguarded) behavior. The cookbook
section future contributors will read is filled in instead of `TBD`.

## Key Decisions Made

| Decision                          | Choice                                                                                                                             | Why (1 sentence)                                                                                                                                              | Source                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Parsing divergence handling       | Fix both call sites (`task-dto.ts`, `tasks/index.astro`) to match `dashboard.astro`'s `parseISO`, plus a TZ-forced regression test | The fix turned out to be 2 one-line edits reusing an already-established in-repo pattern — small enough that documenting-only would leave a cheap fix unfixed | Plan (user override of initial recommendation, after scope was sized) |
| Extreme-value coverage            | Add 1-2 documenting cases (no implementation change)                                                                               | Cheap given the grid infrastructure is already being built; closes a real schema-permitted gap research flagged                                               | Plan                                                                  |
| S-07 drift risk                   | Note it in this plan only, no `lessons.md` entry                                                                                   | Lowest overhead for a risk that's still hypothetical; S-07 hasn't started                                                                                     | Plan                                                                  |
| Structural/lint duplication guard | Out of scope for this phase                                                                                                        | `test-plan.md` already fixes Phase 3's test type as `unit`; a lint guard is Phase 4's scope (Risk #7)                                                         | Research + test-plan.md                                               |

## Scope

**In scope:**

- Frequency-unit × status-boundary regression grid in `status.test.ts`
- Fixing the `parseISO`/`new Date(string)` parsing divergence in `task-dto.ts` and `tasks/index.astro`
- A TZ-forced regression test proving the parsing fix
- Documenting (not fixing) extreme `frequency_value`/`last_done_date` inputs
- `test-plan.md` §6.5 cookbook update

**Out of scope:**

- A lint/structural guard against future logic duplication (Phase 4, Risk #7)
- Component/e2e tests verifying `dashboard.astro`/`tasks/index.astro`'s rendered output (Phase 2/Phase 5)
- A new shared `parseTaskDate()` helper module
- A new `lessons.md` entry for S-07

## Architecture / Approach

No architecture changes — this is pure-function unit testing plus two one-line source edits reusing an
already-established parsing pattern. Fix first (Phase 1), so the grid (Phase 2) is built against corrected
behavior rather than a value already known to diverge.

## Phases at a Glance

| Phase                                       | What it delivers                                                                              | Key risk                                                                             |
| ------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1. Fix & regression-test parsing divergence | `task-dto.ts`/`tasks/index.astro` match `dashboard.astro`'s parsing; TZ-forced test proves it | Astro-side effect isn't independently unit-testable — relies on manual verification  |
| 2. Frequency × boundary regression grid     | `it.each` grid proving all 4 units cross all 4 FR-009 boundaries                              | Mirror-implementation risk if fixtures reuse date-fns arithmetic instead of literals |
| 3. Extreme-value documenting cases          | 1-2 tests pinning current behavior at schema-permitted extremes                               | Picking values that don't actually exercise the interesting edge                     |
| 4. Cookbook update & close-out              | `test-plan.md` §6.5 filled in; change closed out                                              | None significant — documentation only                                                |

**Prerequisites:** None — `status.ts`/`task-dto.ts` already exist and are stable; no dependency on another
in-flight change.
**Estimated effort:** ~1 session across 4 phases.

## Open Risks & Assumptions

- **S-07 (`unified-visual-theme`, roadmap status `ready`)** is the nearest future work touching
  `dashboard.astro`/`tasks/index.astro` — a pure restyle per its own scope, but the most plausible vector for
  someone to accidentally touch the status/date frontmatter logic during that pass. Flagged here only; no
  `lessons.md` entry per the confirmed decision.
- Phase 1's fix to `tasks/index.astro` has no automated test of its own (no `.astro` unit-test tier exists in
  this repo) — verified only by code review, the `task-dto.test.ts` unit test on the equivalent logic, and
  manual verification.

## Success Criteria (Summary)

- All four frequency units correctly resolve to OVERDUE/DUE_SOON/OK at every FR-009 boundary, proven by test.
- The same task shows the same due date/status regardless of which page renders it, even at a timezone edge.
- `npm run test`, `npm run check`, and `npm run lint` all pass.
