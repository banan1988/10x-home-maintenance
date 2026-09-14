---
date: 2026-09-14T17:48:48+02:00
researcher: Claude (10x-research)
git_commit: b3ffa4e6f4c8f2e97ed7db032a13753f204360e7
branch: testing-status-date-regression-grid
repository: 10x-home-maintenance
topic: "Status/date logic regression grid (test-plan.md §3 Phase 3, Risk #6)"
tags: [research, codebase, status-ts, task-dto, date-logic, boundary-testing, test-plan-phase-3]
status: complete
last_updated: 2026-09-14
last_updated_by: Claude (10x-research)
---

# Research: Status/date logic regression grid

**Date**: 2026-09-14T17:48:48+02:00
**Researcher**: Claude (10x-research)
**Git Commit**: b3ffa4e6f4c8f2e97ed7db032a13753f204360e7
**Branch**: testing-status-date-regression-grid
**Repository**: 10x-home-maintenance

## Research Question

This change (`status-date-regression-grid`) resolves to `test-plan.md` §3 **Phase 3 — "Status/date logic regression grid"**: extend existing boundary tests to guard Risk #6 — *"The currently-tested status boundary (exactly 7 days, exactly today) silently stops honoring FR-008/FR-009 after a future change to status/date logic"* — including the scenario named in the Risk Response Guidance: a future change duplicating the logic (a near-miss that already happened once during S-01/S-02, see Historical Context).

The research question this document answers: **what is the current oracle (PRD contract) for the due-date and status calculation, what does the existing test suite already assert vs. leave open, and where are the real drift vectors (duplication, parsing inconsistency, upcoming roadmap work) this phase's tests must guard against?**

## Summary

- The oracle is fully specified and unambiguous: PRD FR-008/FR-009 (`context/foundation/prd.md:110-119`) fixes the frequency model (`frequency_value` + `frequency_unit` ∈ `day|week|month|year`) and the exact boundary rule — `next_due_date < today` → OVERDUE, `today ≤ next_due_date ≤ today+7` → DUE SOON, `next_due_date > today+7` → OK.
- There is exactly **one** implementation of this logic in the repo — `src/lib/status.ts` (`computeDueDate`, `computeStatus`, `compareByUrgency`, `DUE_SOON_THRESHOLD_DAYS = 7`) — created in a single commit (`41edf84`, S-01) and never modified since. Every consumer (`dashboard.astro`, `tasks/index.astro`, `task-dto.ts` → both `/api/v1/tasks` routes) imports it; nothing reimplements the arithmetic. No duplication exists **today**.
- That single-source discipline is currently held by convention, not by any test or lint guard — and it already had a documented near-miss: S-01 and S-02 were built in parallel and both needed `status.ts`; only an explicit plan-level "check-before-create, identical pinned contract" decision (captured as a standing lesson) prevented a duplicate implementation. This is precisely the drift scenario Risk #6 is worried about, and it was avoided by process, not by anything Phase 3 can currently detect automatically.
- The existing `status.test.ts` boundary coverage is real but narrow: it tests `-1`, `0`, `+7`, `+8` days against **one arbitrary frequency/date combination**, not against the full grid test-plan.md's Phase 3 goal names ("each frequency unit"). `computeDueDate` is tested per-unit (day/week/month/year) but never composed with a boundary-crossing `computeStatus` check — e.g. "a `month`-frequency task due exactly 7 days out is DUE_SOON."
- A genuine, previously unflagged bug-adjacent inconsistency exists in date **parsing**, not in the threshold logic: `dashboard.astro:24` parses `last_done_date` via `parseISO` (local midnight) while `tasks/index.astro:20` and `task-dto.ts:7` use `new Date(string)` (UTC midnight for a bare `YYYY-MM-DD`). At a timezone edge, the same task can resolve to a different due date — and therefore a different status — depending on which page/route renders it. This is a live drift-in-progress, not a hypothetical, and squarely inside the phase's stated goal ("guard against duplication/drift of the logic across parallel changes").
- Roadmap item **S-07 (`unified-visual-theme`, status `ready`)** is the nearest future work touching the two `.astro` files that host status/date call sites — a pure restyle per its own scope, but the most plausible vector for someone to accidentally touch the frontmatter logic during that pass.
- `computeDueDate` has no internal guard against `frequency_value ≤ 0` (relies entirely on zod schema validation upstream) and no guard against `Date` overflow from a very old `last_done_date` combined with a large `frequency_value` — both schema-permitted, neither currently tested at the `status.ts` boundary.

## Detailed Findings

### Oracle (PRD contract) — `context/foundation/prd.md:110-119`

- FR-008: `next_due_date` is always calculated from the task's *current* `frequency_value`/`frequency_unit` and `last_done_date`. Changing frequency does not modify `last_done_date` or reset the cycle. Frequency model: `frequency_value` (integer) + `frequency_unit` ∈ `{day, week, month, year}`.
- FR-009: fixed 7-day threshold, explicit rule: `next_due_date < today` → OVERDUE; `today ≤ next_due_date ≤ today + 7 days` → DUE SOON; `next_due_date > today + 7 days` → OK.
- This is the literal boundary table a regression-grid test must assert against — not the current output of `computeStatus`/`computeDueDate` (see Anti-pattern note below).

### Canonical implementation — `src/lib/status.ts`

- `DUE_SOON_THRESHOLD_DAYS = 7` (`status.ts:5`) — the sole boundary constant.
- `computeDueDate(lastDoneDate: Date, frequencyValue: number, frequencyUnit: MaintenanceFrequencyUnit): Date` (`status.ts:10-29`) — `switch` over `frequencyUnit` calling date-fns `addDays`/`addWeeks`/`addMonths`/`addYears`; `default` branch is an exhaustiveness guard (`const _exhaustive: never = frequencyUnit`) that throws `"Unhandled frequency unit: ..."`.
- `computeStatus(dueDate: Date, today: Date): TaskStatus` (`status.ts:31-36`) — `daysUntilDue = differenceInCalendarDays(dueDate, today)`; `< 0` → `"OVERDUE"`, `<= DUE_SOON_THRESHOLD_DAYS` → `"DUE_SOON"`, else `"OK"`. `differenceInCalendarDays` is a **local-calendar-day** diff (timezone-sensitive on both inputs), not a raw millisecond division.
- `compareByUrgency(a, b)` (`status.ts:38-40`) — sorts by `STATUS_RANK` (OVERDUE → DUE_SOON → OK) then `IMPORTANCE_RANK` (HIGH → MEDIUM → LOW), matching FR-010's dashboard sort order.

### Consumers — single source of truth, confirmed no duplication

| Call site                                 | What it does                                                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `src/lib/task-dto.ts:3,7,12`              | `toTaskDto()`: `computeDueDate(new Date(task.last_done_date), ...)` then `computeStatus(dueDate, new Date())` |
| `src/pages/api/v1/tasks/index.ts:7,27,62` | Calls `toTaskDto` for list/create                                                                             |
| `src/pages/api/v1/tasks/[id].ts:7,32,73`  | Calls `toTaskDto` for GET/PATCH                                                                               |
| `src/pages/dashboard.astro:6,24-27`       | `computeDueDate(parseISO(task.last_done_date), ...)` then `computeStatus`, sorted via `compareByUrgency`      |
| `src/pages/tasks/index.astro:5,20-23`     | `computeDueDate(new Date(task.last_done_date), ...)` then `computeStatus`, sorted via `compareByUrgency`      |
| `src/components/tasks/TaskList.tsx:69-70` | Pure display — renders `task.status`/`task.dueDate`, no date math                                             |

Legacy form routes (`src/pages/api/tasks/*`) don't touch status/due-date logic at all — they redirect to the pages above, which compute status on render.

A repo-wide grep for the literal `7` in non-test source returns exactly one hit (`status.ts:5`); no second `switch`/`if`-chain over `"OK"|"DUE_SOON"|"OVERDUE"` exists anywhere. **Single source of truth is real today**, but enforced by convention only — no lint rule or test currently fails if a future commit reimplements it inline.

### The parsing inconsistency (real drift, not hypothetical)

`last_done_date` is a bare `YYYY-MM-DD` string. Three call sites parse it two different ways before handing it to `computeDueDate`:

- `dashboard.astro:24` → `parseISO(task.last_done_date)` — local midnight.
- `tasks/index.astro:20` and `task-dto.ts:7` → `new Date(task.last_done_date)` — per ECMAScript's date-only grammar, **UTC midnight**.

For a runtime whose local timezone is behind UTC (most of the Americas), `new Date("2026-01-01")` resolves to `2025-12-31` local — a full calendar day earlier than what `parseISO` produces on the identical input. Since `computeStatus` diffs in **local calendar days**, this can flip the same task across the OVERDUE/DUE_SOON or DUE_SOON/OK boundary depending only on which page rendered it (dashboard vs. tasks list vs. API DTO). This is exactly the kind of independent-call-site divergence Risk #6 frames as "drift across parallel changes" — it already exists, just hasn't crossed a boundary observably yet. `task-schema.ts` is aware of timezone skew for input validation (the documented 1-day grace window, `lessons.md:51-66`) but that awareness didn't propagate to the three `computeDueDate` call sites.

### Existing test coverage — `src/lib/status.test.ts`

- `computeDueDate`: per-unit literal assertions for `day`(+5), `week`(+2), `month`(+3), `year`(+1), plus one end-of-month clamp case (Jan 31 + 1 month → Feb 28) and the exhaustiveness-throw case (cast to `"decade"`). All oracle-correct (literal expected `Date`s, not recomputed via the function under test).
- `computeStatus`: fixed `today`, tests `-1` (OVERDUE), `0`/exactly-today (DUE_SOON), `+7` (DUE_SOON), `+8` (OK). The **due-date inputs** for these cases are generated via `addDays(today, N)` (date-fns) — the same library `computeDueDate` uses internally — rather than hand-picked literal `Date`s. This weakens independence: a subtle date-fns/timezone bug in `addDays` itself wouldn't be caught, since both the input construction and the production code share the primitive. The **expected status strings** are literal, so the enum-level oracle is sound; only the boundary-date construction is a partial mirror.
- `compareByUrgency`: literal expected-order arrays — oracle-correct.
- **Gap named explicitly by test-plan.md's Phase 3 goal, confirmed present**: no test crosses the frequency-unit axis with the status-boundary axis — e.g. no case asserts a `month`- or `year`-frequency task landing exactly on day 7 still resolves to DUE_SOON. Today's coverage tests each axis independently, never combined into a grid.
- No test exercises `frequency_value` extremes (very large integer — schema allows unbounded) or `last_done_date` extremes (very old date — schema allows unbounded lower end) combined with a large frequency, which could drive `addYears`/`addMonths` into `Invalid Date` territory.
- `task-schema.test.ts:83-108` covers timezone handling for `last_done_date` **parsing/validation** (forces `TZ=America/New_York`, asserts round-trip), but only for the schema's own `parseISO` call — not for the three divergent `computeDueDate` call sites above.

### `frequency_value`/`frequency_unit` schema constraints (`src/lib/task-schema.ts`)

- `frequency_value`: `z.coerce.number().int().positive()` (form path) / `z.number().int().positive()` (JSON API path, no coercion) — guarantees `computeDueDate` is only invoked with a positive integer through the validated write path. **No upper bound.** `computeDueDate` itself has no internal guard (it's also called on already-persisted rows in `task-dto.ts` without re-validation).
- `frequency_unit`: `z.enum(Constants.public.Enums.maintenance_frequency_unit)` — matches the four `computeDueDate` switch cases exactly; the `never`-exhaustiveness branch is unreachable through the validated path (only reachable via a type cast, as `status.test.ts` does deliberately).
- `last_done_date`: constrained to `≤ today + 1 day` (future-dating guard), **no lower bound** — arbitrarily old dates are valid.

### Historical context — this exact risk already had a near-miss

- `context/changes/first-task-on-dashboard/plan.md:136-137,155,164-165,181,189` — defines the contract still live today (`computeDueDate`/`computeStatus`/`DUE_SOON_THRESHOLD_DAYS`/`TaskStatus`), built for S-01.
- `context/changes/manage-maintenance-tasks/plan.md:16-24,27` (verbatim) — S-02's plan explicitly notes S-01 and S-02 are parallel and *"this plan cannot assume S-01 lands first, and must not silently duplicate or collide with modules S-01's own plan already specifies with an identical contract"* — pinning the exact `status.ts` contract to reuse-or-create-verbatim depending on landing order.
- This produced the standing lesson `context/foundation/lessons.md:33-49` ("Parallel slices sharing a foundation must pin shared-file contracts as check-before-create") — directly documenting this near-miss and mandating the process fix for future parallel roadmap pairs. **It was avoided by planning discipline, not by any test** — which is exactly the gap Phase 3 exists to close structurally.
- `context/changes/maintenance-tasks-api/research.md:149-150,238` confirms S-03 reused the same module (no duplication).
- `context/changes/maintenance-task-data-model/plan.md:36-40,62` — F-01 (schema) deliberately excludes `next_due_date`/`status` as DB columns; computation is entirely deferred to consumers — reinforcing why this logic is cross-slice rather than owned by one.
- `context/changes/first-task-on-dashboard/reviews/impl-review.md:105-112` (finding F7) — the only prior impl-review finding on this module: missing test for the exhaustiveness-throw branch, since fixed (now in `status.test.ts`).
- `context/foundation/roadmap.md:121-210` — F-01 unlocks S-01/S-02/S-03, none of which exclusively owns status/date logic; S-04 (landing page) is unrelated; **S-07 (`unified-visual-theme`, status `ready`)** is the nearest future work touching `dashboard.astro`/`tasks/index.astro` — scoped as CSS/Tailwind-token restyle only, no stated intent to touch the frontmatter script logic, but the most plausible accidental-drift vector given it edits the same files.
- `context/foundation/test-plan.md:176-179` — cookbook §6.5 is a literal `TBD` placeholder; this phase is what fills it in.
- No other `lessons.md` entry is status/date-logic-specific beyond the two already known (parallel-slice contract pinning; timezone grace window for date-only string validation, `lessons.md:51-66`).

## Code References

- `src/lib/status.ts:5` - `DUE_SOON_THRESHOLD_DAYS = 7`, the sole boundary constant
- `src/lib/status.ts:10-29` - `computeDueDate` (per-unit date-fns branching, exhaustiveness throw)
- `src/lib/status.ts:31-36` - `computeStatus` (`differenceInCalendarDays` against the FR-009 boundary)
- `src/lib/status.ts:38-40` - `compareByUrgency` (FR-010 sort order)
- `src/lib/status.test.ts:11-53` - existing boundary cases (`-1`, `0`, `+7`, `+8` days; per-unit `computeDueDate` cases)
- `src/lib/task-dto.ts:3,7,12` - `toTaskDto`, uses `new Date(task.last_done_date)`
- `src/pages/dashboard.astro:6,24-27` - uses `parseISO(task.last_done_date)` — parsing divergence point 1
- `src/pages/tasks/index.astro:5,20-23` - uses `new Date(task.last_done_date)` — parsing divergence point 2
- `src/lib/task-schema.ts:15-20,36-39` - `parseISO` + 1-day future grace window for `last_done_date` input validation (schema side only)
- `context/foundation/prd.md:110-119` - FR-008/FR-009, the literal oracle
- `context/foundation/test-plan.md:88,176-179` - Phase 3 row and cookbook §6.5 placeholder
- `context/foundation/lessons.md:33-49` - parallel-slice contract-pinning lesson (the historical near-miss)
- `context/foundation/roadmap.md:121-210` - F-01/S-01–S-04/S-07 scope descriptions

## Architecture Insights

- **Status/date computation is deliberately kept out of the database** (F-01 plan) and lives entirely in one pure-function module (`status.ts`), computed fresh on every read by every consumer. This is a sound design for testability (pure functions, no I/O) but means every consumer must independently parse `last_done_date` into a `Date` before calling in — which is exactly where the drift crept in.
- The project's established anti-pattern to avoid here (per CLAUDE.md's Oracle rules and vibe-testing table) is **mirror implementation**: `computeStatus`'s existing tests construct boundary dates via `addDays` (a date-fns primitive shared with the code under test) rather than fully independent literals. The regression grid should prefer literal `Date` construction (e.g. `new Date(2026, 5, 22)`) for boundary inputs, reserving `addDays`-style construction only where a literal would be needlessly verbose and the risk of shared-primitive masking is low.
- The "regression grid" framing in the phase name maps directly onto the two orthogonal axes the current suite tests separately but never combines: **frequency unit** (day/week/month/year) × **boundary offset** (−1, 0, +7, +8 days, plus month/year-length edge cases like the existing Jan-31 clamp). A parameterized (`it.each`) grid is the natural fit and avoids CLAUDE.md's "redundant copies" anti-pattern better than six near-identical `it` blocks.
- The parsing inconsistency is architecturally a **missing shared helper**: nothing in `status.ts` or a sibling module owns "parse this app's date-only string into a `Date`" — each of the three consumers independently chose `parseISO` or `new Date`. A regression-grid test can pin the *current* behavior of each call site (documenting the drift) even before/independent of deciding whether to fix it — that fix decision belongs to planning, not research, per this project's Oracle rules (a bug shouldn't be silently normalized into the "expected" test value without flagging it, which this document does).

## Historical Context (from prior changes)

- `context/changes/first-task-on-dashboard/plan.md` and `context/changes/first-task-on-dashboard/reviews/impl-review.md` — origin of `status.ts` and its one prior test gap (finding F7, fixed).
- `context/changes/manage-maintenance-tasks/plan.md:16-27` — the explicit parallel-slice near-miss this phase exists to structurally guard against.
- `context/changes/maintenance-tasks-api/research.md:149-150,238` — confirms S-03's reuse, no duplication introduced.
- `context/changes/maintenance-task-data-model/plan.md:36-40,62` — F-01's decision to exclude computed columns from the schema, explaining why this logic is cross-slice.

## Related Research

None yet under `context/changes/**/research.md` specifically targets `status.ts`'s test boundaries beyond what's cited above from sibling change folders' plans/reviews (not dedicated research documents — those slices predate this project's `/10x-research` step being run for every phase).

## Open Questions

1. **Should the regression grid also pin/fix the `parseISO` vs. `new Date(string)` parsing inconsistency, or only document it as a known-current-behavior boundary case?** This is a planning decision (test-plan.md §1 rule 3 says research delivers "what's broken," not the fix) — flagging for `/10x-plan` to decide the scope: test-only (pin current behavior per call site) vs. test+fix (introduce one shared parse helper and test that).
1. **Should this phase add a structural/lint guard** (e.g. a rule banning `"OVERDUE"|"DUE_SOON"|"OK"` string literals or `differenceInCalendarDays`/`addYears` usage outside `status.ts` and its tests) to make the "single source of truth" property enforced rather than conventional — given the documented near-miss and Risk #6's explicit "duplication" wording? This determines whether Phase 3's "unit" test type in test-plan.md §3 needs to expand to include a lint/static-check component (which would also overlap with Phase 4's static-check scope for Risk #7 — worth deciding the boundary between the two phases).
1. **Should very-large `frequency_value` / very-old `last_done_date` combinations (schema-permitted, `computeDueDate`-unguarded) be added to the grid**, given they could produce `Invalid Date` with no current test coverage — low likelihood in practice, but schema-permitted and unguarded.
1. Should S-07 (`unified-visual-theme`) be flagged now (e.g. a lessons.md entry or a note in its own eventual plan) to watch for accidental status/date-logic drift while touching `dashboard.astro`/`tasks/index.astro` for restyling — or is that better left to that change's own review?
