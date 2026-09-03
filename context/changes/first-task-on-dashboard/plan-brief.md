# User Adds a Maintenance Task and Sees It Prioritized on the Dashboard — Plan Brief

> Full plan: `context/changes/first-task-on-dashboard/plan.md`
> Research: `context/changes/first-task-on-dashboard/research.md`, `external-research.md`, `date-fns-api-docs.md`

## What & Why

Implement S-01, the roadmap's north star: a logged-in user adds a maintenance task and immediately sees it on the
dashboard with an automatically computed status (OK / DUE SOON / OVERDUE). This is the smallest end-to-end slice
that proves Home Maintenance's core bet — automatic status derivation beats a manually-tracked to-do list.

## Starting Point

F-01 already shipped the `maintenance_tasks` table with per-user RLS, and deliberately deferred all status/due-date
computation to this slice. `dashboard.astro` today only shows a welcome message and sign-out button; no task
query, no add-task UI, and no API routes exist for tasks yet. Only one shadcn component (`button.tsx`) is
installed; `zod` and any modal/select component are net-new.

## Desired End State

A dashboard that either shows an empty-state message + "Add task" button, or a task list sorted OVERDUE → DUE
SOON → OK (then HIGH → MEDIUM → LOW importance within each). An "Add task" button opens a modal; submitting a
valid task redirects back with the new task visible and correctly prioritized; submitting invalid data (blank
field, future last-done date) reopens the modal with the error shown.

## Key Decisions Made

| Decision                  | Choice                                          | Why (1 sentence)                                                                                  | Source   |
| ------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------- |
| Form validation           | Hand-rolled `useState` + zod schema             | Matches CLAUDE.md's zod convention without introducing react-hook-form or its Astro SSR gotcha    | Plan     |
| Mutation entry point      | `POST /api/tasks` + redirect                    | Mirrors every existing form in the repo (`signup.ts`/`signin.ts`); zero new architecture          | Plan     |
| Add-task UI placement     | Modal/dialog (shadcn `Dialog`)                  | Keeps the default dashboard focused on the task list                                              | Plan     |
| Future last-done date     | Rejected with a validation error                | Prevents a typo silently hiding a task from the OVERDUE view                                      | Plan     |
| Test coverage depth       | Unit tests: status/due-date + sort + zod schema | Covers every new piece of pure logic with the existing Vitest-only toolchain, no new test tooling | Plan     |
| Empty-dashboard state     | Simple message + visible "Add task" trigger     | Matches the PRD's first-session flow with no new assets                                           | Plan     |
| Frequency unit vocabulary | Singular (`day\|week\|month\|year`)             | Matches F-01's shipped enum; the doc's earlier plural mismatch has already been corrected         | Research |

## Scope

**In scope:**

- `src/lib/status.ts` — due-date/status computation + urgency sort comparator, unit-tested.
- `src/lib/task-schema.ts` — zod schema shared by client and server.
- `src/pages/api/tasks/index.ts` — `POST` handler, RLS-scoped insert, self-checked auth.
- `src/pages/dashboard.astro` rewrite — real task query, sort, render, empty state.
- `src/components/tasks/AddTaskDialog.tsx` — new modal component.

**Out of scope:**

- Full FR-011 CRUD API (S-03), view/edit/delete of tasks (S-02).
- `react-hook-form`, component-testing libraries.
- Retrofitting `prerender = false` onto existing auth routes.

## Architecture / Approach

Three phases in data → logic → API → UI order (schema already exists from F-01): pure business logic first
(testable in isolation), then the validation schema + API route, then the dashboard UI and modal that consume
both. The dashboard computes status server-side on every load — no stored status column, no client-side fetch.

## Phases at a Glance

| Phase                            | What it delivers                                            | Key risk                                                                 |
| -------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1. Status & due-date computation | `computeDueDate`/`computeStatus`/`compareByUrgency` + tests | Non-exhaustive switch over frequency unit silently returning `undefined` |
| 2. Validation & API              | Shared zod schema + `POST /api/tasks`                       | Route isn't covered by `PROTECTED_ROUTES` — must self-check auth         |
| 3. Dashboard & dialog            | Real task list, empty state, add-task modal                 | Error-redirect must reopen the modal, or server errors are silent        |

**Prerequisites:** F-01 (done); Supabase local/hosted project reachable for manual verification.
**Estimated effort:** ~3 sessions, one per phase.

## Open Risks & Assumptions

- The future-date validation rule must be evaluated per-request (a `.refine` callback), not baked into the
  schema at module load — a Workers-isolate-lifetime gotcha, not a logic error, but easy to get wrong.
- No component-testing library exists in the repo; the dialog's client-side validation is covered by unit-testing
  the shared zod schema, not by rendering the component itself.

## Success Criteria (Summary)

- A user can add a task via the modal and see it on the dashboard immediately with the correct status.
- Tasks are sorted OVERDUE → DUE SOON → OK, then by importance, matching FR-010.
- Invalid submissions (blank fields, future last-done date) are rejected with a visible error, and one user never
  sees another user's tasks.
