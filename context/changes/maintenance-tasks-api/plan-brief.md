# Maintenance Tasks JSON API — Plan Brief

> Full plan: `context/changes/maintenance-tasks-api/plan.md`
> Research: `context/changes/maintenance-tasks-api/research.md`

## What & Why

FR-011 requires that a user, via an API, can perform full CRUD on their own maintenance tasks. No JSON API exists
in this codebase today — every existing `/api/tasks/*` route is form-in/redirect-out, built only for the `.astro`
pages. Two prior plans explicitly deferred this public JSON surface to this change (S-03).

## Starting Point

The `maintenance_tasks` table and its per-user RLS policies (`auth.uid() = user_id`, all 4 operations) are already
complete and proven by an existing real-RLS integration test. `requireUser()`/`createClient()` and
`addTaskSchema` exist but are redirect/form-shaped, not JSON-shaped; no output DTO or JSON envelope exists
anywhere.

## Desired End State

A new `/api/v1/tasks` route tree lets an authenticated user (via the existing cookie session) list, create,
read, update, and delete their tasks over JSON — each response computing `due_date`/`status` exactly like the
dashboard already does, with cross-user access indistinguishable from a 404.

## Key Decisions Made

| Decision                  | Choice                                          | Why (1 sentence)                                                                                                                               | Source |
| ------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Route topology            | New path, `/api/v1/tasks`                       | Keeps the existing form/redirect routes untouched, matching two prior plans' explicit "not a public JSON API" scoping of those files           | Plan   |
| Response envelope         | `{ data }` / `{ error }`                        | Leaves room for future metadata without a breaking change; clearly distinguishes success/error shapes                                          | Plan   |
| Partial updates           | `PATCH` with `.partial()` schema                | Standard JSON API expectation; avoids forcing a full round-trip for a one-field change                                                         | Plan   |
| Auth/config JSON failures | New `requireApiUser`/`requireApiClient` helpers | Page routes and API routes have genuinely different failure contracts (302 vs JSON 401/503); avoids touching already-tested page-route helpers | Plan   |
| List endpoint scope       | No pagination/filtering                         | Matches `tech-stack.md`'s small/low/small target scale and the existing `.astro` pages' own unpaginated behavior                               | Plan   |
| Verb surface              | Full CRUD incl. single-item `GET`               | Matches FR-011's literal "create/read/update/delete" — read covers both list and single-resource fetch                                         | Plan   |

## Scope

**In scope:**

- `GET`/`POST /api/v1/tasks`, `GET`/`PATCH`/`DELETE /api/v1/tasks/:id`
- JSON-native auth/config-failure helpers, JSON task schemas, task→DTO serialization
- Real-RLS integration tests for the new routes
- README documentation of the new API

**Out of scope:**

- Any new authentication mechanism (API keys, bearer tokens) — reuses the existing cookie session
- Changes to the existing `/api/tasks/*` form routes
- Pagination/filtering, a new database migration, API versioning policy beyond the `v1` segment, a "mark
  complete" convenience endpoint

## Architecture / Approach

A thin JSON-API infrastructure layer (`api-response.ts`, `api-auth.ts`, JSON task schemas, a DTO serializer) sits
alongside the existing page-route helpers without modifying them. Two new route files (`index.ts`, `[id].ts`)
under `src/pages/api/v1/tasks/` consume that layer, following the exact auth-then-client-then-validate-then-query
sequence already proven in `src/pages/api/tasks/*`, deferring ownership to RLS throughout.

## Phases at a Glance

| Phase                             | What it delivers                                                                    | Key risk                                                       |
| --------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1. Shared JSON API infrastructure | Response/auth helpers, JSON schemas, DTO serializer, JSON auth-contract test helper | None user-facing yet — foundation for Phases 2-3               |
| 2. List + Create                  | `GET`/`POST /api/v1/tasks`                                                          | Spoof-defense on `user_id` must be re-proven for the new route |
| 3. Read/Update/Delete single task | `GET`/`PATCH`/`DELETE /api/v1/tasks/:id`                                            | Cross-user access must be indistinguishable from a 404         |
| 4. Real-RLS integration + docs    | Integration test tier, README API section                                           | Requires local Supabase running (`npx supabase start`)         |

**Prerequisites:** F-01 (done) — data model + RLS already exist. No other blockers.
**Estimated effort:** ~4 phases, roughly one implementation session each.

## Open Risks & Assumptions

- No external API consumer is confirmed yet (noted in the PRD itself) — the contract here is a best-effort
  design given FR-011's must-have status, not a negotiated spec with a known consumer.
- Assumes the existing cookie-session auth is an acceptable mechanism for programmatic API consumers; if a real
  external consumer later needs a non-browser credential (API key/token), that would be new scope.

## Success Criteria (Summary)

- A user can perform every CRUD operation on their maintenance tasks via `/api/v1/tasks*` using their existing
  session, matching FR-011.
- A second user's session never sees or modifies the first user's tasks, proven at both the unit and real-RLS
  integration level.
- The new API is documented in the README with a runnable example.
  </content>
