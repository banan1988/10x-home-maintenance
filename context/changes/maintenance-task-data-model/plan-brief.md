# Maintenance Task Data Model — Plan Brief

> Full plan: `context/changes/maintenance-task-data-model/plan.md`

## What & Why

Create the first database migration in this project: a `maintenance_tasks` table with row-level security so a
user can only ever read or write their own tasks. This is Foundation F-01 on the roadmap — every downstream
slice (add-a-task, manage-tasks, tasks API) has nothing to read, write, or compute against until this schema and
its isolation policy exist.

## Starting Point

`supabase/` currently has only CLI scaffolding — no migrations, no `users`/`profiles` table (auth uses
Supabase's built-in `auth.users`), no generated TypeScript types, and no `src/types.ts`. This change establishes
all three conventions from scratch, since nothing here can be copied from an existing pattern.

## Desired End State

A `maintenance_tasks` table exists in both the local Supabase instance and the hosted project. An authenticated
user can insert/read/update/delete only their own rows; unauthenticated or other-user requests see zero rows.
`src/types.ts` exports typed rows and enums that the three downstream slices import directly instead of each
inventing their own.

## Key Decisions Made

| Decision                                  | Choice                                                          | Why (1 sentence)                                                                                   |
| ----------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Category/importance/unit encoding         | Native Postgres ENUM types                                      | DB-enforced validity, self-documenting, generates clean TS unions.                                 |
| Categories                                | 8 fixed values incl. `other`                                    | Covers the common homeowner taxonomy with an escape hatch.                                         |
| Primary key                               | `uuid default gen_random_uuid()`                                | Native to Postgres 17, avoids exposing guessable sequential IDs via the future API.                |
| Derived fields (`next_due_date`/`status`) | Not stored — raw inputs only                                    | Matches F-01's stated scope; status is time-relative and shouldn't be a stale generated column.    |
| Audit columns                             | `created_at` + `updated_at` with an update trigger              | Cheap to add now; useful for a table users edit frequently (mark-complete flow).                   |
| FK on user deletion                       | `ON DELETE CASCADE`                                             | Task data is meaningless without its owner; makes the parked account-deletion fast-follow trivial. |
| TypeScript types                          | Generate now (`supabase gen types typescript` + `src/types.ts`) | Prevents 3 parallel slices from each inventing a different types convention.                       |
| Verification                              | Manual only, no pgTAP                                           | Matches the repo's current test stack (Vitest only) and the PRD's guardrail scope.                 |

## Scope

**In scope:** the `maintenance_tasks` migration (enums, table, index, trigger, RLS policies), generated
TypeScript types wired into the existing Supabase client, pushing the migration to the hosted project.

**Out of scope:** API routes, UI, dashboard, `next_due_date`/`status` computation, `zod` validation, account
deletion, automated pgTAP tests.

## Architecture / Approach

One additive migration establishes three enums and one table, enforced entirely by RLS (no service-role bypass
exists in this app — the anon key + `auth.uid()` policies are the sole access-control mechanism). Types are
generated from that schema and re-exported through `src/types.ts` as the shared contract for every future
slice.

## Phases at a Glance

| Phase                                          | What it delivers                                                 | Key risk                                                                     |
| ---------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 1. Schema & RLS Migration                      | `maintenance_tasks` table + enums + RLS applied locally          | An RLS policy gap silently exposes cross-user data — the PRD's #1 guardrail. |
| 2. TypeScript Type Generation & Client Wiring  | `src/types.ts` + typed Supabase client                           | Type drift if the migration changes after types are generated.               |
| 3. Push to Hosted Project & Final Verification | Migration live on the hosted project, isolation reverified there | Push is not automatically reversible; hosted RLS could differ from local.    |

**Prerequisites:** local Supabase running (`npx supabase start`, requires Docker); an authenticated `supabase`
CLI session linked to the hosted project (already linked per `deployment-plan.md`).
**Estimated effort:** ~1 session across 3 phases — this is a single-table schema change, not a multi-service
build.

## Open Risks & Assumptions

- Assumes the `supabase` CLI session on the implementing machine is already logged in / linked to the hosted
  project (`kiuuewutycdwahmshpxm`) — if not, Phase 3's `db push` needs a `supabase login` first.
- Assumes Docker is available locally for `supabase start`/`db reset` in Phases 1–2.

## Success Criteria (Summary)

- `maintenance_tasks` exists locally and on the hosted project with RLS enforced per-operation.
- Cross-user isolation manually verified in both environments — one user's queries never touch another's rows.
- `src/types.ts` gives S-01/S-02/S-03 a single, shared, generated source of truth for the schema.
