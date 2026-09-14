# Toast Next-Due Message + Mark-Done Confirmation Guardrail Implementation Plan

## Overview

This plan covers two related pieces of work under the `toast-next-due-message` change:

1. **Retroactive documentation** of the next-due toast message and toast repositioning, which were already
   implemented directly in the working tree before this plan was written (see `research.md`).
1. **New scope**, decided during planning: a confirmation guardrail for "Mark done" on tasks that aren't due
   yet, plus a one-off read-only audit for legacy `frequency_value` rows. Two other candidate workstreams
   surfaced in `research.md`'s Open Questions — a `complete.ts` timezone grace window, and a completion
   history/audit trail — were explicitly deferred (see "What We're NOT Doing").

## Current State Analysis

- "Mark done" (`src/components/tasks/TaskList.tsx:107-111`) is a plain `<form method="POST">` posted to
  `POST /api/tasks/[id]/complete`, rendered unconditionally for every task row regardless of `task.status`.
- The route (`src/pages/api/tasks/[id]/complete.ts`) sets `last_done_date` to the server's current date and
  redirects to `/tasks?success=task-completed&next=${frequency_value}&unit=${frequency_unit}`.
- `TaskList.tsx`'s `resolveSuccessMessage` (lines 26-33) turns those `next`/`unit` params into a message like
  "Task completed — see you in 2 weeks" via `src/lib/format-completion-message.ts`'s `formatCompletionMessage`
  and `isFrequencyUnit`.
- The toast itself now renders `position="top-right"` `offset={{ top: 64 }}` (`src/layouts/Layout.astro:46`),
  clearing the app header instead of Sonner's default `bottom-right`.
- All of the above is implemented, unit-tested (`complete.test.ts`, `format-completion-message.test.ts`), and
  passing (143/143 suite-wide at last check) — but not yet manually verified in a browser, and not yet
  committed to git.
- There is **no confirmation step of any kind** on "Mark done" today, for any task status. This was a
  deliberate original design choice (`context/changes/manage-maintenance-tasks/plan.md:74`: the one-click
  design "trades away a confirm [step]") — this plan's Phase 2 is a conscious, scoped reversal of that
  decision for one specific case (tasks not yet due), not a full rollback of it.
- Two existing dialogs already establish the pattern this plan will follow:
  - `src/components/tasks/DeleteTaskAlertDialog.tsx` (41 lines): props `{ task, onOpenChange: () => void }`,
    early-returns `null` when `task` is `null`, renders `<AlertDialog open onOpenChange={onOpenChange}>`, and
    its confirm action is a **second, small `<form method="POST" action={...}>` + `<Button type="submit">`**
    (lines 32-36) — not `AlertDialogAction`, because `AlertDialogAction` only closes the dialog rather than
    submitting a form to a different route.
  - `src/components/tasks/EditTaskDialog.tsx` already has precedent for "the form stays a real
    `<form method="POST">`; a JS `onSubmit` handler conditionally calls `event.preventDefault()`" (lines 44-65,
    73\) — there, gating on client-side Zod validation failure; this plan reuses the same shape, gating on
    `task.status`.
  - Neither dialog has any test coverage, and this repo has no `@testing-library/react`/jsdom — no React
    component in this codebase is unit-tested; only `src/lib/**` (pure logic) and `src/pages/api/**` (route
    handlers) are.
- `supabase/migrations/20260914200000_cap_maintenance_tasks_frequency_value.sql` added
  `check (frequency_value <= 1000)` for future writes, but nothing has verified whether any pre-existing row
  already violates it.

## Desired End State

- The next-due toast and top-right positioning are committed, manually verified in a browser, and their
  Progress checkboxes reflect actual verification state (not just "code exists").
- Clicking "Mark done" on a task whose status is `DUE_SOON` or `OVERDUE` behaves exactly as it does today —
  immediate native form submit, zero added JS, zero visual change.
- Clicking "Mark done" on a task whose status is `OK` opens a confirmation dialog stating the task isn't due
  yet (showing its current due date); "Cancel" closes with no effect, "Confirm"/"Mark done" completes it via
  the same `POST /api/tasks/[id]/complete` endpoint, unchanged.
- A documented, exact SQL query exists for auditing `maintenance_tasks` rows with `frequency_value > 1000`,
  run manually once per environment, with no automatic data mutation.
- Verification: `npm run test`, `npm run lint`, `npx tsc --noEmit` all pass; manual click-through of both the
  fast path (DUE_SOON/OVERDUE) and the confirm path (OK) in a browser; the audit query has been run at least
  once against the local/dev database with its result recorded.

### Key Discoveries

- `EditTaskDialog.tsx:44-65,73` already proves the "real form + conditional `preventDefault`" pattern works in
  this codebase — no new architectural idiom is being introduced.
- `DeleteTaskAlertDialog.tsx:32-36` proves the "duplicate small confirm-form inside the dialog" pattern is
  preferred over `AlertDialogAction` or reusing a `ref` to the original form — this plan follows the same
  choice for the same reason (avoids form-ref lifecycle complexity across a `.map()`).
- No React component in this repo has test coverage; the only testable unit from Phase 2 is the new pure
  status predicate.

## What We're NOT Doing

- **Not** adding a `complete.ts` timezone grace window (mirroring `task-schema.ts`'s `+1 day` future-date
  check). Decided during planning: the server-UTC "today" write stays as-is; the skew edge case (a user just
  past their local midnight, ahead of UTC) is documented here as an accepted limitation, not fixed.
- **Not** building a completion history / audit trail (a table recording every "mark done" event, or an undo
  action). This is real new-feature scope — it has no existing precedent in this app (no history
  mechanism exists anywhere) and deserves its own `/10x-new` change if pursued.
- **Not** clamping or otherwise mutating any legacy row found by the Phase 3 audit query. The audit is
  strictly read-only; any row it surfaces is triaged manually, not auto-corrected.
- **Not** adding a second "how far in the future" threshold to distinguish "OK, due soon-ish" from "OK, due in
  years." One flat trigger (`status === "OK"`) is used, matching the granularity `computeStatus` already
  exposes — no new threshold constant.
- **Not** disabling or hiding the "Mark done" button for `OK` tasks. The action stays available; it only gains
  a confirmation step (warn-then-allow), preserving the legitimate "I did this early" use case.
- **Not** committing the Phase 3 audit as a `supabase/migrations/*.sql` file. Migrations in this repo are for
  schema changes; a one-off data audit is documented as a manual step instead.

## Critical Implementation Details

**Ordering constraint on the "Mark done" form's `onSubmit`**: the handler must be attached directly to the
existing `<form>` at `TaskList.tsx:107-111` and must call `event.preventDefault()` **only** when
`shouldConfirmCompletion(task.status)` is `true`; when `false`, the handler must return without calling
`preventDefault()` so the native submit proceeds exactly as it does today. Do not convert the "Mark done"
button to `type="button"` + `onClick` (the pattern Delete/Edit use for *opening* their dialogs) — that would
force every click through React state and a re-render before submission, adding latency/complexity to the
`DUE_SOON`/`OVERDUE` fast path that today has none. The form must stay submit-driven for the no-confirmation
case.

## Phase 1: Toast next-due message + top-right positioning (retroactive)

### Overview

Documents and closes out work already present in the working tree: the completion toast now shows the task's
configured interval instead of a generic message, and the toast is repositioned to clear the header.

### Changes Required

#### 1. Next-due-aware toast message

**Files**: `src/lib/format-completion-message.ts`, `src/lib/format-completion-message.test.ts`,
`src/pages/api/tasks/[id]/complete.ts`, `src/pages/api/tasks/[id]/complete.test.ts`,
`src/components/tasks/TaskList.tsx`, `src/pages/tasks/index.astro`

**Intent**: Already implemented — `complete.ts` forwards the completed task's own `frequency_value`/
`frequency_unit` as `next`/`unit` redirect query params; `TaskList.tsx`'s `resolveSuccessMessage` formats them
into a message like "Task completed — see you in 2 weeks" via `formatCompletionMessage`/`isFrequencyUnit`,
falling back to the generic message when the params are missing or invalid.

**Contract**: No further code change in this phase — this entry exists to record the change in the plan and
tie it to Success Criteria below.

#### 2. Toast repositioning

**File**: `src/layouts/Layout.astro`

**Intent**: Already implemented — the `<Toaster>` moved from Sonner's default `bottom-right` to
`position="top-right"` with `offset={{ top: 64 }}`, so it clears the app header instead of overlapping it.

**Contract**: No further code change in this phase.

### Success Criteria

#### Automated Verification

- [x] Full suite passes: `npm run test`
- [x] Lint passes: `npm run lint`
- [x] Type checking passes: `npx tsc --noEmit`

#### Manual Verification

- [ ] Start the dev server (`npm run dev`), sign in, go to `/tasks`, click "Mark done" on a task with a
  multi-unit frequency (e.g. every 2 weeks) — confirm the toast reads "Task completed — see you in 2
  weeks" and appears top-right, clearing the header, not overlapping it
- [ ] Click "Mark done" on a task and confirm the toast's `next`/`unit`/`success` query params are stripped
  from the URL after the toast appears (no stale params on refresh/back)
- [ ] `git commit` the Phase 1 code changes (`src/lib/format-completion-message.ts`,
  `src/lib/format-completion-message.test.ts`, `src/pages/api/tasks/[id]/complete.ts`,
  `src/pages/api/tasks/[id]/complete.test.ts`, `src/components/tasks/TaskList.tsx`,
  `src/pages/tasks/index.astro`, `src/layouts/Layout.astro`) — Desired End State requires this code to be
  committed, not just present in the working tree

**Implementation Note**: Automated checks already passed prior to this plan being written. The manual browser
pass and the commit are still outstanding — pause here and get human confirmation of the manual steps, and
commit the Phase 1 changes, before proceeding to Phase 2 (Phase 2 builds directly on this same "Mark done"
form).

______________________________________________________________________

## Phase 2: Confirmation guardrail for completing not-yet-due tasks

### Overview

Adds a confirmation dialog that appears only when "Mark done" is clicked on a task whose status is `OK`
(neither `DUE_SOON` nor `OVERDUE`), warning that the task isn't due yet before letting the user proceed.

### Changes Required

#### 1. Pure status predicate

**File**: `src/lib/status.ts`

**Intent**: Give the "should this completion be confirmed first?" decision a single, named, unit-testable
source of truth, co-located with the other status logic it derives from.

**Contract**: `export function shouldConfirmCompletion(status: TaskStatus): boolean` returning
`status === "OK"`.

#### 2. Predicate tests

**File**: `src/lib/status.test.ts`

**Intent**: Cover all three `TaskStatus` values against the new predicate.

**Contract**: Three cases — `"OK"` → `true`, `"DUE_SOON"` → `false`, `"OVERDUE"` → `false` — following this
file's existing `it("should ...")` naming convention.

#### 3. Confirmation dialog component

**File**: `src/components/tasks/ConfirmCompleteDialog.tsx` (new)

**Intent**: Warn the user the task they're about to complete isn't due yet (showing its current due date),
let them cancel with no effect, or confirm and complete it via the existing endpoint.

**Contract**: Same prop shape and structure as `DeleteTaskAlertDialog.tsx` — `{ task: MaintenanceTaskWithStatus | null; onOpenChange: () => void }`, early-returns `null` when `task` is `null`, renders
`<AlertDialog open onOpenChange={onOpenChange}>` from `@/components/ui/alert-dialog`. The confirm control is a
second, small `<form method="POST" action={`/api/tasks/${task.id}/complete`}>` wrapping a
`<Button type="submit">Mark done</Button>` — mirroring `DeleteTaskAlertDialog`'s pattern, not
`AlertDialogAction` (which would only close the dialog, not submit). `AlertDialogDescription` states the
task's name and its current `dueDate` (already available on `MaintenanceTaskWithStatus`).

#### 4. Wire the dialog into `TaskList.tsx`

**File**: `src/components/tasks/TaskList.tsx`

**Intent**: Gate the existing "Mark done" form's submit behind the new predicate, opening the dialog only for
`OK` tasks; `DUE_SOON`/`OVERDUE` tasks submit exactly as they do today, with no added JS on that path.

**Contract**: Add `const [confirmingTaskId, setConfirmingTaskId] = useState<string | null>(null);`, sibling to
the existing `deletingTaskId`/`editingTaskId` state. Add an `onSubmit` handler to the existing "Mark done"
`<form>` (currently lines 107-111) that calls `event.preventDefault()` and `setConfirmingTaskId(task.id)` only
when `shouldConfirmCompletion(task.status)` is `true` — see "Critical Implementation Details" above for why
this must stay submit-driven rather than becoming a `type="button"`/`onClick` toggle. Render
`<ConfirmCompleteDialog task={tasks.find((t) => t.id === confirmingTaskId) ?? null} onOpenChange={() => setConfirmingTaskId(null)} />` alongside the existing `EditTaskDialog`/`DeleteTaskAlertDialog` renders.

### Success Criteria

#### Automated Verification

- [ ] `shouldConfirmCompletion` unit tests pass: `npm run test`
- [ ] Full suite still passes (no regression in `complete.test.ts` — the endpoint contract is unchanged):
  `npm run test`
- [ ] Lint passes: `npm run lint`
- [ ] Type checking passes: `npx tsc --noEmit`

#### Manual Verification

- [ ] Click "Mark done" on an `OVERDUE` task — completes immediately, no dialog, identical to current
  behavior
- [ ] Click "Mark done" on a `DUE_SOON` task — completes immediately, no dialog
- [ ] Click "Mark done" on an `OK` task — confirmation dialog appears, showing the task's due date
- [ ] In that dialog, click "Cancel" (or press Esc, or click the overlay) — dialog closes, task is
  unaffected (`last_done_date` unchanged on reload)
- [ ] In that dialog, click "Mark done"/confirm — task completes via the same flow as Phase 1, toast shows
  the next-due message

**Implementation Note**: Pause here for manual confirmation of all five manual steps before considering this
change complete.

______________________________________________________________________

## Phase 3: One-off audit of legacy `frequency_value` rows

### Overview

A read-only, manually-run check for any `maintenance_tasks` row written before the
`frequency_value <= 1000` cap that might still violate it — no code change, no migration file.

### Changes Required

None — this phase is a manual database query, not a code change, per "What We're NOT Doing" above.

### Success Criteria

#### Automated Verification

*None — this phase has no code to automate against.*

#### Manual Verification

- [ ] Run the following query against the local/dev Supabase instance (via `npx supabase db execute` or the
  Supabase SQL editor) and record the result set in this plan's Progress notes or a follow-up comment:

  ```sql
  select id, user_id, frequency_value, frequency_unit
  from maintenance_tasks
  where frequency_value > 1000;
  ```

- [ ] If the query returns any rows, triage each manually (e.g. contact the affected user, or correct via the
  existing edit-task UI) — do not write a script or migration to auto-correct them

- [ ] If staging/production Supabase access is available, repeat the same query there and record the result

**Implementation Note**: This phase has no "next phase" to block — it's the last phase in this plan. Record
the query's result before marking this change fully implemented.

______________________________________________________________________

## Testing Strategy

### Unit Tests

- `src/lib/status.test.ts`: the three new `shouldConfirmCompletion` cases (Phase 2).
- No changes needed to `src/pages/api/tasks/[id]/complete.test.ts` — the endpoint's contract doesn't change in
  Phase 2 (the dialog only gates whether the existing form submits, not what it submits to).

### Integration Tests

- None planned — no new API surface is introduced; the existing `complete.ts` integration/RLS coverage
  (`src/pages/api/tasks/isolation.integration.test.ts`, if applicable) already exercises the endpoint this
  plan reuses unchanged.

### Manual Testing Steps

See each phase's Manual Verification list above.

## Performance Considerations

None expected — Phase 2 adds one conditional branch to an existing `onSubmit` and one dialog component that
mounts only when a task's status is `OK`; Phase 3 is a single indexed-by-nothing but small-table `SELECT`.

## Migration Notes

No schema migrations in this plan. Phase 3's audit query is intentionally kept out of
`supabase/migrations/` — see "What We're NOT Doing."

## References

- Research: `context/changes/toast-next-due-message/research.md`
- Prior decision to trade away confirmation for one-click completion:
  `context/changes/manage-maintenance-tasks/plan.md:74`
- Existing dialog patterns: `src/components/tasks/DeleteTaskAlertDialog.tsx`,
  `src/components/tasks/EditTaskDialog.tsx`
- Frequency cap migration: `supabase/migrations/20260914200000_cap_maintenance_tasks_frequency_value.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append `— <commit sha>` when a step lands. Do not rename step
> titles.

### Phase 1: Toast next-due message + top-right positioning (retroactive)

#### Automated

- [x] 1.1 Full suite passes: `npm run test`
- [x] 1.2 Lint passes: `npm run lint`
- [x] 1.3 Type checking passes: `npx tsc --noEmit`

#### Manual

- [ ] 1.4 Toast shows next-due message and appears top-right, clearing the header
- [ ] 1.5 Query params (`next`/`unit`/`success`) are stripped from the URL after the toast appears
- [ ] 1.6 Phase 1 code changes committed to git

### Phase 2: Confirmation guardrail for completing not-yet-due tasks

#### Automated

- [ ] 2.1 `shouldConfirmCompletion` unit tests pass: `npm run test`
- [ ] 2.2 Full suite still passes (no regression in `complete.test.ts`): `npm run test`
- [ ] 2.3 Lint passes: `npm run lint`
- [ ] 2.4 Type checking passes: `npx tsc --noEmit`

#### Manual

- [ ] 2.5 `OVERDUE` task completes immediately, no dialog
- [ ] 2.6 `DUE_SOON` task completes immediately, no dialog
- [ ] 2.7 `OK` task shows confirmation dialog with its due date
- [ ] 2.8 Cancel/Esc/overlay-click closes dialog with no effect
- [ ] 2.9 Confirm completes the task and shows the next-due toast

### Phase 3: One-off audit of legacy `frequency_value` rows

#### Manual

- [ ] 3.1 Run the audit query against local/dev Supabase and record the result
- [ ] 3.2 Triage any returned rows manually (no auto-correction)
- [ ] 3.3 Repeat against staging/production if accessible, and record the result
