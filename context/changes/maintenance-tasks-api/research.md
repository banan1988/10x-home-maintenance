---
date: 2026-09-11T17:53:18+0000
researcher: banan1988
git_commit: 58063145bcd2a4b3d7dd01a9c3ececc721cb6f5b
branch: chore/maintenance-tasks-api
repository: banan1988/10x-home-maintenance
topic: "Expose maintenance task CRUD via a public JSON API (S-03 / FR-011)"
tags: [research, codebase, api, maintenance-tasks, auth, rls, zod]
status: complete
last_updated: 2026-09-11
last_updated_by: banan1988
---

# Research: Expose maintenance task CRUD via a public JSON API (S-03 / FR-011)

**Date**: 2026-09-11T17:53:18+0000
**Researcher**: banan1988
**Git Commit**: 58063145bcd2a4b3d7dd01a9c3ececc721cb6f5b
**Branch**: chore/maintenance-tasks-api
**Repository**: banan1988/10x-home-maintenance

## Research Question

What exists today (routes, libs, schema, RLS, tests, prior decisions) that `maintenance-tasks-api` (roadmap S-03,
PRD FR-011 — "User (via API) can perform create/read/update/delete operations on their maintenance tasks") needs
to build on or replace, and what does this project's own history already decide about auth mechanism, response
shape, and reuse of the existing `/api/tasks/*` routes?

## Summary

**There is no JSON API in this codebase today, anywhere.** Every existing route under `src/pages/api/**` (auth:
`signin.ts`/`signup.ts`/`signout.ts`; tasks: `index.ts`, `[id].ts`, `[id]/complete.ts`, `[id]/delete.ts`) is a
POST-only, `formData()`-in / `context.redirect(...)`-out handler built to power native HTML `<form>` submissions
from `dashboard.astro` and `tasks/index.astro` (S-01/S-02). Two prior plans **explicitly, on the record, scoped
these existing routes to exclude FR-011's public API surface** — this is not an oversight to patch, it's a
deliberate deferral to S-03:

> "this plan's POST routes serve the HTML forms only, matching S-01's `POST /api/tasks` precedent, **not a
> public JSON API**." — `context/changes/manage-maintenance-tasks/plan.md:68-69`

There is also currently **no read (GET) endpoint at all** — both `dashboard.astro` and `tasks/index.astro` fetch
`select("*")` directly from Supabase in Astro frontmatter and compute due-date/status client-side via
`src/lib/status.ts`; nothing exposes that as JSON today.

What *is* already settled and reusable:

- **Data model + RLS** (`supabase/migrations/20260827194321_create_maintenance_tasks.sql`) is complete and
  correct for a multi-tenant API: all 4 operations scoped by `auth.uid() = user_id`, granted only to
  `authenticated` (not `anon`), so any route using the app's cookie-session Supabase client inherits isolation
  automatically — no new migration needed.
- **Auth mechanism**: the roadmap's own outcome text for S-03 says "using their own authenticated session"
  (`roadmap.md:152`), and `testing-auth-isolation-contract/research.md:58-60` says S-03 "will need the identical
  auth-check + ownership-defers-to-RLS convention" as the existing routes. Together these are the project's only
  decision on auth mechanism: **reuse the existing Supabase cookie session via `requireUser()`**, not a new
  API-key/Bearer scheme. Nothing anywhere proposes API keys or tokens for S-03.
- **Auth helper** `requireUser(context)` (`src/lib/auth.ts:4-9`) returns `User | Response`, but the `Response` it
  returns on failure is hard-coded to a 302 redirect to `/auth/signin` — not usable as-is for a JSON 401.
- **Validation schema** `addTaskSchema` (`src/lib/task-schema.ts:6-20`) is input-only, has no `.partial()` variant
  for PATCH-style updates, and its `last_done_date` field is a raw string transformed via zod (works fine for
  JSON bodies, not form-data-specific despite `frequency_value`'s `z.coerce.number()`).
- **No output DTOs exist**: `MaintenanceTaskWithStatus` (`src/types.ts:12`) is a plain TS intersection type (DB
  row + computed `dueDate`/`status`), not a runtime-validated schema — a JSON GET response has nothing to reuse
  for serialization and would need `dueDate: Date` turned into a string.

What is **not** decided anywhere in the project's history (PRD, roadmap, test-plan, or any prior plan/research):
JSON response envelope shape, JSON error-body format, or status-code conventions. `test-plan.md` §6.2 documents
only the existing redirect convention; §3's phased rollout table has no row for S-03 (only references it as
context for Phase 1's auth contract and Risk #3's testing bar). This is squarely S-03's own design decision to
make in `/10x-plan`.

## Detailed Findings

### Existing `/api/tasks/*` routes — form-in / redirect-out, POST-only

- `src/pages/api/tasks/index.ts:9` — exports only `POST`. Parses `context.request.formData()` →
  `addTaskSchema.safeParse(Object.fromEntries(form))` (line 14), inserts with `user_id: user.id` from the
  authenticated user (line 29, not from the form — spoof-proofed), redirects to `/dashboard?success=task-added`
  or `?error=...`.
- `src/pages/api/tasks/[id].ts:11` — exports only `POST` (used as "update"). Same formData/zod pattern (lines
  24-32), `.update(parsed.data).eq("id", context.params.id).select()` (lines 41-45) with **no `user_id` filter** —
  a comment (lines 39-40) explicitly notes ownership is enforced by RLS, not this filter. Zero rows or DB error →
  generic `NOT_FOUND_REDIRECT` (`/tasks?error=Task+not+found`, line 9), making cross-user access and a genuinely
  nonexistent id indistinguishable by design.
- `src/pages/api/tasks/[id]/complete.ts:10` — exports only `POST`. No body parsing; sets `last_done_date` to
  today (`format(new Date(), "yyyy-MM-dd")`, line 23), same RLS-only `.eq("id", ...)` pattern and generic
  not-found redirect.
- `src/pages/api/tasks/[id]/delete.ts:9` — exports only `POST`. `.delete().eq("id", context.params.id).select()`
  (line 24), same RLS-only pattern and generic not-found redirect.

**No GET, PATCH, or PUT verb exists on any of these files.** All four are `export const prerender = false` and
`export const POST: APIRoute` only.

### `src/lib/auth.ts:4-9` — `requireUser`

```ts
export function requireUser(context: APIContext): User | Response {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }
  return context.locals.user;
}
```

Every caller uses `if (user instanceof Response) return user;`. The failure branch is a hard-coded 302 page
redirect — there is no existing variant that returns a JSON 401. A JSON API needs either a new helper or a
parameterized version of this one.

### `src/lib/supabase.ts:6-10` — `createClient`

`createClient(requestHeaders: Headers, cookies: AstroCookies)` returns `null` when `SUPABASE_URL`/`SUPABASE_KEY`
aren't configured (from `astro:env/server`). Every existing caller redirects to an error page on `null`; a JSON
route would need its own branch returning a JSON 5xx instead.

### `src/lib/task-schema.ts:6-20` — `addTaskSchema`

```ts
export const addTaskSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200, "..."),
  category: z.enum(Constants.public.Enums.maintenance_category, "Select a valid category"),
  importance: z.enum(Constants.public.Enums.maintenance_importance, "Select a valid importance"),
  frequency_value: z.coerce.number().int().positive("Frequency must be a positive number"),
  frequency_unit: z.enum(Constants.public.Enums.maintenance_frequency_unit, "Select a valid frequency unit"),
  last_done_date: z.string("Pick a last-done date")
    .transform((value) => parseISO(value))
    .refine((date) => !isNaN(date.getTime()), "Invalid date")
    .refine((date) => date <= addDays(new Date(), 1), "Last done date cannot be in the future"),
});
export type AddTaskInput = z.infer<typeof addTaskSchema>;
```

Reusable for JSON bodies as-is for create. No `.partial()` variant exists for PATCH-style partial updates
(`[id].ts` currently requires the full form on every edit). `frequency_value`'s `z.coerce.number()` will also
silently accept a JSON string like `"3"`, not just a number — worth a deliberate call in `/10x-plan` on whether a
strict JSON contract should reject that.

### `src/types.ts` — no output DTOs

- `MaintenanceTask`/`Insert`/`Update` (lines 3-5): raw Supabase-generated DB row types, not API DTOs.
- `MaintenanceTaskWithStatus` (line 12): `MaintenanceTask & { dueDate: Date; status: TaskStatus }` — a UI-only
  computed type built in `.astro` frontmatter, not a runtime-validated or JSON-serializable-as-is shape (`Date`
  needs stringifying for JSON).
- No zod schema describing a returned/displayed task exists anywhere in the repo.

### `src/lib/status.ts` — pure status computation (reusable for a read endpoint)

- `computeDueDate(lastDoneDate: Date, frequencyValue: number, frequencyUnit: MaintenanceFrequencyUnit): Date`
  (lines 10-29) — switches on unit via date-fns `addDays`/`addWeeks`/`addMonths`/`addYears`, with an exhaustive
  `never` check that throws on an unhandled unit.
- `computeStatus(dueDate: Date, today: Date): TaskStatus` (lines 31-35) — `OVERDUE` / `DUE_SOON` (within
  `DUE_SOON_THRESHOLD_DAYS = 7`) / `OK`.
- `compareByUrgency` (lines 38-40) — sorts by status rank then importance rank.

Status is never stored in the DB — any JSON GET endpoint that wants to expose `dueDate`/`status` must call these
functions itself, exactly like both `.astro` pages do today.

### Data model and RLS — already complete, no migration needed

`supabase/migrations/20260827194321_create_maintenance_tasks.sql`:

- Table columns (lines 21-32): `id uuid pk default gen_random_uuid()`, `user_id uuid not null references auth.users(id) on delete cascade`, `name text not null`, `category maintenance_category not null`,
  `importance maintenance_importance not null`, `frequency_value integer not null check (frequency_value > 0)`,
  `frequency_unit maintenance_frequency_unit not null`, `last_done_date date not null`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`.
- Enums: `maintenance_category` (8 values), `maintenance_importance` (`low`/`medium`/`high`),
  `maintenance_frequency_unit` (`day`/`week`/`month`/`year`).
- Trigger `set_maintenance_tasks_updated_at` (lines 36-46) auto-bumps `updated_at` on every update; hardened with
  `set search_path = pg_catalog, pg_temp` in a follow-up migration
  (`20260828192519_harden_set_updated_at_search_path.sql`).
- RLS (lines 48-74): `grant select, insert, update, delete ... to authenticated` (line 53) — `anon` deliberately
  excluded so unauthenticated requests see zero rows even before `requireUser()` runs. Per-operation policies all
  gated on `auth.uid() = user_id` (select/insert/update/delete, lines 55-74), with `with check` on insert/update
  guaranteeing a spoofed `user_id` is rejected by the database itself, not just app code.

This means a JSON route built on the same cookie-session `createClient()` inherits full per-user isolation with
zero new SQL — confirmed empirically by
`src/pages/api/tasks/isolation.integration.test.ts` (see next section), which proves cross-user reads/updates/
deletes return zero rows (not an error) and a spoofed-`user_id` insert is hard-rejected.

### Established test contracts (must be reused, per `lessons.md` and `test-plan.md` §6.2/§6.7)

- `src/test-utils/auth-contract.ts:5-14` — `assertRequiresAuth(handler, buildContext, createClientMock)` asserts
  `response.headers.get("Location") === "/auth/signin"` and that `createClientMock` was never called. **This
  helper is redirect-specific** — it cannot be reused unmodified for a JSON 401 assertion; either a new helper or
  a JSON-aware variant is needed for S-03's routes.
- `src/pages/api/tasks/index.test.ts` / `[id].test.ts` — established mock pattern: `vi.hoisted()` to build
  `createClientMock`, `vi.mock("@/lib/supabase", () => ({ createClient: createClientMock }))`, then dynamic
  `import()` of the route module (required because the route executes at import time and must see the mock
  already registered). `index.test.ts:88-98` proves a client-supplied `user_id` is ignored in favor of the
  authenticated user's id (spoof-defense). `[id].test.ts:77-93` proves a request for `"other-users-task"`
  produces the identical not-found response as a nonexistent id (cross-user case, per `lessons.md`'s "Every new
  `/api/*` route must use the shared auth-check contract").
- `src/pages/api/tasks/isolation.integration.test.ts` (154 lines) — real-RLS integration tier
  (`test-plan.md` §6.7), gated on local Supabase (`npx supabase start && npx supabase db reset && npm run test:integration`), using plain `@supabase/supabase-js` signed in as one of two seeded fixture users
  (`supabase/seed.sql`), never a service-role client. Proves RLS itself (not just app-level `.eq()` filters)
  blocks cross-user reads/updates/deletes and rejects a spoofed-`user_id` insert.
- `test-plan.md` Risk #3 (`test-plan.md:48,60`): *"Before S-03 is considered done, every CRUD operation has the
  same auth/isolation coverage as #1/#2, plus a test proper to the public API contract, not just 'endpoint
  returns 200.'"* — sets a testing bar for S-03 specifically, without prescribing the JSON contract itself.

### Prior decisions on why routes are redirect-based, and that S-03 must be new

Two plans state this on the record, not as an inference:

> "The repo's only mutation pattern today is a dedicated POST-only action route per operation, native `<form method="POST">`, redirect + query-param feedback ... no client-side fetch/JSON mutation hooks exist, and
> native HTML forms cannot send `PATCH`/`DELETE` methods anyway." —
> `context/changes/manage-maintenance-tasks/plan.md:27-30`

> "Full FR-011 CRUD API (S-03, `maintenance-tasks-api`) — this slice adds only `POST /api/tasks`, on a path S-03
> can extend later." — `context/changes/first-task-on-dashboard/plan.md:68`

> "FR-011's full API CRUD surface (S-03, `maintenance-tasks-api`) — this plan's POST routes serve the HTML forms
> only, matching S-01's `POST /api/tasks` precedent, **not a public JSON API**." —
> `context/changes/manage-maintenance-tasks/plan.md:68-69`

Rationale is twofold: (1) consistency with the repo's HTML-form/progressive-enhancement architecture — no
client-side fetch/JSON mutation layer exists anywhere; (2) a hard technical constraint — native `<form>` elements
cannot issue `PATCH`/`DELETE`, which is why `complete`/`delete` exist as separate POST action routes rather than
verbs on `[id]`. **Neither constraint applies to a genuine JSON API** consumed by a non-browser client, which is
exactly why both plans deferred FR-011's real API surface to S-03 rather than building it opportunistically.

### PRD framing (why the API exists despite no confirmed consumer)

> "No external API consumer is planned yet." → Resolution: "kept as written — required per the seed spec
> independent of consumer count." — `context/foundation/prd.md:133` (Socrates challenge + resolution)

FR-011 (`prd.md:131`): "User (via API) can perform create/read/update/delete operations on their maintenance
tasks." Access Control section (`prd.md:158-162`) only describes email/password login and a flat role model — no
mention of API keys, tokens, or a second credential type for programmatic access.

## Code References

- `src/pages/api/tasks/index.ts:9-37` — existing `POST` (create), form-encoded, redirect-based
- `src/pages/api/tasks/[id].ts:9-52` — existing `POST` (update), RLS-only ownership, generic not-found redirect
- `src/pages/api/tasks/[id]/complete.ts:6-38` — existing `POST` (mark complete)
- `src/pages/api/tasks/[id]/delete.ts:5-31` — existing `POST` (delete)
- `src/lib/auth.ts:4-9` — `requireUser(context): User | Response`, redirect-only failure branch
- `src/lib/supabase.ts:6-10` — `createClient(requestHeaders, cookies): SupabaseClient | null`
- `src/lib/task-schema.ts:6-22` — `addTaskSchema`, `AddTaskInput`
- `src/lib/status.ts:5-40` — `DUE_SOON_THRESHOLD_DAYS`, `computeDueDate`, `computeStatus`, `compareByUrgency`
- `src/types.ts:3-12` — `MaintenanceTask`/`Insert`/`Update`, enum aliases, `TaskStatus`, `MaintenanceTaskWithStatus`
- `src/pages/dashboard.astro:12-28` — direct Supabase `select("*")` read + in-memory status computation
- `src/pages/tasks/index.astro:12-24` — same direct-read pattern for the manage-tasks list
- `src/components/tasks/TaskList.tsx:73-97` — edit/delete/complete action wiring (dialogs + plain `<form>` POST)
- `src/test-utils/auth-contract.ts:5-14` — `assertRequiresAuth`, redirect-specific assertions
- `src/pages/api/tasks/index.test.ts:5-98` — mock pattern + spoof-defense test
- `src/pages/api/tasks/[id].test.ts:5-94` — mock pattern + cross-user not-found test
- `src/pages/api/tasks/isolation.integration.test.ts:1-154` — real-RLS integration tier
- `supabase/migrations/20260827194321_create_maintenance_tasks.sql:1-75` — table, enums, trigger, RLS policies
- `supabase/migrations/20260828192519_harden_set_updated_at_search_path.sql:1-4` — `search_path` hardening

## Architecture Insights

- **Two distinct API "layers" are about to coexist**: the current form-mutation layer serving SSR pages
  (redirect-based, POST-only) and S-03's genuine JSON CRUD layer. They should almost certainly live as separate
  route trees or be clearly differentiated (e.g. `Accept`/`Content-Type` negotiation, or a distinct path prefix)
  rather than overloading the existing `/api/tasks/*` handlers with dual response modes — the existing routes are
  explicitly scoped to stay form-only per the two plan quotes above.
- **RLS is the single source of truth for ownership** across the whole feature — every mutation route already
  omits an app-layer `user_id` filter by design, relying on `auth.uid() = user_id` policies, and the real-RLS
  integration tier already proves this holds. S-03 should follow the identical convention rather than
  reintroducing app-layer ownership checks.
- **Status/due-date is compute-on-read, never persisted** — any JSON list/detail response needs to run
  `computeDueDate`/`computeStatus` per row, matching what both `.astro` pages already do, to avoid drift between
  the API's view of a task and the UI's.
- **No existing helper distinguishes "browser page" failure handling from "API client" failure handling** —
  `requireUser` and `createClient`'s `null` case both currently assume a redirect target exists. S-03 will need
  new JSON-aware equivalents (or parameterize the existing ones) rather than reusing them unmodified.

## Historical Context (from prior changes)

- `context/changes/manage-maintenance-tasks/plan.md:27-30, 68-69` — explains the form/redirect rationale and
  explicitly defers the public JSON API surface to S-03.
- `context/changes/first-task-on-dashboard/plan.md:51-52, 68, 77-78` — same deferral, plus confirms the
  form/redirect pattern originated from `src/pages/api/auth/signup.ts`'s precedent.
- `context/changes/testing-auth-isolation-contract/research.md:58-60` — states S-03 "will need the identical
  auth-check + ownership-defers-to-RLS convention," the closest thing to an auth-mechanism decision for S-03.
- `context/changes/testing-auth-isolation-contract/plan.md` (Phase 4) — establishes `requireUser()` and
  `assertRequiresAuth` as literal dependencies S-03 is expected to consume, codified in `lessons.md`'s "Every new
  `/api/*` route must use the shared auth-check contract" entry.
- `context/foundation/roadmap.md:150-163` — S-03 outcome/status/risk; status currently `proposed`, risk flags "no
  external API consumer confirmed yet" but calls it a "stated must-have."
- `context/foundation/prd.md:129-140` — FR-011 text, Socrates challenge/resolution, Access Control section (no
  API-key/token mention).
- `context/foundation/test-plan.md` §6.2 (lines 143-165, redirect/auth-contract convention), §6.7 (lines 185-206,
  real-RLS integration pattern), §3 Risk #3 (lines 48, 60 — S-03's testing bar). §6.3-6.6 remain `TBD` placeholders
  not yet relevant here.

## Related Research

- No prior `research.md` exists for `maintenance-tasks-api` (this is the first).
- `context/changes/testing-auth-isolation-contract/research.md` — origin of the shared auth-check contract now
  codified in `lessons.md` and directly consumed by this change.

## Open Questions

These are genuinely undecided anywhere in the project's history and should be resolved in `/10x-plan`, not here:

1. **JSON response envelope and error format** — no precedent exists in this codebase at all (confirmed via
   repo-wide search: zero `Response.json(` / `new Response(JSON.stringify(` usages anywhere). Needs a fresh
   decision: status codes, error body shape, validation-error serialization from zod.
1. **Route topology** — new paths distinct from the existing `/api/tasks/*` form routes, or content-negotiated
   dual-mode handlers on the same paths? The two prior plans' explicit "not a public JSON API" scoping suggests
   new/separate routes are the intended direction, but this isn't spelled out as a rule.
1. **Partial updates** — `addTaskSchema` has no `.partial()` variant; decide whether S-03's update endpoint
   requires a full representation (matching current `[id].ts` behavior) or supports PATCH-style partial fields.
1. **`requireUser`/`createClient` JSON-aware failure handling** — whether to add a parameter/variant to the
   existing helpers or introduce new API-specific equivalents.
1. **Read/list response shape** — whether to expose `dueDate`/`status` (computed) alongside raw columns, and how
   to serialize `Date` fields to JSON.
