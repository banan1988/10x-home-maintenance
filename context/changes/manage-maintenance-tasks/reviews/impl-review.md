<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: User views, edits, and deletes their maintenance tasks

- **Plan**: `context/changes/manage-maintenance-tasks/plan.md`
- **Scope**: Full plan (Phases 1–5)
- **Date**: 2026-09-08
- **Verdict**: REJECTED (pre-triage) → **APPROVED** (post-triage — F1 and F2 fixed, F3 skipped as intentional)
- **Findings**: 1 critical, 1 warning, 1 observation — 2 FIXED, 1 SKIPPED

## Verdicts

| Dimension           | Verdict (pre-triage) | Verdict (post-triage) |
| ------------------- | -------------------- | --------------------- |
| Plan Adherence      | WARNING              | PASS                  |
| Scope Discipline    | PASS                 | PASS                  |
| Safety & Quality    | FAIL                 | PASS                  |
| Architecture        | PASS                 | PASS                  |
| Pattern Consistency | WARNING              | PASS                  |
| Success Criteria    | WARNING              | PASS                  |

## Automated Verification (re-run, all phases)

- `npm run test` — 7 files, 33 tests, all passed.
- `npm run lint` — 0 errors (only pre-existing `astro-eslint-parser`/`tseslint.config` deprecation notices).
- `npx astro check` — 0 errors, 0 warnings, 5 hints.
- `npm run build` — completed successfully (only pre-existing third-party `zod`/Rollup comment warnings, unrelated to this change).

## Findings

### F1 — `last_done_date` validation uses UTC-anchored parsing, rejecting valid "today" values for users ahead of UTC

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; a proven fix already exists in this exact repo
- **Dimension**: Safety & Quality (Reliability/Correctness) — also touches Pattern Consistency
- **Location**: `src/lib/task-schema.ts:11`

**Detail**: `last_done_date: z.coerce.date().refine((date) => date <= new Date(), ...)`. `z.coerce.date()` on a
bare `yyyy-MM-dd` string calls the native `Date` constructor, which parses date-only ISO strings as **UTC
midnight**, not local midnight. The refine then compares that UTC instant against the server's real UTC "now."
For any user whose local calendar day is already ahead of UTC's current calendar day (most of Asia, Australia,
and parts of Europe/Africa, for several hours every day), picking "today" in the date picker produces an instant
*later* than the server's current UTC instant — the refine fails and rejects a perfectly valid submission as "in
the future."

This is not speculative: it is the exact bug already found and fixed in this same repository, on the sibling
branch `feature/first-task-on-dashboard`, commit `a77a06b` ("parse `last_done_date` as local calendar day, not
UTC"), which replaces the schema with:

```ts
last_done_date: z
  .string()
  .transform((value) => parseISO(value))
  .refine((date) => !isNaN(date.getTime()), "Invalid date")
  .refine((date) => date <= new Date(), "Last done date cannot be in the future"),
```

Timing context: this branch's `task-schema.ts` was created at commit `c390e9c` (2026-09-06 21:15), about 9 hours
*before* the sibling branch's fix landed (`a77a06b`, 2026-09-07 06:29) — so the bug wasn't yet discovered when
this plan's Phase 1 ran the "check-before-create, else create fresh" step. That explains why it happened, but the
bug is live in this branch's current code regardless of when it was discovered, and it's exactly the class of
divergence `lessons.md`'s "Parallel slices sharing a foundation must pin shared-file contracts as
check-before-create" rule exists to prevent. `src/lib/task-schema.test.ts`'s existing "future date" test doesn't
catch this because it builds a full ISO timestamp via `.toISOString()` (an unambiguous absolute instant), which
sidesteps the exact date-only ambiguity that triggers the bug.

**Fix**: Re-apply the sibling branch's fix verbatim — replace `z.coerce.date()` with
`z.string().transform((value) => parseISO(value)).refine((date) => !isNaN(date.getTime()), "Invalid date")` before
the existing future-date refine, importing `parseISO` from `date-fns`. Add a regression test that submits a bare
`yyyy-MM-dd` string representing "today" while faking the system clock to an instant that is UTC-behind-local, to
actually exercise the ambiguity (the current test suite's future-date case wouldn't catch a regression here).

- Strength: Identical bug, identical fix already implemented and dated one day later in the same repo — zero
  design risk, one file, ~5 lines.

- Tradeoff: None significant — purely additive parsing correctness fix.

- Confidence: HIGH — same root cause, same schema shape, fix already exists to copy from.

- Blind spot: Haven't confirmed whether `feature/first-task-on-dashboard` will merge before or after this
  branch; if it merges first, this fix arrives via merge conflict resolution instead and this finding becomes
  moot — worth checking merge order before applying by hand.

- **Decision**: FIXED — applied the `parseISO`-based fix to `src/lib/task-schema.ts:11`; fixed the pre-existing
  `task-schema.test.ts` assertion that hardcoded a UTC-instant expectation (confirmed it broke under this repo's
  real local TZ, proving the bug was live, not theoretical); ported the sibling branch's timezone round-trip
  regression test verbatim. Full suite re-run: 34/34 tests pass, 0 lint errors, 0 type errors.

### F2 — Phase 3 manual-verification checkbox marked done, but the dialog does not actually reopen on a validation error

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence / Success Criteria
- **Location**: `src/pages/api/tasks/[id].ts:35`, `src/components/tasks/TaskList.tsx`, `plan.md:366` (Phase 3
  Manual Verification), `plan.md:595` (Progress item 3.8, checked `[x]` at commit `5748fd7`)

**Detail**: The plan's Desired End State and Phase 3 Manual Verification both state: *"Submit a blank name and a
future `last_done_date`; confirm the redirect reopens the dialog with the error."* The actual failure path
redirects to `/tasks?error=<message>` with **no task id** in the URL, and `TaskList.tsx` has no code path that
derives `editingTaskId` from the `error` query param — confirmed by reading the full component (state is only
ever set via the row "Edit" button's `onClick`). On a validation failure, the dialog closes (full-page redirect)
and the user sees only a generic inline red banner at the top of `/tasks`; it does not reopen prefilled with the
error. Progress item 3.9 (cross-user "Task not found") behaves correctly this same way, which is fine — but 3.8
specifically promised dialog-reopen behavior that isn't present, and the checkbox is nonetheless marked complete.

**Fix A ⭐ Recommended**: Implement the originally-planned behavior — carry the task id through the error
redirect (e.g. `/tasks?error=<msg>&editing=<id>`) and have `TaskList.tsx` read the `editing` query param on mount
to set `editingTaskId`, reopening `EditTaskDialog` with the same task prefilled.

- Strength: Matches the plan's explicit, specific manual-verification criterion and the better UX (user doesn't
  lose their edit context on a typo).
- Tradeoff: One more query param to manage and strip alongside `success`/`error` in the existing
  `history.replaceState` cleanup.
- Confidence: MED — straightforward given the existing query-param-driven toast pattern, but untested against
  the "blank name" case specifically (does the dialog need to also restore the user's just-typed invalid values,
  or just reopen prefilled from the original task data — likely the latter, matching a fresh edit attempt).
- Blind spot: Haven't verified whether losing the user's in-progress (invalid) field edits on reopen is
  acceptable UX, or whether that itself needs preserving.

**Fix B**: Keep the current behavior (inline banner only, dialog stays closed) and correct the plan text and
Progress item 3.8's wording to describe what was actually built and verified, rather than building new
functionality to match stale prose.

- Strength: Zero new code, zero regression risk, ships as-is; the generic banner already surfaces the error
  clearly enough for a low-frequency validation-failure path.

- Tradeoff: User must manually reopen the dialog and re-enter all fields after a typo — worse UX than originally
  designed, and a real (if narrow) design regression from the plan's stated intent.

- Confidence: HIGH — trivial, no behavior change, matches what's already shipped and covered by tests.

- Blind spot: None significant.

- **Decision**: FIXED via Fix A — `src/pages/api/tasks/[id].ts` now appends `&editing=${id}` to the validation-failure
  redirect; `src/pages/tasks/index.astro` reads the `editing` query param and passes it to `TaskList`;
  `TaskList.tsx` initializes `editingTaskId` from it and strips it from the URL alongside `success`/`error`. Plan
  Progress item 3.8 annotated. Full suite re-run: 34/34 tests, 0 lint errors, 0 type errors, build succeeds.

- **Decision**: PENDING

### F3 — No task-creation UI exists on this branch

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; this is expected per the plan's own scope boundary
- **Dimension**: Scope Discipline (informational only — the boundary itself is correctly respected)
- **Location**: N/A (absence, not a file)

**Detail**: `/tasks` (this change) can list, edit, delete, and mark-complete tasks, but there is no reachable UI
to create one — `AddTaskDialog.tsx` and `POST /api/tasks` exist only on the sibling `feature/first-task-on-dashboard`
branch, confirmed not to be an ancestor of this branch. This is exactly what the plan's "What We're NOT Doing"
section calls for (add-task flow is explicitly S-01's scope), so it is not a plan-adherence problem. Flagging only
as a merge-order reminder: if this branch ships to production standalone before S-01 merges, `/tasks` would be
reachable with genuinely zero way to populate it end-to-end for a new user.

**Fix**: No code change — confirm with the user/roadmap that both slices merge together (or S-01 first) before
this change goes live standalone.

- **Decision**: SKIPPED — user confirmed S-01 (`feature/first-task-on-dashboard`) provides the create-task flow;
  merge-order coordination is a separate, already-understood concern, not a defect in this change.
