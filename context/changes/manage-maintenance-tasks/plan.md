# User views, edits, and deletes their maintenance tasks — Implementation Plan

## Overview

Implement S-02 (`manage-maintenance-tasks`): a logged-in user can browse all their maintenance tasks on a
dedicated `/tasks` page, edit any task's fields (including a one-click shortcut to mark it complete by setting
`last_done_date` to today), and permanently delete a task — FR-005, FR-006, FR-007. This is one of two slices
(alongside S-01, `first-task-on-dashboard`) that build on `F-01`'s schema in parallel; neither has been
implemented yet.

## Current State Analysis

`F-01` shipped `maintenance_tasks` with per-user RLS (`supabase/migrations/20260827194321_create_maintenance_tasks.sql`)
and no `status`/`next_due_date` columns — both are always computed at read time. A shared prep step
(`chore(m2l4): install shared shadcn primitives for S-01/S-02`) already installed `select`, `alert-dialog`,
`calendar`, `popover`, and `sonner` under `src/components/ui/`, added `react-day-picker`, `radix-ui`, `date-fns`,
and `sonner` as direct dependencies, and mounted `<Toaster client:load />` in `src/layouts/Layout.astro`. Neither
`Table` nor `Dialog` is installed yet.

**S-01's plan is written and reviewed (`plan_reviewed`) but not implemented** — `src/lib/status.ts`,
`src/lib/task-schema.ts`, `src/pages/api/tasks/index.ts`, and `src/components/tasks/AddTaskDialog.tsx` do not
exist in the codebase yet; `src/pages/dashboard.astro` is still the placeholder welcome page. Since S-01 and S-02
are explicitly parallel (`roadmap.md` Streams A/B, driven by `top_blocker: capacity`), this plan cannot assume
S-01 lands first, and must not silently duplicate or collide with modules S-01's own plan already specifies with
an identical contract.

`src/middleware.ts`'s `PROTECTED_ROUTES` covers only `/dashboard`; a new `/tasks` route needs adding there. The
repo's only mutation pattern today is a dedicated POST-only action route per operation, native
`<form method="POST">`, redirect + query-param feedback (`src/pages/api/auth/{signup,signin,signout}.ts`) — no
client-side fetch/JSON mutation hooks exist, and native HTML forms cannot send `PATCH`/`DELETE` methods anyway.

## Desired End State

A user visiting `/tasks` sees all their maintenance tasks in a table, sorted the same way as the dashboard
(status then importance), each row showing its computed status and due date. They can click "Edit" to open a
prefilled dialog and change any field (including manually picking a new `last_done_date`), click "Mark done" for
a one-action shortcut that sets `last_done_date` to today without opening a dialog, or click "Delete" to confirm
and permanently remove the task. Every mutation redirects back to `/tasks` with a success toast; validation or
not-found errors surface inline (dialog reopened with the error) or via a redirected error message. A second
user's tasks are never visible or reachable, even by guessing a task ID.

**Verification**: `npm run test`, `npm run lint`, `npx astro check`, and `npm run build` all pass; manual
walkthrough of the list view, edit flow (incl. validation errors), mark-complete shortcut, delete confirmation,
and cross-user isolation (see per-phase Manual Verification).

### Key Discoveries

- `context/changes/first-task-on-dashboard/plan.md:150-235` — the exact contract for `src/lib/status.ts`
  (`computeDueDate`, `computeStatus`, `compareByUrgency`) and `src/lib/task-schema.ts` (`addTaskSchema`) that
  this plan must reuse verbatim if S-01 lands first, or create verbatim if S-02 lands first.
- `context/changes/manage-maintenance-tasks/research.md:109-114` — `MaintenanceFrequencyUnit` enum values are
  **singular** (`"day"|"week"|"month"|"year"`); the edit form's frequency-unit `<Select>` must round-trip these
  exactly.
- `context/changes/manage-maintenance-tasks/research.md` (Follow-up Research 2026-09-04/06) — `react-day-picker`
  v10.0.1, `sonner` (success-only, no `toast.error` precedent), and hand-rolled `useState` + zod (no
  `react-hook-form`) are the settled conventions for this slice too.
- `src/middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard"]`; API routes are never covered by middleware and
  must self-check `context.locals.user`.
- `src/pages/api/auth/signout.ts:1-10` — the established pattern for a body-less POST action route (mirrors this
  plan's `complete`/`delete` routes, which take no form fields beyond the URL's `[id]`).
- RLS (`supabase/migrations/20260827194321_create_maintenance_tasks.sql`) silently returns zero affected rows for
  an `update`/`delete` targeting a task ID that doesn't exist *or* belongs to another user — both cases must
  produce the same generic "Task not found" outcome, never a distinguishable 403 vs. 404, to avoid leaking
  cross-user existence information (NFR: "no user's data ever exposed to another user").

## What We're NOT Doing

- FR-011's full API CRUD surface (S-03, `maintenance-tasks-api`) — this plan's POST routes serve the HTML forms
  only, matching S-01's `POST /api/tasks` precedent, not a public JSON API.
- The add-task flow, `AddTaskDialog`, or `/dashboard`'s task rendering (S-01's scope).
- Extracting a shared form-fields component between the (not-yet-existing) `AddTaskDialog` and this plan's
  `EditTaskDialog` — the two would need to be built and refactored together, which couples this plan to S-01's
  implementation timing. Accepted duplication for now; a future cleanup slice can extract one once both exist.
- A confirmation step for the mark-complete shortcut — the one-click design explicitly trades away a confirm
  dialog for speed, per this plan's own recorded decision.
- Sorting, filtering, or searching the list beyond the fixed urgency order — no FR calls for it, and the PRD's
  Non-Goals rule out category-driven logic.
- Undo or soft-delete — FR-007's Socratic note confirms permanent deletion with no recovery is acceptable for
  MVP.
- `react-hook-form`, `@hookform/resolvers`, or any component-testing library — matches S-01's rejection of both.
- Any client-side fetch/SPA-style submission — every mutation is a native form POST + full-page redirect.

## Implementation Approach

Five phases, ordered read-before-write and core-before-shortcut:

1. **Shared modules** (`src/lib/status.ts`, `src/lib/task-schema.ts`) — conditional on S-01 not having landed
   them first; establishes the business logic and validation this plan's UI depends on.
1. **List page** (FR-006) — the read path, lowest risk, proves the shared modules work end-to-end before any
   mutation is added.
1. **Edit** (FR-005 core) — the most complex mutation (full field set, dialog, prefill).
1. **Delete** (FR-007) — a simpler mutation, confirmation-gated.
1. **Mark-complete shortcut** (FR-005's "core to normal use" one-click affordance) — deliberately last. If time
   runs short against the 2026-09-10 deadline, stopping after Phase 4 leaves a complete, demoable FR-005/006/007
   implementation (edit still covers marking complete, just via the full form) rather than a half-built shortcut.

## Critical Implementation Details

**Shared-file check-before-create, for `src/lib/status.ts`, `src/lib/task-schema.ts`, and
`src/components/ui/dialog.tsx`.** Because S-01 and S-02 build in parallel off the same foundation and both plans
specify the identical contract for these files, whichever slice is implemented first creates them; the other
must check for existence first and reuse rather than recreate. Concretely: before writing any of these three
files, check whether it already exists. If it does, read it, confirm it matches the contract this plan specifies
(same exported names/signatures), and skip the creation step — proceed straight to importing it. If it exists but
diverges from the contract, stop and flag the discrepancy rather than overwriting it. If it doesn't exist, create
it exactly as specified in the relevant phase below.

**Cross-user and not-found task IDs must produce an identical, generic error.** Every mutation route
(`edit`, `delete`, `complete`) targets a task by ID scoped only by RLS (`.eq("id", id)`, relying on the
`auth.uid() = user_id` policy, never a redundant application-level ownership check). A request for another
user's task ID and a request for a nonexistent task ID both come back as zero affected rows from Supabase —
both must redirect with the same "Task not found" message. Distinguishing them (e.g. a "not yours" vs. "doesn't
exist" message) would leak whether a given ID belongs to someone else.

**The mark-complete route must compute "today" per-request, not at module load.** Same Cloudflare Workers
isolate-reuse concern S-01's plan already documents for its future-date validation: `new Date()` must be called
inside the request handler itself, never captured at a module's top-level scope, or every request in a reused
isolate would write the same stale date.

**The dashboard↔`/tasks` nav link is a deliberately tiny, isolated edit.** `dashboard.astro` is S-01's file to
substantially rewrite; this plan only adds one small link into its existing placeholder markup (or S-01's
eventual markup, whichever lands second finds a single extra anchor tag to reconcile — low-risk regardless of
merge order).

## Phase 1: Shared Status & Validation Modules

### Overview

Conditionally establish the business logic and validation this plan's UI depends on — reusing S-01's exact
contract if it has already landed, or creating it fresh if S-02 is implemented first.

### Changes Required

#### 1. Status/due-date module

**File**: `src/lib/status.ts`

**Intent**: Check whether this file already exists (see Critical Implementation Details). If absent, create it
with the exact contract S-01's plan specifies, since S-02's list view also needs computed status/due-date and
urgency ordering.

**Contract**: Exports `computeDueDate(lastDoneDate: Date, frequencyValue: number, frequencyUnit: MaintenanceFrequencyUnit): Date` (via `date-fns` `addDays`/`addWeeks`/`addMonths`/`addYears`, switching on the singular
`day|week|month|year` literals, with an exhaustive `default` branch assigning to a `never`-typed variable before
throwing — this repo's lint/tsconfig config doesn't otherwise catch a missed enum case);
`computeStatus(dueDate: Date, today: Date): TaskStatus` using `differenceInCalendarDays` against
`DUE_SOON_THRESHOLD_DAYS = 7` (FR-009: `< today` → OVERDUE; `today..today+7` inclusive → DUE_SOON; beyond → OK);
`compareByUrgency(a: MaintenanceTaskWithStatus, b: MaintenanceTaskWithStatus): number` ranking status then
importance. If the file already exists, verify these three exports match and skip to Phase 2.

#### 2. Shared types

**File**: `src/types.ts`

**Intent**: Only if Phase 1 Item 1 created `status.ts` fresh — add the shared status vocabulary.

**Contract**: `export type TaskStatus = "OK" | "DUE_SOON" | "OVERDUE";` and
`export type MaintenanceTaskWithStatus = MaintenanceTask & { dueDate: Date; status: TaskStatus };`. Skip if these
already exist from S-01.

#### 3. Validation schema

**File**: `src/lib/task-schema.ts`

**Intent**: Check whether this file already exists. If absent, create the shared zod schema both the (future)
add flow and this plan's edit flow validate against, sourcing enum values from the generated `Constants` rather
than hand-duplicating them. `zod` is currently reachable only transitively (not listed in `package.json`) — if
this file is being created fresh, run `npm install zod` first to pin it as a direct dependency, mirroring S-01's
Phase 2 Item 1. Skip the install if the file already exists (S-01 having landed first already pinned it).

**Contract**: `export const addTaskSchema = z.object({ name, category, importance, frequency_value, frequency_unit, last_done_date })`, field names matching `MaintenanceTaskInsert` exactly. `category`/`importance`/`frequency_unit` are `z.enum(Constants.public.Enums.maintenance_category)` etc. `frequency_value` is
`z.coerce.number().int().positive(...)`. `last_done_date` is `z.coerce.date()` with a `.refine` rejecting any
date after "now", evaluated fresh per call (not at module scope). Export the inferred `AddTaskInput` type. This
plan's edit form reuses `addTaskSchema` directly — the edit form always submits the full field set, so no
separate partial schema is needed. If the file already exists, verify this contract and reuse as-is.

#### 4. Unit tests (only for whatever this phase actually created)

**File**: `src/lib/status.test.ts`, `src/lib/task-schema.test.ts`

**Intent**: If Phase 1 created `status.ts` and/or `task-schema.ts` fresh, add the same test coverage S-01's plan
specifies for them (status boundaries, frequency units, schema accept/reject cases). If both files already
existed and were only verified/reused, this item is a no-op — their tests already exist from S-01.

**Contract**: `describe`/`it("should ...")` Vitest style, colocated, matching `src/lib/utils.test.ts`'s
convention.

### Success Criteria

#### Automated Verification

- Unit tests pass (new or pre-existing): `npm run test`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification

- If this phase created `status.ts`/`task-schema.ts` fresh, manually confirm no other file in the repo already
  defined these names before writing them (avoid a silent duplicate-export collision).
- If this phase reused existing files, manually diff their exports against this plan's contract to confirm no
  drift.

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 2.

______________________________________________________________________

## Phase 2: Task List Page

### Overview

A protected `/tasks` page rendering every one of the user's tasks, sorted the same way as the dashboard, with an
empty state and navigation to/from the dashboard. Read-only in this phase — mutation actions are wired in Phases
3–5.

### Changes Required

#### 1. Install shadcn Table

**Intent**: `Table` isn't installed yet. Following the `lessons.md` guidance from the shared-primitives prep
step, run the install non-interactively and diff every touched file afterward.

**Contract**: `npx shadcn add table -y -o`, then check `git diff`/`git status` for (a) unintended overwrites of
already-installed components, (b) a literal `"cn"` import that must become `@/lib/utils`, (c) any
framework-specific import this project doesn't support. Run `npm run build && npm run lint && npm run test`
after.

#### 2. Protect the route

**File**: `src/middleware.ts`

**Intent**: `/tasks` must require authentication, same as `/dashboard`.

**Contract**: Add `"/tasks"` to `PROTECTED_ROUTES`.

#### 3. List page

**File**: `src/pages/tasks/index.astro`

**Intent**: Query the user's tasks, compute each one's status/due date via `src/lib/status.ts`, sort by
`compareByUrgency`, and render the list (or an empty state) inside a client island that Phases 3–5 progressively
add mutation actions to.

**Contract**: Server-side frontmatter query (`await createClient(...).from("maintenance_tasks").select("*")`,
relying on RLS — no redundant `.eq("user_id", ...)`), mapped through `computeDueDate`/`computeStatus` into
`MaintenanceTaskWithStatus[]`, sorted with `compareByUrgency`, passed as a prop into `<TaskList tasks={...} client:load />`. Reads `error`/`success` query params the same way `dashboard.astro` will, passing them to the
island. Adds a small "Manage tasks" link into `dashboard.astro`'s existing markup, and a "Back to dashboard" link
on this page (see Critical Implementation Details on the nav link's deliberately small footprint).

#### 4. Task list island

**File**: `src/components/tasks/TaskList.tsx`

**Intent**: A self-contained React island rendering the shadcn `Table` of tasks (name, category, importance,
status label, due date, last-done date), an empty-state message when there are no tasks, and reading
`success`/`error` query params on mount to fire the `sonner` toast (mirroring S-01's inline-script/toast pattern,
but as part of this island rather than a separate script since the island already needs client-side state for
the mutation dialogs added in Phases 3–5).

**Contract**: Accepts `tasks: MaintenanceTaskWithStatus[]`, `success?: string | null`, `error?: string | null`.
Owns `editingTaskId: string | null` and `deletingTaskId: string | null` state (both `null` in this phase —
populated by Phases 3–4). Strips the `success`/`error` query params via `history.replaceState` after firing the
toast, matching S-01's anti-repeat-on-refresh behavior.

### Success Criteria

#### Automated Verification

- Unit tests pass: `npm run test`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build succeeds under the Cloudflare adapter: `npm run build`

#### Manual Verification

- Sign in with no tasks: confirm the empty-state message and a working "Back to dashboard" link both render.
- Add tasks directly in Supabase Studio spanning all three statuses and importances; confirm `/tasks` renders
  them sorted OVERDUE → DUE SOON → OK, then HIGH → MEDIUM → LOW, matching the same order the dashboard would use.
- Confirm the "Manage tasks" link on `/dashboard` navigates to `/tasks`.
- Sign in as a second test user and confirm `/tasks` shows zero tasks from the first user.

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 3.

______________________________________________________________________

## Phase 3: Edit Task

### Overview

A prefilled edit dialog for any field, backed by a dedicated `POST /api/tasks/[id]` route.

### Changes Required

#### 1. Install shadcn Dialog

**Intent**: Check whether `src/components/ui/dialog.tsx` already exists (S-01 may have installed it first — see
Critical Implementation Details). If absent, install it.

**Contract**: `npx shadcn add dialog -y -o`, then the same diff/import-remap check as Phase 2's `Table`
install. Skip entirely if the file already exists and matches shadcn's standard `Dialog` shape.

#### 2. Edit dialog

**File**: `src/components/tasks/EditTaskDialog.tsx`

**Intent**: A standalone dialog (not sharing a component with the not-yet-existing `AddTaskDialog` — see What
We're NOT Doing) prefilled from the task being edited, validating with the reused `addTaskSchema` client-side
before submit.

**Contract**: Accepts `task: MaintenanceTaskWithStatus | null` (null = closed) and `onOpenChange`. Renders a
shadcn `Dialog` wrapping a native `<form method="POST" action={`/api/tasks/${task.id}`}>`, fields identical to
the add flow's (shadcn `Select` for category/importance/frequency_unit, plain inputs for name/frequency_value, a
`Calendar`+`Popover`-backed date field for `last_done_date` serialized via `date-fns`' `format(date, "yyyy-MM-dd")` into a hidden input), each field prefilled from `task`. `addTaskSchema.safeParse` runs on submit;
on failure, `preventDefault()` and show per-field errors; on success, let the native POST proceed.

#### 3. Wire into the list

**File**: `src/components/tasks/TaskList.tsx`

**Intent**: Each row's "Edit" button sets `editingTaskId` to that row's task ID; `EditTaskDialog` renders with
the matching task from `tasks` (or `null` when no row is selected) — one shared dialog instance, not one per row.

**Contract**: `<EditTaskDialog task={tasks.find(t => t.id === editingTaskId) ?? null} onOpenChange={() => setEditingTaskId(null)} />` alongside the existing table rendering.

#### 4. API route

**File**: `src/pages/api/tasks/[id].ts`

**Intent**: Accept the edit submission, validate it, and update the task only if it belongs to the
authenticated user.

**Contract**: `export const prerender = false;` plus `POST: APIRoute`: redirect to `/auth/signin` if
`context.locals.user` is `null`; parse `formData()`; `addTaskSchema.safeParse(...)`; on failure, redirect to
`/tasks?error=${encodeURIComponent(<first issue message>)}`; on success, `createClient(...).from("maintenance_tasks").update({ ...parsed }).eq("id", context.params.id).select()` — destructure `{ data, error }` from the result; if `error` is set
(e.g. a malformed, non-UUID `id` that PostgREST can't cast) **or** `data` is an empty array, redirect to
`/tasks?error=${encodeURIComponent("Task not found")}` (covers nonexistent, other-user's, and malformed task IDs
alike, per Critical Implementation Details — never let a DB error surface raw); otherwise redirect to
`/tasks?success=task-updated`.

#### 5. API route tests

**File**: `src/pages/api/tasks/[id].test.ts`

**Intent**: Cover the auth gate and the not-found/happy-path branches — the same risk class S-01's plan review
(F2) flagged for its own `/api/tasks` route.

**Contract**: Mock `@/lib/supabase`'s `createClient` (following `src/lib/supabase.test.ts`'s `vi.hoisted()` +
dynamic-import convention). Three cases: (1) `locals.user: null` → redirect to `/auth/signin`, `update` never
called; (2) valid user + valid data, mocked `update(...).eq(...).select()` returns a row → redirect to
`/tasks?success=task-updated`; (3) valid user + valid data, mocked `select()` returns an empty array (simulating
another user's or a nonexistent task ID) → redirect to `/tasks?error=Task not found`.

### Success Criteria

#### Automated Verification

- Unit tests pass: `npm run test`
- API route tests pass (`src/pages/api/tasks/[id].test.ts`)
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- Click "Edit" on a task, confirm the dialog opens prefilled with its current values.
- Submit a change to each field type (text, select, number, date) and confirm the row reflects it after redirect,
  with a "Task updated" toast.
- Submit a blank name and a future `last_done_date`; confirm the redirect reopens the dialog with the error.
- With an authenticated session, POST to `/api/tasks/<another-user's-task-id>` (e.g. via a REST client) and
  confirm a generic "Task not found" redirect, not a distinguishable error.

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 4.

______________________________________________________________________

## Phase 4: Delete Task

### Overview

A confirmation-gated permanent delete, backed by a dedicated `POST /api/tasks/[id]/delete` route.

### Changes Required

#### 1. Delete confirmation dialog

**File**: `src/components/tasks/DeleteTaskAlertDialog.tsx`

**Intent**: A single shared `AlertDialog` (already installed) confirming permanent deletion before submitting.

**Contract**: Accepts `task: MaintenanceTaskWithStatus | null` (null = closed) and `onOpenChange`. Renders the
shadcn `AlertDialog` with the task's name in the confirmation copy, a cancel action, and a native
`<form method="POST" action={`/api/tasks/${task.id}/delete`}>` submit action — no client-side validation needed
(no fields).

#### 2. Wire into the list

**File**: `src/components/tasks/TaskList.tsx`

**Intent**: Each row's "Delete" button sets `deletingTaskId` to that row's task ID; `DeleteTaskAlertDialog`
renders with the matching task — one shared instance, matching the Edit dialog's pattern.

**Contract**: `<DeleteTaskAlertDialog task={tasks.find(t => t.id === deletingTaskId) ?? null} onOpenChange={() => setDeletingTaskId(null)} />`.

#### 3. API route

**File**: `src/pages/api/tasks/[id]/delete.ts`

**Intent**: Permanently delete the task if it belongs to the authenticated user.

**Contract**: `export const prerender = false;` plus `POST: APIRoute`, mirroring `signout.ts`'s body-less shape:
redirect to `/auth/signin` if `context.locals.user` is `null`; `createClient(...).from("maintenance_tasks").delete().eq("id", context.params.id).select()` — destructure `{ data, error }`; `error` set (e.g. malformed
non-UUID `id`) or empty `data` array → `/tasks?error=${encodeURIComponent("Task not found")}` (never let a DB
error surface raw); otherwise `/tasks?success=task-deleted`.

#### 4. API route tests

**File**: `src/pages/api/tasks/[id]/delete.test.ts`

**Intent**: Same risk class as Phase 3's edit route.

**Contract**: Same three-case shape as Phase 3's tests, adapted for `delete()` instead of `update()`.

### Success Criteria

#### Automated Verification

- Unit tests pass: `npm run test`
- API route tests pass (`src/pages/api/tasks/[id]/delete.test.ts`)
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- Click "Delete", confirm the alert dialog shows the correct task name, cancel it, and confirm the task is
  unchanged.
- Click "Delete" again, confirm the deletion, and confirm the row disappears with a "Task deleted" toast.
- With an authenticated session, POST to `/api/tasks/<another-user's-task-id>/delete` and confirm a generic
  "Task not found" redirect, and that the other user's task still exists.

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 5.

______________________________________________________________________

## Phase 5: Mark-Complete Shortcut

### Overview

A one-click "Mark done" action per row, setting `last_done_date` to today without opening a dialog. Deliberately
last and independently droppable — Phase 4 already leaves FR-005/006/007 fully functional (mark-complete via the
full edit form).

### Changes Required

#### 1. API route

**File**: `src/pages/api/tasks/[id]/complete.ts`

**Intent**: Set the task's `last_done_date` to the current date server-side (never client-supplied — the point
of a one-click shortcut is that no date needs picking), scoped to the authenticated user's own task.

**Contract**: `export const prerender = false;` plus `POST: APIRoute`, mirroring `delete.ts`'s body-less shape:
redirect to `/auth/signin` if `context.locals.user` is `null`; compute today's date *inside the handler* (see
Critical Implementation Details — never at module scope) as `format(new Date(), "yyyy-MM-dd")`;
`createClient(...).from("maintenance_tasks").update({ last_done_date: today }).eq("id", context.params.id).select()` — destructure `{ data, error }`; `error` set (e.g. malformed non-UUID `id`) or empty `data` array →
`/tasks?error=${encodeURIComponent("Task not found")}` (never let a DB error surface raw); otherwise redirect to
`/tasks?success=task-completed`.

#### 2. Row action

**File**: `src/components/tasks/TaskList.tsx`

**Intent**: Each row gets a "Mark done" button — a plain `<form method="POST" action={`/api/tasks/${task.id}/complete`}>` with a submit button, no dialog, no client-side state.

**Contract**: Rendered alongside the existing Edit/Delete actions in the same row.

#### 3. API route tests

**File**: `src/pages/api/tasks/[id]/complete.test.ts`

**Intent**: Same auth-gate/not-found risk class as Phases 3–4, plus the per-request date-freshness property.

**Contract**: Same three-case shape as Phase 4's tests, adapted for the `complete` route; additionally assert
the date passed to `update(...)` is computed at call time (e.g. by mocking a fixed system time per test case and
confirming the value differs across cases), not captured once.

### Success Criteria

#### Automated Verification

- Unit tests pass: `npm run test`
- API route tests pass (`src/pages/api/tasks/[id]/complete.test.ts`)
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- Click "Mark done" on an OVERDUE task; confirm it recomputes to OK (or DUE_SOON, depending on frequency) with
  today as its last-done date, and a "Task completed" toast appears.
- With an authenticated session, POST to `/api/tasks/<another-user's-task-id>/complete` and confirm a generic
  "Task not found" redirect.

**Implementation Note**: This completes S-02. Pause here for final manual confirmation before closing out the
change.

______________________________________________________________________

## Testing Strategy

### Unit Tests

- `status.ts`/`task-schema.ts` (Phase 1) — only if newly created by this plan; otherwise already covered by S-01.
- `POST /api/tasks/[id]` (Phase 3), `POST /api/tasks/[id]/delete` (Phase 4), `POST /api/tasks/[id]/complete`
  (Phase 5) — each covering: no-user redirect (mutation never called), happy path (mutation called with the
  right args, correct success redirect), and the cross-user/nonexistent-ID not-found path.

### Integration Tests

- None planned — matches S-01: no integration runner is configured (Vitest only); manual verification steps
  cover the end-to-end flows instead.

### Manual Testing Steps

1. Empty `/tasks` state → link back to dashboard.
1. Multi-task sort ordering across all status/importance combinations, matching the dashboard's own ordering.
1. Edit flow: prefill correctness, each field type, validation-error reopen.
1. Delete flow: cancel vs. confirm, row removal, toast.
1. Mark-complete flow: status recomputation, toast.
1. Cross-user isolation on `/tasks` and via direct API calls to another user's task ID, for all three mutations.

## Performance Considerations

None beyond what's already true for S-01: a single per-user Supabase query plus an in-memory sort over a small
task list (NFR target scale is "small" data volume, "low" QPS) — no pagination or caching needed.

## Migration Notes

None — no schema changes; F-01's migration already shipped the table and RLS this slice reads/writes against.

## References

- Internal research: `context/changes/manage-maintenance-tasks/research.md`
- External research: `context/changes/manage-maintenance-tasks/external-research.md`
- Sibling slice plan (shared contract source): `context/changes/first-task-on-dashboard/plan.md`
- Upstream schema: `context/changes/maintenance-task-data-model/plan.md`
- Existing form/route patterns: `src/components/auth/SignUpForm.tsx`, `src/pages/api/auth/{signup,signout}.ts`
- Lessons: `context/foundation/lessons.md` ("`npx shadcn add` needs `-y` AND `-o`...")

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append `— <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Shared Status & Validation Modules

#### Automated

- [x] 1.1 Unit tests pass: `npm run test` — c390e9c
- [x] 1.2 Type checking passes: `npx astro check` — c390e9c
- [x] 1.3 Linting passes: `npm run lint` — c390e9c

#### Manual

- [x] 1.4 No silent duplicate-export collision if files were created fresh — c390e9c
- [x] 1.5 No contract drift if files were reused from S-01 — c390e9c

### Phase 2: Task List Page

#### Automated

- [x] 2.1 Unit tests pass: `npm run test` — 8ddfc2e
- [x] 2.2 Type checking passes: `npx astro check` — 8ddfc2e
- [x] 2.3 Linting passes: `npm run lint` — 8ddfc2e
- [x] 2.4 Build succeeds under the Cloudflare adapter: `npm run build` — 8ddfc2e

#### Manual

- [x] 2.5 Empty-state message + "Back to dashboard" link render with zero tasks — 8ddfc2e
- [x] 2.6 Tasks render sorted per the same urgency order as the dashboard — 8ddfc2e
- [x] 2.7 "Manage tasks" link on `/dashboard` navigates to `/tasks` — 8ddfc2e
- [x] 2.8 Second test user sees zero tasks from the first user — 8ddfc2e

### Phase 3: Edit Task

#### Automated

- [x] 3.1 Unit tests pass: `npm run test`
- [x] 3.2 API route tests pass (`src/pages/api/tasks/[id].test.ts`)
- [x] 3.3 Type checking passes: `npx astro check`
- [x] 3.4 Linting passes: `npm run lint`
- [x] 3.5 Build succeeds: `npm run build`

#### Manual

- [x] 3.6 Edit dialog opens prefilled with current values
- [x] 3.7 Each field type updates correctly with a "Task updated" toast
- [x] 3.8 Blank name / future date reopens the dialog with the error
- [x] 3.9 Editing another user's task ID redirects with a generic "Task not found" error

### Phase 4: Delete Task

#### Automated

- [ ] 4.1 Unit tests pass: `npm run test`
- [ ] 4.2 API route tests pass (`src/pages/api/tasks/[id]/delete.test.ts`)
- [ ] 4.3 Type checking passes: `npx astro check`
- [ ] 4.4 Linting passes: `npm run lint`
- [ ] 4.5 Build succeeds: `npm run build`

#### Manual

- [ ] 4.6 Cancel leaves the task unchanged
- [ ] 4.7 Confirm removes the row with a "Task deleted" toast
- [ ] 4.8 Deleting another user's task ID redirects with a generic "Task not found" error, task persists

### Phase 5: Mark-Complete Shortcut

#### Automated

- [ ] 5.1 Unit tests pass: `npm run test`
- [ ] 5.2 API route tests pass (`src/pages/api/tasks/[id]/complete.test.ts`)
- [ ] 5.3 Type checking passes: `npx astro check`
- [ ] 5.4 Linting passes: `npm run lint`
- [ ] 5.5 Build succeeds: `npm run build`

#### Manual

- [ ] 5.6 Marking an OVERDUE task done recomputes its status with today's date, with a "Task completed" toast
- [ ] 5.7 Completing another user's task ID redirects with a generic "Task not found" error
