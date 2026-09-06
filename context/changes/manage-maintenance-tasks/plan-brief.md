# User views, edits, and deletes their maintenance tasks — Plan Brief

> Full plan: `context/changes/manage-maintenance-tasks/plan.md`
> Research: `context/changes/manage-maintenance-tasks/research.md`
> External research: `context/changes/manage-maintenance-tasks/external-research.md`

## What & Why

S-02 lets a user browse all their maintenance tasks on a dedicated `/tasks` page, edit any task (including a
one-click "mark done" shortcut that resets its cycle), and permanently delete a task — FR-005, FR-006, FR-007.
Without it, a user can only ever add tasks (S-01) and never correct a mistake, complete a routine task without
re-entering it from scratch, or remove one that no longer applies.

## Starting Point

`F-01` shipped the `maintenance_tasks` table and RLS; nothing reads or writes it yet. **S-01
(`first-task-on-dashboard`) is planned and reviewed but not implemented** — its `src/lib/status.ts`,
`src/lib/task-schema.ts`, and `/api/tasks` route don't exist in the codebase. A shared prep step already
installed `select`, `alert-dialog`, `calendar`, `popover`, `sonner`, and their dependencies for both slices to
use. Since S-01 and S-02 build in parallel off the same foundation, this plan treats the modules S-01 also needs
(`status.ts`, `task-schema.ts`, the `Dialog` component) as check-before-create: whichever slice lands first
creates them to an identical, pre-agreed contract; the other reuses them.

## Desired End State

A user opens `/tasks`, sees every task they own sorted the same way the dashboard would (status, then
importance), and can edit, mark-complete, or delete any of them without leaving the page — each action redirects
back with a success toast, and every action is scoped so a second user's tasks are never visible or reachable,
even via a guessed task ID.

## Key Decisions Made

| Decision                     | Choice                                                   | Why (1 sentence)                                                                                                                        | Source                |
| ---------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Shared status/schema modules | Check-before-create, identical contract                  | Neither S-01 nor S-02 is guaranteed to land first; hard-sequencing them would contradict the roadmap's explicit parallel-streams design | Plan (user-confirmed) |
| Mark-complete affordance     | One-click "Mark done" button + full edit still available | PRD frames mark-complete as "core to normal use" — the most frequent action should have the least friction                              | Plan                  |
| Edit UI pattern              | Modal dialog, mirrors the (future) AddTaskDialog         | One consistent add/edit interaction model, reusing S-01's established dialog/validation conventions                                     | Plan                  |
| Delete confirmation          | Per-row trigger + one shared AlertDialog instance        | Standard list pattern; avoids mounting one dialog per row                                                                               | Plan                  |
| List ordering                | Same `compareByUrgency` as the dashboard                 | Free to reuse since the status module is being built here anyway; keeps both views' ordering consistent                                 | Plan                  |
| First cut if time runs short | Mark-complete shortcut (fall back to edit-form-only)     | View/edit/delete are all literal must-have FRs; the shortcut is the only pure UX layer on top                                           | Plan                  |
| Mutation transport           | Dedicated POST-only action route per operation           | Matches the repo's only existing pattern (`signup`/`signin`/`signout`); native forms can't send PATCH/DELETE anyway                     | Research              |

## Scope

**In scope:** `/tasks` list page, edit dialog (all fields), mark-complete shortcut, delete confirmation, three
new POST API routes (`/api/tasks/[id]`, `/api/tasks/[id]/delete`, `/api/tasks/[id]/complete`), route protection,
and (conditionally) the shared `status.ts`/`task-schema.ts` modules if S-01 hasn't created them yet.

**Out of scope:** the add-task flow (S-01), FR-011's public JSON API (S-03), a shared add/edit form-fields
component, sorting/filtering beyond urgency order, undo/soft-delete, `react-hook-form`, component testing.

## Architecture / Approach

`/tasks/index.astro` queries and computes status server-side, then hands the sorted list to a single
`<TaskList client:load>` React island that owns "which task is being edited/deleted" state and renders the
shared `Table`, `EditTaskDialog`, and `DeleteTaskAlertDialog`. Each mutation is its own POST route
(`[id].ts`, `[id]/delete.ts`, `[id]/complete.ts`), following the exact redirect + query-param + toast pattern
S-01 already established for `/api/tasks`. RLS alone enforces ownership — a mutation targeting another user's
task ID returns zero affected rows, redirected as a generic "Task not found," never a distinguishable error.

## Phases at a Glance

| Phase             | What it delivers                                    | Key risk                                                    |
| ----------------- | --------------------------------------------------- | ----------------------------------------------------------- |
| 1. Shared Modules | `status.ts`/`task-schema.ts`, created or reused     | Diverging from S-01's contract if built independently       |
| 2. Task List Page | `/tasks`, protected, sorted, empty state            | None significant — read-only                                |
| 3. Edit Task      | Prefilled dialog, `POST /api/tasks/[id]`            | Cross-user task-ID leak if not-found handling isn't generic |
| 4. Delete Task    | Confirm dialog, `POST /api/tasks/[id]/delete`       | Same not-found-handling risk as Phase 3                     |
| 5. Mark-Complete  | One-click shortcut, `POST /api/tasks/[id]/complete` | Stale-date bug if "today" isn't computed per-request        |

**Prerequisites:** F-01 (done). No hard dependency on S-01's implementation status, thanks to the
check-before-create module handling.
**Estimated effort:** ~5 phases across roughly 2-3 sessions, given how much of the design was already resolved
by prior research.

## Open Risks & Assumptions

- S-01's own `plan.md` doesn't yet document the check-before-create language this plan relies on symmetrically —
  a follow-up patch to `first-task-on-dashboard/plan.md` (+ a `lessons.md` entry) is planned separately, after
  this plan lands, so an implementer following S-01's plan literally doesn't try to blindly recreate a file S-02
  already created.
- If `src/lib/status.ts` or `task-schema.ts` exists but diverges from the pinned contract when this plan is
  implemented, Phase 1 stops rather than silently overwriting — treat that as a signal to reconcile manually.

## Success Criteria (Summary)

- A user can view, edit (including marking complete), and delete their own maintenance tasks end-to-end via
  `/tasks`, with no client-side fetch/JSON plumbing beyond what the repo already uses.
- No mutation is reachable, or leaks task existence, for a task ID belonging to another user.
- All automated checks (`npm run test`, `npm run lint`, `npx astro check`, `npm run build`) pass at every phase.
