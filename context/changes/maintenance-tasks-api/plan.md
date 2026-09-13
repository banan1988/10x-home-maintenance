# Maintenance Tasks JSON API Implementation Plan

## Overview

FR-011 requires that a user, via an API, can perform create/read/update/delete operations on their own
maintenance tasks. No JSON API exists anywhere in this codebase today — every existing `/api/tasks/*` route is
POST-only, form-in/redirect-out, built exclusively to power the `.astro` pages' native `<form>` submissions. Two
prior plans (`first-task-on-dashboard`, `manage-maintenance-tasks`) explicitly deferred this public JSON surface
to this change. This plan adds a new, separate JSON CRUD route tree at `/api/v1/tasks`, reusing the existing
RLS-backed data model and cookie-session auth, but with JSON-native request/response handling that the current
page routes don't have.

## Current State Analysis

- **Data model + RLS** (`supabase/migrations/20260827194321_create_maintenance_tasks.sql`) is complete: all 4
  operations are scoped by `auth.uid() = user_id`, granted only to `authenticated`. No migration is needed — a
  JSON route built on the same cookie-session Supabase client inherits full per-user isolation for free.
- **Auth**: `requireUser(context)` (`src/lib/auth.ts:4-9`) checks `context.locals.user` and returns a redirect
  `Response` on failure — hard-coded to a 302 page redirect, not reusable for a JSON 401.
- **Supabase client**: `createClient(headers, cookies)` (`src/lib/supabase.ts:6-10`) returns `null` when env vars
  are unset; every existing caller redirects to an error page on `null`.
- **Validation**: `addTaskSchema` (`src/lib/task-schema.ts:6-20`) is input-only, uses `z.coerce.number()` for
  `frequency_value` (accepts both `"3"` and `3`) and has no partial-update variant.
- **No output DTO exists**: `MaintenanceTaskWithStatus` (`src/types.ts:12`) is a UI-only intersection type; status
  and due date are always computed on read (`src/lib/status.ts`), never persisted.
- **Existing `/api/tasks/*` routes** (`index.ts`, `[id].ts`, `[id]/complete.ts`, `[id]/delete.ts`) stay untouched —
  they are explicitly scoped to serve the HTML forms only (see Historical Context in
  `context/changes/maintenance-tasks-api/research.md`).

## Desired End State

A new `/api/v1/tasks` JSON route tree exists, fully covering FR-011:

- `GET /api/v1/tasks` — list the authenticated user's tasks, each with computed `due_date`/`status`.
- `POST /api/v1/tasks` — create a task.
- `GET /api/v1/tasks/:id` — read a single task.
- `PATCH /api/v1/tasks/:id` — partially update a task.
- `DELETE /api/v1/tasks/:id` — delete a task.

All routes require the existing Supabase cookie session (obtained via `POST /api/auth/signin`, which is
unchanged); there is no new credential type. Every response is JSON: `{ data: ... }` on success, `{ error: { message, issues? } }` on failure, with a `204 No Content` on successful delete. Cross-user access to `:id` routes
returns the same `404` as a nonexistent id, matching the existing app-layer convention (ownership deferred to
RLS).

**Verification**: `npm run test` passes for all new unit tests; `npm run test:integration` (with local Supabase
running) passes for the new real-RLS integration tests; manual `curl` calls against the dev server (documented in
the README) demonstrate the full CRUD cycle for one signed-in user and confirm a second user cannot see or modify
the first user's tasks.

### Key Discoveries

- `src/pages/api/tasks/[id].ts:39-44` and siblings omit an app-layer `user_id` filter by design, relying on RLS —
  the new routes must follow the identical convention, with the same explanatory comment
  (`lessons.md`: "RLS-only ownership filters need an explicit code comment").
- `src/test-utils/auth-contract.ts` asserts on `response.headers.get("Location")`, so it cannot be reused for
  JSON routes — this plan introduces a JSON-specific counterpart.
- `lessons.md`: "Every new `/api/*` route must use the shared auth-check contract" — the new
  `requireApiUser`/`requireApiClient` pair becomes that shared contract for the `/api/v1/*` family, exactly as
  `requireUser`/`createClient` already are for the page-route family.
- `test-plan.md` Risk #3 sets the testing bar for this change explicitly: every CRUD operation needs the same
  auth/isolation coverage as the existing routes, plus a test proper to the public API contract.

## What We're NOT Doing

- No new authentication mechanism (API keys, bearer tokens) — consumers reuse the existing cookie session from
  `POST /api/auth/signin`, per the PRD's Access Control section and the roadmap's own S-03 outcome text.
- No changes to the existing `/api/tasks/*` form routes or their tests — they remain form/redirect-only.
- No pagination or filtering on `GET /api/v1/tasks` — per `tech-stack.md`'s `target_scale` (small users, low qps,
  small data volume), the full user-scoped list is returned unpaginated, matching what `dashboard.astro` and
  `tasks/index.astro` already do.
- No new database migration — the existing schema and RLS policies fully cover the new routes.
- No API versioning strategy beyond the `v1` path segment itself (no deprecation policy, no `v2` groundwork).
- No "mark complete" convenience endpoint in the JSON API — `PATCH /api/v1/tasks/:id` with `last_done_date`
  already covers that use case.

## Implementation Approach

Build a small, reusable JSON-API infrastructure layer first (Phase 1), then the two route files that consume it
(Phases 2-3), then close with the real-RLS integration tier and documentation (Phase 4) — mirroring the sequencing
already used by `testing-auth-isolation-contract` for the existing routes. Every new route follows the identical
pattern already proven in `src/pages/api/tasks/*`: `requireApiUser` first, then the Supabase client guard, then
zod validation, then the RLS-scoped query, with ownership always deferred to RLS rather than an app-layer filter.

## Critical Implementation Details

- **Empty-body `PATCH` must be rejected.** `updateTaskJsonSchema` is `createTaskJsonSchema.partial()`, which by
  itself would accept `{}` as valid. Add a `.refine((obj) => Object.keys(obj).length > 0, "At least one field must be provided")` so a no-op PATCH returns a `400` instead of silently succeeding.
- **Route-module test mocking requires the dynamic-import pattern.** Because `vi.mock("@/lib/supabase", ...)`
  must be registered before the route module is imported (the route calls `createClient` at module-execution
  time via the handler, but Vitest hoists `vi.mock` calls), every new test file must follow the exact
  `vi.hoisted()` + `const { GET } = await import(...)` pattern already used in
  `src/pages/api/tasks/index.test.ts:5-17` — a plain top-level `import` will not see the mock.
- **JSON body numeric strictness is a deliberate departure from the form schema.** `addTaskSchema` uses
  `z.coerce.number()` for `frequency_value` because form fields are always strings. The new
  `createTaskJsonSchema` uses plain `z.number()` — a JSON body can carry a real number, and a strict JSON API
  should reject a string like `"3"` rather than silently coercing it.

## Phase 1: Shared JSON API infrastructure

### Overview

Add the helpers, schemas, and DTO serialization every `/api/v1/tasks` route needs, plus the JSON-specific
auth-contract test helper. No routes are added yet.

### Changes Required

#### 1. JSON response helpers

**File**: `src/lib/api-response.ts`

**Intent**: Centralize the `{ data }` / `{ error }` envelope so every route produces an identical JSON shape and
`Content-Type`.

**Contract**: Export `jsonData(status: number, data: unknown): Response` returning `{ data }`, and
`jsonError(status: number, message: string, issues?: string[]): Response` returning `{ error: { message, issues? } }`. Both set `Content-Type: application/json`.

#### 2. API-specific auth and Supabase-client guards

**File**: `src/lib/api-auth.ts`

**Intent**: Provide the JSON-route equivalent of `requireUser`/`createClient`'s `null` guard, returning a JSON
error `Response` instead of a redirect, so every `/api/v1/*` route shares one auth-check implementation (per
`lessons.md`'s shared auth-check-contract rule, applied to the new route family).

**Contract**: Export `requireApiUser(context: APIContext): User | Response` (401 via `jsonError` when
`context.locals.user` is absent) and `requireApiClient(context: APIContext): ReturnType<typeof createClient> | Response` (503 via `jsonError` when `createClient` returns `null`), both built on top of the existing
`src/lib/auth.ts`/`src/lib/supabase.ts` primitives rather than duplicating their logic.

#### 3. JSON-native task schemas

**File**: `src/lib/task-schema.ts`

**Intent**: Add a strict-typed create schema for JSON bodies (see Critical Implementation Details on numeric
strictness) and a partial-update variant for `PATCH`.

**Contract**: Export `createTaskJsonSchema` (same shape as `addTaskSchema` but `frequency_value: z.number().int ().positive(...)` instead of `z.coerce.number()`) and `updateTaskJsonSchema = createTaskJsonSchema.partial ().refine(...)` per the empty-body rule above. Export their inferred types (`CreateTaskJsonInput`,
`UpdateTaskJsonInput`).

#### 4. Task DTO serialization

**File**: `src/lib/task-dto.ts`

**Intent**: Produce the JSON-serializable, computed-status shape every read response returns, reusing
`computeDueDate`/`computeStatus` from `src/lib/status.ts` exactly as the `.astro` pages already do, so the API's
view of a task never drifts from the UI's.

**Contract**: Export `toTaskDto(task: MaintenanceTask): TaskDto` where `TaskDto` adds `due_date: string` (
`yyyy-MM-dd`, via `date-fns/format`) and `status: TaskStatus` alongside the raw row fields, and `TaskDto` as the
inferred return type.

#### 5. JSON auth-contract test helper

**File**: `src/test-utils/api-auth-contract.ts`

**Intent**: JSON-response counterpart to `assertRequiresAuth`, asserting a `401` status and error body instead of
a `Location` header, for every new `/api/v1/*` route's unauthenticated case.

**Contract**: Export `assertRequiresApiAuth(handler: APIRoute, buildContext: (user: null) => APIContext, createClientMock: Mock): Promise<void>` asserting `response.status === 401`, a truthy `error.message` in the
parsed JSON body, and that `createClientMock` was never called.

### Success Criteria

#### Automated Verification

- Unit tests pass: `npm run test -- src/lib/api-response.test.ts src/lib/api-auth.test.ts src/lib/task-schema.test.ts src/lib/task-dto.test.ts`
- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification

- None — this phase has no user-facing surface yet.

______________________________________________________________________

## Phase 2: List + Create endpoints

### Overview

Add `GET`/`POST /api/v1/tasks`, covering the "create" and "read" (list) halves of FR-011.

### Changes Required

#### 1. List + create route

**File**: `src/pages/api/v1/tasks/index.ts`

**Intent**: `GET` returns the authenticated user's full task list as DTOs; `POST` validates a JSON body against
`createTaskJsonSchema` and inserts it scoped to the authenticated user, mirroring the spoof-defense already
proven in `src/pages/api/tasks/index.ts:29` (insert uses `user.id` from the session, never a client-supplied
value).

**Contract**: `export const prerender = false; export const GET: APIRoute; export const POST: APIRoute;`. Both
call `requireApiUser` then `requireApiClient` first. `GET` selects `*` from `maintenance_tasks` (RLS scopes rows
to the caller automatically — no app-layer filter) and returns `jsonData(200, tasks.map(toTaskDto))`. `POST`
parses the body via `context.request.json()`, validates with `createTaskJsonSchema`, returns `jsonError(400, issues[0].message, issues.map(i => i.message))` on failure, inserts with `user_id: user.id`, and returns
`jsonData(201, toTaskDto(insertedRow))`.

#### 2. Tests

**File**: `src/pages/api/v1/tasks/index.test.ts`

**Intent**: Cover both verbs following the established mock pattern (`vi.hoisted` + dynamic `import()`, per
Critical Implementation Details).

**Contract**: `describe("GET /api/v1/tasks")` and `describe("POST /api/v1/tasks")` blocks. `GET` cases:
`assertRequiresApiAuth`; returns the caller's tasks serialized with computed `due_date`/`status`. `POST` cases:
`assertRequiresApiAuth`; inserts scoped to `user.id` and ignores a client-supplied `user_id` (same assertion
style as `src/pages/api/tasks/index.test.ts:88-98`); returns `400` with the first validation issue on invalid
input; returns `201` with the DTO on success.

### Success Criteria

#### Automated Verification

- Unit tests pass: `npm run test -- src/pages/api/v1/tasks/index.test.ts`
- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification

- `curl -b <session-cookie> -X POST http://localhost:4321/api/v1/tasks -H "Content-Type: application/json" -d '{...}'` returns `201` with the created task's DTO.
- `curl -b <session-cookie> http://localhost:4321/api/v1/tasks` returns `200` with a JSON array including the
  just-created task and a correct computed `status`.
- Omitting the session cookie on either call returns `401`.

______________________________________________________________________

## Phase 3: Read/update/delete a single task

### Overview

Add `GET`/`PATCH`/`DELETE /api/v1/tasks/:id`, completing FR-011's single-resource read, update, and delete.

### Changes Required

#### 1. Single-task route

**File**: `src/pages/api/v1/tasks/[id].ts`

**Intent**: Read, partially update, and delete one task, deferring ownership entirely to RLS exactly as
`src/pages/api/tasks/[id].ts` already does, but returning JSON instead of redirects.

**Contract**: `export const prerender = false; export const GET: APIRoute; export const PATCH: APIRoute; export const DELETE: APIRoute;`. All three call `requireApiUser`/`requireApiClient` first, then query `.eq("id", context.params.id)` with **no `user_id` filter** (comment referencing the RLS migration, per Critical
Implementation Details in the codebase-wide lesson). `GET`: `jsonError(404, "Task not found")` when no row
matches; else `jsonData(200, toTaskDto(row))`. `PATCH`: validate body with `updateTaskJsonSchema`; `400` with
issues on failure; format any `last_done_date` present in the parsed data before `.update(...)`; `404` when zero
rows match; else `jsonData(200, toTaskDto(updatedRow))`. `DELETE`: `.delete().eq("id", ...)`; `404` when zero rows
match; else `new Response(null, { status: 204 })`.

#### 2. Tests

**File**: `src/pages/api/v1/tasks/[id].test.ts`

**Intent**: Cover all three verbs, including the cross-user case that must be indistinguishable from a
nonexistent id, per `lessons.md`'s shared auth-check-contract rule.

**Contract**: One `describe` block per verb. Each includes `assertRequiresApiAuth`; a cross-user case asserting
the identical `404` response as a nonexistent id (mirroring `src/pages/api/tasks/[id].test.ts:77-93`); a
happy-path case. `PATCH` additionally covers: a single-field partial update reaching the database with only that
field, an empty-body `{}` returning `400`, and an invalid-field-value returning `400`.

### Success Criteria

#### Automated Verification

- Unit tests pass: `npm run test -- src/pages/api/v1/tasks/[id].test.ts`
- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification

- `curl -b <session-cookie> http://localhost:4321/api/v1/tasks/<id>` returns the task; a nonexistent or another
  user's id returns `404`.
- `curl -b <session-cookie> -X PATCH .../api/v1/tasks/<id> -d '{"name":"New name"}'` updates only `name`, leaving
  other fields unchanged.
- `curl -b <session-cookie> -X DELETE .../api/v1/tasks/<id>` returns `204`, and a subsequent `GET` on the same id
  returns `404`.

**Implementation Note**: Pause here for manual confirmation before proceeding to Phase 4.

______________________________________________________________________

## Phase 4: Real-RLS integration coverage + documentation

### Overview

Prove the new routes are protected by real Postgres RLS (not just app-layer `.eq()` filters), matching the
testing bar `test-plan.md` Risk #3 sets for this change, and document the new public API for future consumers.

### Changes Required

#### 1. Real-RLS integration tests

**File**: `src/pages/api/v1/tasks/isolation.integration.test.ts`

**Intent**: Mirror `src/pages/api/tasks/isolation.integration.test.ts`'s pattern (two seeded fixture users from
`supabase/seed.sql`, signed in via plain `@supabase/supabase-js`, never a service-role client) for the new v1
routes, proving RLS itself — not app code — blocks cross-user reads/updates/deletes and rejects a spoofed
`user_id` insert.

**Contract**: Gated the same way as the existing integration file (`npx supabase start && npx supabase db reset && npm run test:integration`), excluded from the default `vitest run` per `vitest.config.ts`'s
`**/*.integration.test.ts` exclusion. Covers: user A cannot read/update/delete user B's task via `GET`/`PATCH`/
`DELETE /api/v1/tasks/:id`; an insert with a spoofed `user_id` in the body is stored under the real
authenticated user's id instead.

#### 2. README documentation

**File**: `README.md`

**Intent**: Document the new public JSON API per this project's documentation convention (what it is,
prerequisites, usage, examples).

**Contract**: A new `## API` section covering: authentication (reuse the existing cookie session from `POST /api/auth/signin` — no separate API key), the five endpoints and their methods/paths, and one realistic
end-to-end `curl` example (sign in, capture the session cookie, create a task, list tasks, update, delete).

### Success Criteria

#### Automated Verification

- Integration tests pass: `npx supabase start && npx supabase db reset && npm run test:integration`
- Full unit suite still passes: `npm run test`
- Type checking passes: `npm run build`
- Linting passes: `npm run lint`

#### Manual Verification

- README's `curl` walkthrough, followed step-by-step against the local dev server, works exactly as documented.

______________________________________________________________________

## Testing Strategy

### Unit Tests

- Every route verb: unauthenticated → `401`; happy path → correct status/body; validation failure → `400` with
  the zod message; cross-user access on `:id` routes → `404` indistinguishable from a nonexistent id.
- `PATCH` partial-update semantics: single-field update, empty-body rejection, invalid-field rejection.
- DTO serialization: `due_date`/`status` computed identically to `src/lib/status.ts`'s existing behavior.

### Integration Tests

- Real-RLS cross-user isolation for all four operations, plus spoofed-`user_id` insert rejection, on the new
  `/api/v1/tasks` routes.

### Manual Testing Steps

1. Sign in via the existing `/auth/signin` page (or `curl -c cookies.txt -X POST /api/auth/signin -d "email=...&password=..."`), capturing the session cookie.
1. `POST /api/v1/tasks` with a valid body → `201` with the created task's DTO, including a plausible `due_date`.
1. `GET /api/v1/tasks` → `200` with an array containing the created task.
1. `GET /api/v1/tasks/:id` → `200` with the same task; a fabricated id → `404`.
1. `PATCH /api/v1/tasks/:id` with `{"last_done_date": "<today>"}` → `200`, `status` recomputed to `OK` (or
   whatever the frequency dictates).
1. `DELETE /api/v1/tasks/:id` → `204`; a subsequent `GET` on the same id → `404`.
1. Repeat steps 3-6 with a second signed-in user's session against the first user's task ids → every call
   returns `404`, never the first user's data.

## Performance Considerations

None beyond what already applies to the existing `/api/tasks/*` routes — `target_scale` (`tech-stack.md`) is
small users/low qps/small data volume, and `GET /api/v1/tasks` returns an unpaginated but small result set.

## Migration Notes

None — no schema or data changes; the existing `maintenance_tasks` table and its RLS policies are reused as-is.

## References

- Research: `context/changes/maintenance-tasks-api/research.md`
- Existing route precedent: `src/pages/api/tasks/index.ts`, `src/pages/api/tasks/[id].ts`
- Existing test precedent: `src/pages/api/tasks/index.test.ts`, `src/pages/api/tasks/[id].test.ts`,
  `src/pages/api/tasks/isolation.integration.test.ts`
- Shared auth-check contract: `context/foundation/lessons.md` ("Every new `/api/*` route must use the shared
  auth-check contract", "RLS-only ownership filters need an explicit code comment")

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append `— <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Shared JSON API infrastructure

#### Automated

- [x] 1.1 Unit tests pass: `npm run test -- src/lib/api-response.test.ts src/lib/api-auth.test.ts src/lib/task-schema.test.ts src/lib/task-dto.test.ts` — 40c2d9f
- [x] 1.2 Type checking passes: `npm run build` — 40c2d9f
- [x] 1.3 Linting passes: `npm run lint` — 40c2d9f

### Phase 2: List + Create endpoints

#### Automated

- [x] 2.1 Unit tests pass: `npm run test -- src/pages/api/v1/tasks/index.test.ts` — 5604ef5
- [x] 2.2 Type checking passes: `npm run build` — 5604ef5
- [x] 2.3 Linting passes: `npm run lint` — 5604ef5

#### Manual

- [x] 2.4 POST /api/v1/tasks returns 201 with created task DTO — 5604ef5
- [x] 2.5 GET /api/v1/tasks returns 200 with the task list including computed status — 5604ef5
- [x] 2.6 Missing session cookie returns 401 on both verbs — 5604ef5

### Phase 3: Read/update/delete a single task

#### Automated

- [x] 3.1 Unit tests pass: `npm run test -- src/pages/api/v1/tasks/[id].test.ts`
- [x] 3.2 Type checking passes: `npm run build`
- [x] 3.3 Linting passes: `npm run lint`

#### Manual

- [x] 3.4 GET /api/v1/tasks/:id returns the task; nonexistent/other-user id returns 404
- [x] 3.5 PATCH /api/v1/tasks/:id updates only the sent field(s)
- [x] 3.6 DELETE /api/v1/tasks/:id returns 204; subsequent GET returns 404

### Phase 4: Real-RLS integration coverage + documentation

#### Automated

- [ ] 4.1 Integration tests pass: `npx supabase start && npx supabase db reset && npm run test:integration`
- [ ] 4.2 Full unit suite still passes: `npm run test`
- [ ] 4.3 Type checking passes: `npm run build`
- [ ] 4.4 Linting passes: `npm run lint`

#### Manual

- [ ] 4.5 README curl walkthrough works step-by-step against the local dev server
  </content>
