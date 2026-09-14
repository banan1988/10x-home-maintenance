---
date: 2026-09-14T22:08:54+02:00
researcher: banan1988
git_commit: 17619421732bff4c2e17f4b9dd721d2993bda919
branch: feature/toast-next-due-message
repository: 10x-home-maintenance
topic: "What does 'Mark done' do on the tasks page, when does it make sense, and what does it mean in the database?"
tags: [research, codebase, tasks, maintenance-tasks, toast, mark-done]
status: complete
last_updated: 2026-09-14
last_updated_by: banan1988
---

# Research: "Mark done" behavior on the tasks page

**Date**: 2026-09-14T22:08:54+02:00
**Researcher**: banan1988
**Git Commit**: 17619421732bff4c2e17f4b9dd721d2993bda919
**Branch**: feature/toast-next-due-message
**Repository**: 10x-home-maintenance

## Research Question

Original question: "Co robi Mark Done na stronie tasks? Kiedy on ma sens i co oznacza w bazie?" ("What does Mark
Done do on the tasks page? When does it make sense, and what does it mean in the database?")

This research was run retroactively, after the "toast-next-due-message" change (showing the next due interval
in the completion toast, and repositioning the toast to top-right below the header) was already implemented in
the working tree. It documents the current end-to-end behavior of "Mark done" — including that new toast
logic — and specifically investigates when the action makes semantic sense and what edge cases exist.

## Summary

"Mark done" is a plain HTML form (`method="POST"`, full-page navigation, no client-side fetch) that hits
`POST /api/tasks/[id]/complete`. The route updates exactly one column — `maintenance_tasks.last_done_date`,
set to the server's current date — and redirects back to `/tasks` with query params that now also carry the
task's `frequency_value`/`frequency_unit` so the client can render a toast like "Task completed — see you in
2 weeks" instead of a generic message.

There is **no `status` or `completed` column anywhere** in the schema. The `OK`/`DUE_SOON`/`OVERDUE` status
shown in the UI is purely derived at read time from `last_done_date` + `frequency_value`/`frequency_unit`, on
every page render, never persisted. "Mark done" is therefore semantically identical to editing `last_done_date`
to today via the full edit form — it's a one-click shortcut for that single field, nothing more.

The action is unconditional and has **zero semantic guardrails** by deliberate product decision: it's rendered
for every task regardless of current status, has no confirmation dialog, and nothing stops it from pulling a
task's due date backwards even when the task isn't due yet. This was a conscious trade-off (documented in
`context/changes/manage-maintenance-tasks/plan.md:74`: the one-click design "trades away a confirm [step]").

## Detailed Findings

### UI trigger — `src/components/tasks/TaskList.tsx`

The button is a plain form per row, not a JS handler (`TaskList.tsx:107-111`):

```tsx
<form method="POST" action={`/api/tasks/${task.id}/complete`} className="inline">
  <Button type="submit" variant="secondary" size="sm">
    Mark done
  </Button>
</form>
```

It's rendered unconditionally for **every** task row regardless of `task.status` — there is no disabled state,
no confirmation, and no visual distinction for a task that isn't due yet.

The toast message is resolved by `resolveSuccessMessage` (`TaskList.tsx:26-33`), which prefers a
frequency-aware message when `next`/`unit` query params are present and valid, falling back to the old generic
map otherwise:

```tsx
const SUCCESS_MESSAGES: Record<string, string> = {
  "task-updated": "Task updated",
  "task-deleted": "Task deleted",
  "task-completed": "Task completed",
};

function resolveSuccessMessage(success: string, next?: string | null, unit?: string | null): string {
  const frequencyValue = next ? Number(next) : NaN;
  const normalizedUnit = unit ?? null;
  if (success === "task-completed" && !Number.isNaN(frequencyValue) && isFrequencyUnit(normalizedUnit)) {
    return formatCompletionMessage(frequencyValue, normalizedUnit);
  }
  return SUCCESS_MESSAGES[success] ?? "Success";
}
```

Fired from a `useEffect` that also scrubs all five query params (`success`, `error`, `editing`, `next`, `unit`)
from the URL via `history.replaceState` after showing the toast (`TaskList.tsx:40-53`).

### Page wiring — `src/pages/tasks/index.astro`

Reads and forwards the query params as props (`index.astro:9-13,36`):

```astro
const success = Astro.url.searchParams.get("success");
const error = Astro.url.searchParams.get("error");
const editing = Astro.url.searchParams.get("editing");
const next = Astro.url.searchParams.get("next");
const unit = Astro.url.searchParams.get("unit");
...
<TaskList tasks={tasks} success={success} error={error} editing={editing} next={next} unit={unit} client:load />
```

Task list itself is fetched and status-annotated per request at `index.astro:17-27` (see status derivation
below) — this is what re-renders after the POST/redirect round-trip.

### API route — `src/pages/api/tasks/[id]/complete.ts` (full file, 39 lines)

```ts
export const POST: APIRoute = async (context) => {
  const user = requireUser(context);
  if (user instanceof Response) return user;

  if (!context.params.id) {
    return context.redirect(NOT_FOUND_REDIRECT);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/tasks?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const today = format(new Date(), "yyyy-MM-dd");

  // Ownership enforced by RLS, not this filter — see
  // supabase/migrations/20260827194321_create_maintenance_tasks.sql
  const { data, error } = await supabase
    .from("maintenance_tasks")
    .update({ last_done_date: today })
    .eq("id", context.params.id)
    .select();

  if (error || data.length === 0) {
    return context.redirect(NOT_FOUND_REDIRECT);
  }

  const { frequency_value, frequency_unit } = data[0];
  return context.redirect(`/tasks?success=task-completed&next=${frequency_value}&unit=${frequency_unit}`);
};
```

Key behaviors:

- Auth gate via `requireUser` (`complete.ts:11`, see below) — no explicit body/schema validation, since the
  only "input" is the `id` path param and the date is computed server-side.
- The `.eq("id", ...)` filter has no `user_id` clause — ownership isolation is entirely deferred to the RLS
  `update` policy (comment at `complete.ts:25-26`, per the repo's "RLS-only ownership filters need an explicit
  code comment" lesson).
- Not-found path (`complete.ts:33-35`) fires identically for a nonexistent id AND another user's id (blocked by
  RLS, `data.length === 0`) — same generic redirect either way, confirmed by
  `complete.test.ts:98-110` ("should produce the same generic not-found redirect for another user's task as
  for a nonexistent one").
- Success redirect now forwards the just-updated row's own `frequency_value`/`frequency_unit` — no extra query
  needed, since `.select()` already returns them.

### Pure helper — `src/lib/format-completion-message.ts`

```ts
const FREQUENCY_UNITS: MaintenanceFrequencyUnit[] = ["day", "week", "month", "year"];

export function isFrequencyUnit(value: string | null): value is MaintenanceFrequencyUnit {
  return FREQUENCY_UNITS.includes(value as MaintenanceFrequencyUnit);
}

export function formatCompletionMessage(frequencyValue: number, frequencyUnit: MaintenanceFrequencyUnit): string {
  const unitLabel = frequencyValue === 1 ? frequencyUnit : `${frequencyUnit}s`;
  return `Task completed — see you in ${frequencyValue} ${unitLabel}`;
}
```

`isFrequencyUnit` is a type guard narrowing an untrusted query-string value; `formatCompletionMessage` just
singular/pluralizes the unit label — no date arithmetic, it reuses the task's own configured interval directly
rather than recomputing a due date. Covered by `format-completion-message.test.ts` (11 cases: singular/plural
for each of day/week/month/year, plus `isFrequencyUnit` accept/reject cases including `null` and an unrelated
string).

### Toast positioning — `src/components/ui/sonner.tsx` + `src/layouts/Layout.astro`

`Layout.astro:46`: `<Toaster position="top-right" offset={{ top: 64 }} client:load />` — moved from Sonner's
default `bottom-right` to `top-right`, with a 64px top offset to clear the app's header (`Header.astro`,
`py-3` + `text-sm` content, ≈44px tall) rather than overlapping it.

### Auth gate — `src/lib/auth.ts` (full file)

```ts
export function requireUser(context: APIContext): User | Response {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }
  return context.locals.user;
}
```

Populated from `context.locals.user`, set by `src/middleware.ts` on every request from the Supabase session
cookie.

### Types — `src/types.ts` (full file)

```ts
export type MaintenanceTask = Database["public"]["Tables"]["maintenance_tasks"]["Row"];
export type MaintenanceTaskInsert = Database["public"]["Tables"]["maintenance_tasks"]["Insert"];
export type MaintenanceTaskUpdate = Database["public"]["Tables"]["maintenance_tasks"]["Update"];

export type MaintenanceCategory = Database["public"]["Enums"]["maintenance_category"];
export type MaintenanceImportance = Database["public"]["Enums"]["maintenance_importance"];
export type MaintenanceFrequencyUnit = Database["public"]["Enums"]["maintenance_frequency_unit"];

export type TaskStatus = "OK" | "DUE_SOON" | "OVERDUE";
export type MaintenanceTaskWithStatus = MaintenanceTask & { dueDate: Date; status: TaskStatus };
```

`TaskStatus` is a pure TypeScript union — never a DB column. `MaintenanceFrequencyUnit`'s three variants
(`day`/`week`/`month`/`year`) happen to already be plain English singular nouns, which is why
`formatCompletionMessage` needs no separate label-mapping table.

### Database schema — `supabase/migrations/`

`20260827194321_create_maintenance_tasks.sql` (creation):

```sql
create type maintenance_frequency_unit as enum ('day', 'week', 'month', 'year');

create table maintenance_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  category maintenance_category not null,
  importance maintenance_importance not null,
  frequency_value integer not null check (frequency_value > 0),
  frequency_unit maintenance_frequency_unit not null,
  last_done_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

RLS (same migration, lines 48-73): `select`/`insert`/`update`/`delete` policies all gated on
`auth.uid() = user_id` — this is what makes `complete.ts`'s ownership-less `.eq("id", ...)` filter safe.

`20260914200000_cap_maintenance_tasks_frequency_value.sql` (today's date — added alongside this change):

```sql
alter table maintenance_tasks
  add constraint maintenance_tasks_frequency_value_max_check check (frequency_value <= 1000);
```

So the DB-level constraint is `1 <= frequency_value <= 1000`. No `status`, `completed`, `completed_at`, or
`next_due_date` column exists or has ever existed — confirmed by design intent in
`context/changes/maintenance-task-data-model/plan.md:62`: *"No `next_due_date` or `status` columns, generated
columns, or SQL functions — status/due-date computation is [done in application code]."*

### Status/due-date derivation — `src/lib/status.ts`

```ts
export const DUE_SOON_THRESHOLD_DAYS = 7;

export function computeDueDate(lastDoneDate: Date, frequencyValue: number, frequencyUnit: MaintenanceFrequencyUnit): Date {
  switch (frequencyUnit) {
    case "day": return addDays(lastDoneDate, frequencyValue);
    case "week": return addWeeks(lastDoneDate, frequencyValue);
    case "month": return addMonths(lastDoneDate, frequencyValue);
    case "year": return addYears(lastDoneDate, frequencyValue);
    default: { const _exhaustive: never = frequencyUnit; throw new Error(`Unhandled frequency unit: ${_exhaustive}`); }
  }
}

export function computeStatus(dueDate: Date, today: Date): TaskStatus {
  const daysUntilDue = differenceInCalendarDays(dueDate, today);
  if (daysUntilDue < 0) return "OVERDUE";
  if (daysUntilDue <= DUE_SOON_THRESHOLD_DAYS) return "DUE_SOON";
  return "OK";
}
```

The DUE_SOON window is 8 calendar days wide (today through today+7). `compareByUrgency` sorts by status rank
(`OVERDUE:0, DUE_SOON:1, OK:2`) then importance rank (`high:0, medium:1, low:2`).

Called fresh on every request at three sites — `src/pages/tasks/index.astro:23-25`,
`src/pages/dashboard.astro:24-27`, and `src/lib/task-dto.ts:6-13` (the `/api/v1/tasks` JSON path) — all now
standardized on `parseISO(task.last_done_date)` after a previously-shipped bug (see Historical Context) where
`dashboard.astro` used `parseISO` while the other two used `new Date(string)`, causing the same task to show a
different status on different pages at timezone edges.

`status.test.ts` documents exact-boundary coverage (`today-1`→OVERDUE, `today`→DUE_SOON, `today+7`→DUE_SOON,
`today+8`→OK) and an extreme-value case: `frequency_value = 100_000_000` days makes `computeDueDate` silently
return an `Invalid Date` (no throw), which then crashes downstream `format(dueDate, "yyyy-MM-dd")` calls with
`RangeError: Invalid time value`.

### Validation — `src/lib/task-schema.ts`

`frequency_value`: `z.coerce.number().int().positive().max(1000, "Frequency must be 1000 or less")` — the cap
exists specifically so it stays far below the ~100,000,000-day overflow threshold above. `last_done_date`:
`z.string().max(10).transform(parseISO).refine(!isNaN).refine(date => date <= addDays(new Date(), 1), "...cannot be in the future")` —
the `+1 day` grace window absorbs client/server timezone skew on **manual edits**. No lower bound — arbitrarily
old dates are valid.

`complete.ts` bypasses this schema entirely: it never validates a client-supplied date because it computes
`today` itself server-side. That also means it doesn't get the timezone-skew grace window that manual edits
get (see Open Questions).

## When "Mark done" makes sense — and where it doesn't guard anything

**Semantically correct usage**: confirming "I just did this maintenance task today," equivalent to editing
`last_done_date` to today via the full form (PRD FR-005). Most meaningful on `OVERDUE`/`DUE_SOON` tasks — the
only scenario the implementation plan's manual verification actually exercises
(`context/changes/manage-maintenance-tasks/plan.md:497-498`: "Click 'Mark done' on an OVERDUE task; confirm it
recomputes to OK... with today as its last-done date").

**Deliberate absence of guardrails** (per `plan.md:74`: the one-click design "trades away a confirm [step]"):

1. **No status check before allowing the action.** The button renders for every row regardless of
   `task.status` (`TaskList.tsx:107-111`). Marking done a task that's `OK` and far from due silently pulls its
   due date backwards to `today + frequency` — shortening its cycle rather than confirming anything.
1. **No guard against accidental repeated/rapid clicks.** Same-day double-clicks are a harmless no-op (both
   writes set the same date string), but no confirmation or undo exists if clicked in error on a different
   day — there's no completion history/audit trail (PRD FR-007 notes history tracking isn't in scope).
1. **Ownership/not-found ambiguity is intentional**, not a gap — same generic redirect for "doesn't exist" and
   "not yours," verified by test.
1. **Indirect crash risk on legacy rows.** `complete.ts` itself can't overflow (it only writes
   `last_done_date`), but the *next* `/tasks` render recomputes `computeDueDate` from that row's existing
   `frequency_value`. A row written before the `.max(1000)` cap migration (or via any write path that bypasses
   the two zod-guarded routes) could still carry an unbounded `frequency_value` and crash the post-completion
   redirect's render.
1. **Timezone skew on the completion write itself.** `complete.ts:23` computes `today` from the server's
   (UTC) clock with no grace window — unlike manual edits, which get the 1-day future-date grace window in
   `task-schema.ts`. A user just past their own local midnight but before UTC midnight who clicks "Mark done"
   gets the server's "yesterday" written, which could read as not-done-today from their own perspective. Not
   covered by any existing test.

## Code References

- `src/components/tasks/TaskList.tsx:11-15,26-33,40-53,107-111` — success-message map, `resolveSuccessMessage`, toast effect, the button/form itself
- `src/pages/tasks/index.astro:9-13,17-27,36` — query param plumbing and per-request status computation
- `src/pages/api/tasks/[id]/complete.ts:1-39` — the whole route (auth gate, update, redirect construction)
- `src/pages/api/tasks/[id]/complete.test.ts:34-66,98-110` — success-redirect assertions incl. `next`/`unit`, cross-user not-found parity
- `src/lib/format-completion-message.ts:1-12` and `.test.ts` — pluralization helper + type guard, fully unit-tested
- `src/components/ui/sonner.tsx:5-28`, `src/layouts/Layout.astro:46` — Toaster config, now `position="top-right"` `offset={{ top: 64 }}`
- `src/lib/auth.ts:1-9` — `requireUser`
- `src/types.ts:1-12` — `MaintenanceTask`, `MaintenanceFrequencyUnit`, `TaskStatus`, `MaintenanceTaskWithStatus`
- `supabase/migrations/20260827194321_create_maintenance_tasks.sql:3-16,21-32,48-73` — enums, table, RLS
- `supabase/migrations/20260914200000_cap_maintenance_tasks_frequency_value.sql` — `frequency_value <= 1000` cap
- `src/lib/status.ts:5,10-29,31-36,38-40` — `DUE_SOON_THRESHOLD_DAYS`, `computeDueDate`, `computeStatus`, `compareByUrgency`
- `src/lib/status.test.ts` — boundary grid (today-1/today/today+7/today+8) and the 100M-day overflow case
- `src/lib/task-schema.ts:10-27,38-51` — `frequency_value` cap, `last_done_date` future-date grace window

## Architecture Insights

- **Status/due-date are always derived, never persisted** — a deliberate F-01 design decision
  (`context/changes/maintenance-task-data-model/plan.md:62`), traded for simplicity at the cost of every
  consumer needing to parse `last_done_date` identically (see the timezone-divergence bug below).
- **RLS is the only ownership boundary** on mutation routes; this repo has an explicit lesson ("RLS-only
  ownership filters need an explicit code comment") that `complete.ts` already follows.
- **`complete.ts` intentionally has no request-body validation** — it's the one mutation route in this app
  that takes no client input beyond the path `id`, so `task-schema.ts`'s validation rules (future-date grace
  window, frequency cap) don't apply to it and its behavior around timezone skew differs from every other
  write path.
- **The one-click "Mark done" design explicitly trades away confirmation/guardrails** for friction reduction —
  this is a documented product decision (`manage-maintenance-tasks/plan.md:74`), not an oversight, so any
  future guardrail (confirmation dialog, "not due yet" warning) would be a deliberate scope change, not a bug
  fix.
- Existing repo lessons directly relevant to this area (`context/foundation/lessons.md`): every `/api/*` route
  must use `requireUser`/`assertRequiresAuth` (already followed), RLS-only filters need an explicit comment
  (already followed), numeric fields feeding date arithmetic need an explicit `.max()` (already followed via
  the `.max(1000)` cap, though only at the two zod-guarded write paths — not at `complete.ts`, which doesn't
  need it since it never calls `computeDueDate` itself, and not fully at the DB layer for pre-existing rows).

## Historical Context (from prior changes)

- `context/changes/manage-maintenance-tasks/plan-brief.md:10-11,36,40` — frames "Mark done" as "the only pure
  UX layer on top" of the core edit capability: "a one-click shortcut that resets its cycle," explicitly
  prioritized because "the most frequent action should have the least friction."
- `context/changes/manage-maintenance-tasks/plan.md:74,447-502` (Phase 5) — the original implementation spec:
  compute `today` inside the handler (never at module scope, due to Cloudflare Workers isolate reuse risk),
  `update(...).eq("id",...).select()`, generic not-found on empty result or error. Explicitly states the
  one-click design "trades away a confirm [step]" — no confirmation dialog was ever in scope.
- `context/changes/status-date-regression-grid/research.md:32,34,36,88,90,142` and
  `context/changes/status-date-regression-grid/plan.md:107-117` and
  `context/changes/status-date-regression-grid/reviews/impl-review.md:24-35` (finding F1) — documents (a) a
  real, now-fixed cross-page status-divergence bug caused by inconsistent date parsing (`parseISO` vs
  `new Date(string)`), (b) the unbounded `frequency_value`/`last_done_date` combination that can crash
  `format()` on read, partially mitigated by the `.max(1000)` zod cap but not at the DB layer for pre-existing
  or bypassed writes, and (c) that `status.ts` is a single-source-of-truth "by convention, not by any test or
  lint guard."
- `context/foundation/prd.md:97-99,110-119` — FR-005 (editing is core to normal use), FR-008 (`next_due_date`
  always derived from *current* frequency + `last_done_date`; changing frequency doesn't reset the cycle),
  FR-009 (the exact 7-day DUE_SOON boundary rule implemented in `status.ts`), FR-010 (dashboard sort order,
  matching `compareByUrgency`).
- `context/changes/maintenance-task-data-model/plan.md:62` — the original decision to keep status/due-date
  entirely in application code, no DB columns/generated columns/functions for it.

## Related Research

- `context/changes/manage-maintenance-tasks/research.md` and `plan.md` — original build of the tasks CRUD +
  complete flow.
- `context/changes/status-date-regression-grid/research.md` and `plan.md` — status/due-date correctness
  hardening (parsing consistency, boundary tests, overflow documentation).
- `context/changes/maintenance-task-data-model/plan.md` — original schema design rationale (no persisted
  status/due-date).

## Open Questions

- Should "Mark done" show a warning/confirmation when the task isn't due yet (`status !== "OVERDUE"` and
  `status !== "DUE_SOON"`), given it silently shortens the next cycle? Not currently planned — would be a
  deliberate scope change to the documented one-click design.
- Should `complete.ts` get the same 1-day timezone grace window that manual edits get via `task-schema.ts`, or
  is server-UTC-today acceptable for this action specifically? No test currently covers this edge case.
- Should the DB-level `frequency_value <= 1000` cap be backfilled/verified against any pre-existing rows
  written before the migration, to close the "legacy row still unbounded" gap noted in impl-review F1?
- Is a lightweight completion-history/audit trail worth adding, given there's currently no way to see when a
  task was previously marked done, or to undo an accidental click? (PRD FR-007 explicitly excludes this from
  current scope.)
