# User adds a maintenance task and sees it correctly prioritized on the dashboard — Implementation Plan

## Overview

Implement S-01 (`first-task-on-dashboard`): a logged-in user can add a maintenance task (name, category,
importance, frequency, last-done date) via a modal on the dashboard, and immediately see it there with an
automatically computed status (OK / DUE SOON / OVERDUE), sorted by status then importance. This is the roadmap's
north star — the smallest end-to-end slice that proves the product's central bet (automatic status derivation vs.
a manually-tracked list).

## Current State Analysis

F-01 shipped the `maintenance_tasks` table with per-user RLS and deliberately deferred all status/due-date
computation to this slice (`context/changes/maintenance-task-data-model/plan.md:35-38,62-63`). `src/types.ts`
already re-exports `MaintenanceTask`/`MaintenanceTaskInsert`/`MaintenanceFrequencyUnit` etc. from the generated
`src/db/database.types.ts`. `src/pages/dashboard.astro` currently only renders a welcome message and a sign-out
button — no task query, no add-task UI. No API route exists for tasks; the only API routes are
`src/pages/api/auth/{signin,signup,signout}.ts`. `react-hook-form` is explicitly not used (see What We're NOT
Doing) — `zod` is still net-new to this slice's own code.

A shared prep step (`chore(m2l4): install shared shadcn primitives for S-01/S-02`, done ahead of both S-01 and
S-02 specifically to avoid each slice separately hitting the shadcn CLI's `select`/`alert-dialog` type-collision
risk — see `context/changes/manage-maintenance-tasks/research.md` Decision 4) already installed `select`,
`alert-dialog`, `calendar`, `popover`, and `sonner` under `src/components/ui/`, added `react-day-picker`,
`radix-ui`, `date-fns`, and `sonner` as direct dependencies, and mounted `<Toaster client:load />` in
`src/layouts/Layout.astro`. This slice does **not** need to install any of those again — only `Dialog` remains
net-new here. `src/middleware.ts`'s `PROTECTED_ROUTES` list covers only `/dashboard`, not `/api/*` — API routes
must enforce their own auth check.

## Desired End State

A user lands on `/dashboard` and sees either an empty-state message with an "Add task" button (no tasks yet), or
their tasks sorted OVERDUE → DUE SOON → OK, then HIGH → MEDIUM → LOW importance within each status. Clicking "Add
task" opens a modal with fields for name, category, importance, frequency (value + unit), and last-done date.
Submitting a valid task redirects back to `/dashboard`, where the new task appears with a correctly computed
status. Submitting invalid data (missing fields, non-positive frequency, or a future last-done date) redirects
back with the modal reopened and the error shown. A second user's dashboard never shows the first user's tasks.

**Verification**: `npm run test`, `npm run lint`, and `npx astro check` all pass; manual walkthrough of the empty
state, add-task happy path, validation-error path, and cross-user isolation (see per-phase Manual Verification).

### Key Discoveries

- `context/changes/maintenance-task-data-model/plan.md:35-38,62-63` — status/due-date computation is explicitly
  this slice's responsibility; no DB columns or migration needed.
- `src/db/database.types.ts:58,187` / `src/types.ts:9` — `MaintenanceFrequencyUnit` is singular
  (`"day"|"week"|"month"|"year"`); `context/changes/first-task-on-dashboard/date-fns-api-docs.md` already carries
  the corrected (singular) reference implementation for `computeDueDate`/`computeStatus`.
- `src/middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard"]` does not cover `/api/*`; the new `POST /api/tasks`
  route must check `context.locals.user` itself rather than relying on middleware.
- `src/pages/api/auth/signup.ts:1-20` — the established pattern for a mutating API route: `formData()` parsing,
  `context.redirect(...)` with an `?error=` query param on failure, no JSON responses.
- `src/pages/auth/signin.astro:5` — the established pattern for surfacing a server error back into a client
  component: read `Astro.url.searchParams.get("error")`, pass as a `serverError` prop.
- `src/db/database.types.ts:174-191` (`Constants.public.Enums`) — the single source of truth for
  `maintenance_category`/`maintenance_importance`/`maintenance_frequency_unit` literal values; the zod schema
  must read from here, not hand-duplicate the lists.
- `components.json` — shadcn "new-york" style already configured; `button.tsx`, `select.tsx`, `alert-dialog.tsx`,
  `calendar.tsx`, `popover.tsx`, and `sonner.tsx` are already installed (the last five via the shared prep step
  above) — only `Dialog` is net-new to this slice.
- `context/changes/manage-maintenance-tasks/research.md` (Follow-up Research 2026-09-04) — records the decisions
  behind this patch: `react-day-picker` adopted for `last_done_date` in both S-01 and S-02 (UX consistency over
  the marginal dependency cost), and `sonner` adopted for mutation-outcome feedback in both slices, without
  replacing the existing native-POST/redirect/inline-dialog-error architecture.

## What We're NOT Doing

- Full FR-011 CRUD API (S-03, `maintenance-tasks-api`) — this slice adds only `POST /api/tasks`, on a path S-03
  can extend later.
- View/edit/delete of existing tasks (S-02, `manage-maintenance-tasks`).
- `react-hook-form`, `@hookform/resolvers`, or any component-testing library (e.g. React Testing Library) — not
  needed given the chosen hand-rolled + zod approach and Vitest-only unit test scope.
- Retrofitting `export const prerender = false;` onto the existing auth routes — only the new route added here
  gets it.
- Preserving submitted form field values across a validation-error redirect — matches existing auth-form UX
  (fields reset; only the error message persists).
- Any client-side fetch/SPA-style submission — the form is a native `POST` with a full-page redirect, like every
  existing form in the repo.
- Category filtering, notifications, or any other PRD Non-Goal.

## Implementation Approach

Three phases, each independently testable, following data → business logic → API → UI ordering (the data model
already exists from F-01):

1. **Business logic** (`src/lib/status.ts`): pure functions computing due date and status from a task's stored
   fields, plus the urgency sort comparator. No I/O, fully unit-testable, no dependency on the other phases.
1. **Validation + API** (`src/lib/task-schema.ts`, `src/pages/api/tasks/index.ts`): a zod schema shared by the
   client form and the server route, and a `POST /api/tasks` handler that validates, checks auth itself, and
   inserts via the RLS-scoped Supabase client.
1. **UI** (`src/pages/dashboard.astro`, `src/components/tasks/AddTaskDialog.tsx`): query the user's tasks, run
   them through Phase 1's functions, render the sorted list (or empty state), and wire up the add-task modal from
   Phase 2's schema/route.

## Critical Implementation Details

**Future-date validation must be evaluated per-request, not baked in at module load.** Cloudflare Workers can
keep a module's top-level scope alive across multiple requests in the same isolate. Writing the "no future
last-done date" rule as `z.coerce.date().max(new Date())` at module scope captures `new Date()` once, at whatever
moment the isolate happened to load the module — not at request time. The rule must instead be a
`.refine((date) => date <= new Date(), ...)` (or equivalent), which calls `new Date()` inside the callback,
evaluated fresh on every `parse`/`safeParse` call.

**`POST /api/tasks` must check `context.locals.user` itself.** `src/middleware.ts`'s `PROTECTED_ROUTES` list only
matches `/dashboard`, so an unauthenticated request to `/api/tasks` is never redirected by middleware the way
`/dashboard` is. The route handler must redirect to `/auth/signin` (or reject) itself when `context.locals.user`
is `null`, before touching the request body — otherwise this is the first API route in the repo with no auth
gate at all, on a route that writes data.

**The add-task dialog must reopen itself when the URL carries a server error.** Because submission is a native
form POST + full-page redirect (matching the rest of the repo), a server-side validation failure lands the user
back on `/dashboard?error=...` with the dialog's React state freshly mounted (closed by default). The dialog's
open state must default to `true` when `Astro.url.searchParams.get("error")` is non-null (read in
`dashboard.astro`, passed down as a prop), mirroring how `signin.astro`/`signup.astro` already pass a
`serverError` prop — otherwise the error redirect is silent and the user sees a plain dashboard with no visible
feedback.

**A successful add must fire a `sonner` toast, without replacing the existing error/dialog-reopen mechanism.**
Per the S-02 compatibility research's Decision 3 (`context/changes/manage-maintenance-tasks/research.md`),
mutation *outcomes* get a toast; field-level validation stays on the existing inline-dialog-reopen path above —
the two are not redundant, so this does not become an "error toast + error dialog" double-up. Concretely:
`src/pages/api/tasks/index.ts`'s success branch redirects to `/dashboard?success=task-added` (rather than a bare
`/dashboard`). `sonner`'s `toast()` is an imperative function, not a React hook — it writes to an external store
that the already-mounted `<Toaster client:load />` (`Layout.astro`) subscribes to, so firing it needs no React
component or hydration boundary of its own. `dashboard.astro` therefore adds a small inline module `<script>`
(not a new React island) that reads `new URLSearchParams(location.search)`, calls
`toast.success("Task added")` from `"sonner"` when `success` is present, and immediately calls
`history.replaceState(null, "", location.pathname)` to strip the param — otherwise a plain page refresh would
resend `?success=task-added` and refire the toast every time. No toast is added for the validation-error path;
the reopened dialog with its inline message already covers that outcome.

## Phase 1: Status & Due-Date Computation

### Overview

Pure business logic: given a task's `frequency_value`, `frequency_unit`, and `last_done_date`, compute its due
date and status (OK / DUE_SOON / OVERDUE per FR-008/FR-009's fixed 7-day threshold), and provide the comparator
used to sort tasks by urgency (FR-010).

### Changes Required

#### 1. Dependency already installed

**Intent**: `date-fns` is a direct dependency already (pulled in as `react-day-picker`'s dependency by the shared
`chore(m2l4): install shared shadcn primitives for S-01/S-02` prep commit, at the version this slice's own
research selected — v4) — no install step needed before writing `src/lib/status.ts`.

**Contract**: Import `date-fns` directly in `src/lib/status.ts`; do not re-run `npm install date-fns`.

#### 2. Status/due-date module

**File**: `src/lib/status.ts`

**Intent**: Compute a task's due date from its frequency and last-done date, derive its status against a fixed
7-day DUE SOON threshold, and provide a comparator that orders tasks OVERDUE → DUE_SOON → OK, then HIGH → MEDIUM
→ LOW importance within each status group.

**Contract**: Exports `computeDueDate(lastDoneDate: Date, frequencyValue: number, frequencyUnit: MaintenanceFrequencyUnit): Date` (using `date-fns`' `addDays`/`addWeeks`/`addMonths`/`addYears`, switching on the
singular `day|week|month|year` literals — see `date-fns-api-docs.md`); `computeStatus(dueDate: Date, today: Date): TaskStatus` using `differenceInCalendarDays` against a `DUE_SOON_THRESHOLD_DAYS = 7` constant, implementing FR-009's
exact rule (`< today` → OVERDUE; `today..today+7` inclusive → DUE_SOON; beyond → OK); and
`compareByUrgency(a: MaintenanceTaskWithStatus, b: MaintenanceTaskWithStatus): number` ranking status then
importance. This repo's ESLint config doesn't enable `@typescript-eslint/switch-exhaustiveness-check`, and
`noImplicitReturns` is off in `tsconfig.json` — so a plain `default`-less switch would NOT fail to compile if a
future enum value went unhandled (per the exhaustiveness gap noted in `research.md`). Guard `computeDueDate`
against that with an explicit `default` branch that assigns the narrowed value to a `never`-typed variable —
e.g. `const _exhaustive: never = frequencyUnit;` followed by `throw new Error(...)` inside `default:` — this is a
genuine TS type error if a case is missing, independent of the ESLint/tsconfig gaps above.

#### 3. Shared types

**File**: `src/types.ts`

**Intent**: Give the computed status a shared type so `status.ts`, the dashboard, and the dialog all reference
the same vocabulary.

**Contract**: Add `export type TaskStatus = "OK" | "DUE_SOON" | "OVERDUE";` and
`export type MaintenanceTaskWithStatus = MaintenanceTask & { dueDate: Date; status: TaskStatus };`.

#### 4. Unit tests

**File**: `src/lib/status.test.ts`

**Intent**: Cover `computeDueDate` (each frequency unit, plus the `addMonths` month-end clamp gotcha),
`computeStatus` (the OVERDUE/DUE_SOON/OK boundaries at exactly today, exactly +7 days, +8 days, -1 day), and
`compareByUrgency` (status takes priority over importance; importance breaks ties within a status).

**Contract**: `describe`/`it("should ...")` Vitest style, colocated, matching `src/lib/utils.test.ts`'s convention.

### Success Criteria

#### Automated Verification

- Unit tests pass: `npm run test`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`

#### Manual Verification

- Manually trace 3 worked examples against PRD FR-008/FR-009's business rule table (a task due in exactly 7 days,
  a task 1 day overdue, a monthly task last done on Jan 31) using a scratch script or the Vitest UI, confirming
  each matches the table by hand, not just by the test's own assertion.

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 2.

______________________________________________________________________

## Phase 2: Add-Task Validation & API

### Overview

A zod schema shared between the client form and the server route, and a `POST /api/tasks` handler that validates,
enforces its own auth check, and inserts the new task scoped to the authenticated user.

### Changes Required

#### 1. Install dependency

**Intent**: `zod` is not a direct dependency of this repo — it happens to be reachable today only transitively
(pulled in by another package), which is fragile and could disappear on a future lockfile change.

**Contract**: Run `npm install zod` before writing `src/lib/task-schema.ts`, pinning it as a direct dependency
in `package.json`.

#### 2. Validation schema

**File**: `src/lib/task-schema.ts`

**Intent**: Validate the five add-task fields with one schema reusable on both the client (pre-submit hint) and
the server (authoritative), sourcing enum values from the generated `Constants` rather than hand-duplicating them.

**Contract**: `export const addTaskSchema = z.object({ name, category, importance, frequency_value, frequency_unit, last_done_date })`, with field names matching `MaintenanceTaskInsert` exactly (no camelCase
mapping layer). `category`/`importance`/`frequency_unit` are `z.enum(Constants.public.Enums.maintenance_category)`
etc. `frequency_value` is `z.coerce.number().int().positive(...)` (mirrors the DB's `check (frequency_value > 0)`).
`last_done_date` is `z.coerce.date()` with a `.refine` rejecting any date after "now" (evaluated per-call — see
Critical Implementation Details). Export the inferred `AddTaskInput` type.

#### 3. API route

**File**: `src/pages/api/tasks/index.ts`

**Intent**: Accept the add-task form submission, validate it, and insert it for the authenticated user only.

**Contract**: `export const prerender = false;` plus a `POST: APIRoute` handler mirroring
`src/pages/api/auth/signup.ts`'s shape: redirect to `/auth/signin` if `context.locals.user` is `null` (see
Critical Implementation Details — this route is not covered by `PROTECTED_ROUTES`); parse `formData()`;
`addTaskSchema.safeParse(...)` the raw fields; on failure, `context.redirect('/dashboard?error=' + encodeURIComponent(<first issue's message>))`; on success, insert via `createClient(...).from("maintenance_tasks") .insert({ ...parsed, user_id: user.id })`; redirect to `/dashboard?success=task-added` on success (see Critical
Implementation Details — the toast-on-mount island reads this) or `/dashboard?error=...` if the insert itself
fails (e.g. Supabase misconfigured, matching `signup.ts`'s "Supabase is not configured" branch).

#### 4. API route unit tests

**File**: `src/pages/api/tasks/index.test.ts`

**Intent**: Automate coverage of the route's self-checked auth gate — the property this plan's own Critical
Implementation Details flags as the phase's biggest risk, since `PROTECTED_ROUTES` middleware doesn't cover
`/api/*`. Manual REST-client checks alone would let a future refactor silently drop the null-user check with
nothing to catch it.

**Contract**: Mock `@/lib/supabase`'s `createClient` (following `src/lib/supabase.test.ts`'s existing
`vi.hoisted()` + dynamic-import convention for modules with side-effecting top-level state) and construct a
minimal stand-in for Astro's `APIContext` (`locals.user`, `request.formData()`, `redirect()`, `cookies`). Two
cases: (1) `locals.user: null` — assert the handler redirects to `/auth/signin` and the mocked Supabase client's
`insert` is never called; (2) `locals.user` set + valid form data — assert `insert` is called with the parsed
fields plus `user_id: user.id`, and the handler redirects to `/dashboard?success=task-added`.

#### 5. Schema unit tests

**File**: `src/lib/task-schema.test.ts`

**Intent**: Cover the schema's accept/reject behavior independent of the route.

**Contract**: Cases for a fully valid payload, a missing/blank `name`, a non-positive `frequency_value`, an
invalid enum value, and a future `last_done_date` — each asserting `safeParse(...).success` and, for failures,
that the relevant issue is present.

### Success Criteria

#### Automated Verification

- Unit tests pass: `npm run test`
- API route auth-check and happy-path unit tests pass (`src/pages/api/tasks/index.test.ts`)
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build succeeds under the Cloudflare adapter: `npm run build`

#### Manual Verification

- With an authenticated session cookie, POST valid form-data to `/api/tasks` (e.g. via a REST client) and confirm
  a redirect to `/dashboard` and a new row scoped to that user in Supabase Studio.
- Repeat with no session cookie and confirm the route redirects to `/auth/signin` rather than inserting a row.
- POST a payload with a future `last_done_date` and confirm the redirect carries the validation error.

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 3.

______________________________________________________________________

## Phase 3: Dashboard & Add-Task Dialog

### Overview

Render the user's tasks (or an empty state) on the dashboard, sorted by urgency, and wire up the add-task modal
that submits to Phase 2's route.

### Changes Required

#### 1. Dashboard page

**File**: `src/pages/dashboard.astro`

**Intent**: Replace the placeholder welcome content with the real task list: query the user's tasks, compute
each one's due date/status via `src/lib/status.ts`, sort by `compareByUrgency`, and render the list or an
empty-state message. Read the `error` query param and pass it into the dialog as `serverError`.

**Contract**: Server-side frontmatter query (`await createClient(...).from("maintenance_tasks").select("*")`,
relying on RLS for the user scope — no redundant `.eq("user_id", ...)`), mapped through `computeDueDate` +
`computeStatus` into `MaintenanceTaskWithStatus[]`, sorted with `compareByUrgency`, rendered as a list (task name,
category, importance, computed status label, due date) with an "Add task" trigger button. When the list is
empty, render a short message (e.g. "No maintenance tasks yet.") alongside the same trigger button — no separate
empty-state component. Also includes an inline module `<script>` (see Critical Implementation Details) reading
`location.search` client-side for `?success=task-added` and firing the `sonner` toast — no new React component
or `client:*` island for this; the existing `<Toaster client:load />` in `Layout.astro` renders it.

#### 2. Add-task dialog

**File**: `src/components/tasks/AddTaskDialog.tsx`

**Intent**: A self-contained React island — new `src/components/tasks/` folder, not reusing or refactoring
`src/components/auth/*` — providing the modal form: shadcn `Dialog` (net-new, `npx shadcn add dialog`) wrapping a
native `<form method="POST" action="/api/tasks">`, with shadcn `Select` (already installed) for
`category`/`importance`/`frequency_unit`, a plain labeled input for `name`/`frequency_value`, and a
`react-day-picker`-backed date field for `last_done_date` (shadcn `Calendar` + `Popover`, both already installed —
a trigger button showing the formatted selected date, opening a `Popover` containing the `Calendar`; the
`Calendar`'s `disabled` prop excludes future dates client-side as a UX nicety, mirroring but not replacing the
schema's own server-side future-date `.refine`). The `Calendar`'s selected `Date` is serialized to the
`YYYY-MM-DD` string the native form POST and `addTaskSchema` both expect via `date-fns`' `format(date, "yyyy-MM-dd")`
in a hidden `<input type="hidden" name="last_done_date">`, since `react-day-picker` itself has no form-native
`<input>` to submit. Client-side, `addTaskSchema.safeParse` runs on submit; on failure, `preventDefault()` and
show per-field errors (mirroring `SignUpForm.tsx`'s `validate()` pattern but backed by the shared zod schema); on
success, let the native POST proceed. Accepts a `serverError?: string | null` prop; the dialog's `open` state
defaults to `true` when `serverError` is non-null (see Critical Implementation Details), otherwise defaults to
`false` and opens via the trigger button.

### Success Criteria

#### Automated Verification

- Unit tests pass: `npm run test`
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- Sign in with no existing tasks: confirm the empty-state message and "Add task" button both render.
- Add 3 tasks spanning all three statuses and varying importance; confirm they render sorted OVERDUE → DUE_SOON →
  OK, then HIGH → MEDIUM → LOW within each group.
- Submit the dialog with a blank name and with a future last-done date; confirm the redirect reopens the dialog
  with the corresponding error visible.
- Submit a valid task and confirm a "Task added" toast appears on the dashboard (and does not reappear on a
  plain page refresh once the `?success=` param is gone from the URL).
- Pick a `last_done_date` via the calendar popup and confirm the same date reaches Supabase (no off-by-one from
  timezone handling in the `date-fns` `format` call).
- Sign in as a second test user and confirm their dashboard shows zero tasks from the first user.
- Check the dashboard and dialog at a mobile viewport width and in at least two browsers, per the NFR on
  cross-browser/device usability.

**Implementation Note**: This completes S-01. Pause here for final manual confirmation before closing out the
change.

______________________________________________________________________

## Testing Strategy

### Unit Tests

- `computeDueDate`/`computeStatus`/`compareByUrgency` (Phase 1) — all frequency units, the `addMonths` clamp, and
  every status-boundary and sort-tiebreak case.
- `addTaskSchema` (Phase 2) — valid payload, each field's rejection case, including the future-date rule.
- `POST /api/tasks` route handler (Phase 2) — null-user redirect (no insert call), and a valid-user happy path
  (insert called with the right payload, redirect to `/dashboard`).

### Integration Tests

- None planned — no integration test runner is configured in this repo (Vitest only); the manual verification
  steps in Phases 2–3 cover the API route and end-to-end add-task flow instead.

### Manual Testing Steps

1. Empty-dashboard first-session flow (empty state → add first task → see it prioritized), confirming the
   "Task added" toast fires on success.
1. Multi-task sort ordering across all status/importance combinations.
1. Validation-error redirect (blank field, future date) reopening the dialog with the error shown.
1. Calendar date-picker round-trip (pick a date, confirm it's stored and displayed without an off-by-one shift).
1. Cross-user isolation on the dashboard.
1. Mobile viewport + cross-browser check.

## Performance Considerations

None beyond what's already true: a single per-user Supabase query plus an in-memory sort over a small task list
(NFR target scale is "small" data volume, "low" QPS) — no pagination or caching needed at this scale.

## Migration Notes

None — no schema changes; F-01's migration already shipped the table and RLS this slice reads/writes against.

## References

- Internal research: `context/changes/first-task-on-dashboard/research.md`
- External research: `context/changes/first-task-on-dashboard/external-research.md`
- date-fns API reference: `context/changes/first-task-on-dashboard/date-fns-api-docs.md`
- Upstream schema: `context/changes/maintenance-task-data-model/plan.md`
- Existing form pattern: `src/components/auth/SignUpForm.tsx`, `src/pages/api/auth/signup.ts`
- Date-picker/toast decisions (this patch): `context/changes/manage-maintenance-tasks/research.md`
  ("Follow-up Research 2026-09-04")

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append `— <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Status & Due-Date Computation

#### Automated

- [ ] 1.1 Unit tests pass: `npm run test`
- [ ] 1.2 Type checking passes: `npx astro check`
- [ ] 1.3 Linting passes: `npm run lint`

#### Manual

- [ ] 1.4 Manually traced 3 worked examples against PRD FR-008/FR-009's business rule table

### Phase 2: Add-Task Validation & API

#### Automated

- [ ] 2.1 Unit tests pass: `npm run test`
- [ ] 2.2 API route auth-check and happy-path unit tests pass (`src/pages/api/tasks/index.test.ts`)
- [ ] 2.3 Type checking passes: `npx astro check`
- [ ] 2.4 Linting passes: `npm run lint`
- [ ] 2.5 Build succeeds under the Cloudflare adapter: `npm run build`

#### Manual

- [ ] 2.6 Authenticated POST to `/api/tasks` redirects to `/dashboard` and inserts a row scoped to that user
- [ ] 2.7 Unauthenticated POST redirects to `/auth/signin` instead of inserting
- [ ] 2.8 Future `last_done_date` POST redirects with the validation error

### Phase 3: Dashboard & Add-Task Dialog

#### Automated

- [ ] 3.1 Unit tests pass: `npm run test`
- [ ] 3.2 Type checking passes: `npx astro check`
- [ ] 3.3 Linting passes: `npm run lint`
- [ ] 3.4 Build succeeds: `npm run build`

#### Manual

- [ ] 3.5 Empty-state message + "Add task" button render with zero tasks
- [ ] 3.6 3 tasks across all statuses/importances render sorted per FR-010
- [ ] 3.7 Blank-name and future-date submissions reopen the dialog with the error visible
- [ ] 3.8 Valid submission shows a "Task added" toast, not repeated on refresh
- [ ] 3.9 Calendar-picked `last_done_date` reaches Supabase without an off-by-one date shift
- [ ] 3.10 Second test user sees zero tasks from the first user
- [ ] 3.11 Mobile viewport + cross-browser check
