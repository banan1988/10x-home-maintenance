# Maintenance Task Data Model Implementation Plan

## Overview

Create the first database migration in this project: a `maintenance_tasks` table storing each user's raw
maintenance-task inputs (name, category, importance, frequency, last-done date), protected by row-level security
so a user can only ever read or write their own rows. Generate typed TypeScript bindings for the new schema so
every downstream slice (S-01, S-02, S-03) consumes the same types instead of each inventing its own.

## Current State Analysis

- `supabase/` contains only CLI scaffolding (`config.toml`, `.gitignore`) — `supabase/migrations/` does not exist.
  This will be the first migration ever created in this project.
- No `users`/`profiles` table exists. Auth relies solely on Supabase's built-in `auth.users`
  (`src/lib/supabase.ts:1-24` uses `@supabase/ssr`'s `createServerClient`, calling `supabase.auth.getUser()` in
  `src/middleware.ts:10`).
- `context.locals` carries only `user` (`src/env.d.ts:1-5`) — there is no `locals.supabase`. Every route that
  needs a Supabase client calls `createClient(context.request.headers, context.cookies)` itself
  (`src/pages/api/auth/signin.ts:9`).
- No `src/types.ts`, no generated `Database` type, no `supabase gen types typescript` script. `createServerClient`
  is called untyped (`src/lib/supabase.ts:9`).
- No `zod` dependency, no `src/lib/services/` directory — `src/lib/` currently has only `supabase.ts`,
  `utils.ts`, `config-status.ts` (plus their tests).
- The Supabase project is already linked and hosted: project `10x-home-maintenance`, ref `kiuuewutycdwahmshpxm`,
  region `eu-central-1` (`context/changes/deployment/deployment-plan.md:5`,
  `context/changes/bootstrap-verification/verification.md:130`). `SUPABASE_URL`/`SUPABASE_KEY` are already set as
  Cloudflare Worker secrets — no new secret plumbing is needed.
- `context/changes/bootstrap-verification/verification.md:130` already flags that the first migration must be
  `supabase db push`-ed to the hosted project before it takes effect — this plan's Phase 3 is that push.
- Postgres major version is 17 (`supabase/config.toml:36`), so `gen_random_uuid()` is available natively —no
  `pgcrypto`/`uuid-ossp` extension needs enabling.

### Key Discoveries

- Roadmap F-01 (`context/foundation/roadmap.md:95-112`) scopes this change to raw stored fields only — name,
  category, importance, `frequency_value`/`frequency_unit`, `last_done_date`, owning user — not the derived
  `next_due_date`/`status` fields from FR-008/FR-009. Those are computed by consumers (S-01, S-03), not stored
  here.
- PRD FR-008 (`context/foundation/prd.md:110-115`) fixes the frequency model as `frequency_value` (integer) +
  `frequency_unit` limited to `day | week | month | year`, and states that changing `frequency` never touches
  `last_done_date` — confirming these must remain independent, directly-editable columns (no derived/generated
  coupling between them).
- CLAUDE.md's Supabase-migrations convention (project root) requires RLS enabled on every new table with
  granular per-operation, per-role policies — this rules out a single combined `FOR ALL` policy.

## Desired End State

A `maintenance_tasks` table exists in both the local Supabase instance and the hosted project, with RLS enabled
and enforced, such that:

- An authenticated user can `INSERT`/`SELECT`/`UPDATE`/`DELETE` only rows where `user_id` matches their own
  `auth.uid()`.
- No policy exists for the `anon` role, so unauthenticated requests see zero rows.
- `npm run build` and `npm run lint` pass with a typed `Database` generic flowing through `src/lib/supabase.ts`.
- `src/types.ts` exports the row/insert/update and enum types that S-01/S-02/S-03 will import directly.

**Verification**: apply the migration locally (`supabase db reset`), confirm RLS blocks cross-user reads via two
manually-seeded rows, then push to the hosted project and repeat the same manual check there.

## What We're NOT Doing

- No `next_due_date` or `status` columns, generated columns, or SQL functions — status/due-date computation is
  explicitly deferred to S-01/S-03 per the roadmap's F-01 scope.
- No API routes, UI, or dashboard — this change is schema-only (S-01/S-02/S-03 build on top of it separately).
- No `zod` dependency or validation layer — validation belongs to the API routes that don't exist yet.
- No automated pgTAP/SQL test suite — verification is manual against local and hosted Supabase instances.
- No categories lookup table, category management UI, or ability for users to add/edit categories — categories
  are a fixed Postgres enum per PRD Non-Goals.
- No account-deletion feature — only its `ON DELETE CASCADE` FK behavior is put in place now, as noted in the
  roadmap's Parked list (account deletion is a fast-follow, not in this change's scope).

## Implementation Approach

Since no schema, migration tooling, or type-generation convention exists yet, this change establishes all three
in one pass: author the migration (Phase 1), generate and wire up the TypeScript types the migration implies
(Phase 2), then push the migration to the hosted project and verify isolation end-to-end on real infrastructure
(Phase 3). Phases are sequential because each depends on the previous phase's schema being final before types are
generated from it, and types being wired before the hosted push is declared done.

## Critical Implementation Details

- **Enum values are lowercase.** `maintenance_category`, `maintenance_importance`, and `maintenance_frequency_unit`
  values are lowercase (`'high'`, `'day'`, `'safety_security'`, …), not the PRD's display casing (`HIGH`,
  `DUE SOON`). Downstream slices are responsible for mapping to display labels — do not encode display casing
  into the enum itself.
- **RLS policies must be scoped `TO authenticated`, not left roleless.** Without an explicit role, a policy
  applies to every role including `anon`; scoping to `authenticated` combined with zero `anon` policies is what
  makes unauthenticated requests return zero rows rather than relying on default-deny alone being obvious to a
  future reader.
- **Adding a new enum value later needs its own migration and cannot be used in the same transaction it's added
  in** (a standing Postgres limitation, not fixed by version 17) — irrelevant to this change's initial 8 values,
  but worth a one-line comment in the migration for whoever extends the category list later.
- **`supabase gen types typescript --local` requires the local instance to be running** (`supabase start`,
  which needs Docker per this repo's existing CLAUDE.md environment notes) — Phase 2's type generation must run
  against the migration applied in Phase 1, not the hosted project, so local dev doesn't require hosted access.

## Phase 1: Schema & RLS Migration

### Overview

Author the first Supabase migration: three enums, the `maintenance_tasks` table, an index on `user_id`, an
`updated_at` trigger, and four granular RLS policies (one per operation).

### Changes Required

#### 1. Migration file

**File**: `supabase/migrations/<timestamp>_create_maintenance_tasks.sql`

**Intent**: Generate the file via `npx supabase migration new create_maintenance_tasks` so the timestamp prefix
is correct (do not hand-write the timestamp), then fill it in with the schema below.

**Contract**:

- Three enums: `maintenance_category` (`'hvac' | 'plumbing' | 'electrical' | 'appliances' | 'safety_security' | 'exterior_structural' | 'interior_fixtures' | 'other'`), `maintenance_importance`
  (`'low' | 'medium' | 'high'`), `maintenance_frequency_unit` (`'day' | 'week' | 'month' | 'year'`).
- Table `maintenance_tasks`: `id uuid primary key default gen_random_uuid()`, `user_id uuid not null references auth.users(id) on delete cascade`, `name text not null`, `category maintenance_category not null`, `importance maintenance_importance not null`, `frequency_value integer not null check (frequency_value > 0)`,
  `frequency_unit maintenance_frequency_unit not null`, `last_done_date date not null`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`.
- Index: `create index maintenance_tasks_user_id_idx on maintenance_tasks (user_id);`
- Trigger function `set_updated_at()` that sets `new.updated_at = now()`, attached as a `before update` trigger
  on `maintenance_tasks` for each row.
- `alter table maintenance_tasks enable row level security;` followed by four separate policies, each `to authenticated`: `select` using `auth.uid() = user_id`; `insert` with check `auth.uid() = user_id`; `update`
  using `auth.uid() = user_id` with check `auth.uid() = user_id`; `delete` using `auth.uid() = user_id`.

### Success Criteria

#### Automated Verification

- Migration applies cleanly against the local instance: `npx supabase db reset`
- Lint passes: `npm run lint`

#### Manual Verification

- Open Supabase Studio (local, `npx supabase start` prints the URL) and confirm the table, its columns, the
  three enums, the index, and all four RLS policies exist as specified.
- Using the SQL editor as the `postgres` role, insert one row for two different fake `user_id` UUIDs; then, using
  the `authenticated` role with a JWT claiming one of those UUIDs (Studio's "Run as" / `set local role authenticated; set local request.jwt.claims = '...'`), confirm a `select * from maintenance_tasks` returns only
  that user's row, and an `update`/`delete` attempt against the other user's row affects zero rows.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for
manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

______________________________________________________________________

## Phase 2: TypeScript Type Generation & Client Wiring

### Overview

Generate typed bindings from the schema created in Phase 1, and make them the shared contract S-01/S-02/S-03
will import instead of each slice inventing its own row types.

### Changes Required

#### 1. Type generation script

**File**: `package.json`

**Intent**: Add a repeatable way to regenerate types whenever the schema changes, matching this repo's existing
`npm run <verb>` script convention.

**Contract**: New script `"types:generate": "supabase gen types typescript --local --schema public > src/db/database.types.ts"`.

#### 2. Generated database types

**File**: `src/db/database.types.ts`

**Intent**: Output of running the new `types:generate` script once Phase 1's migration is applied locally.
Generated, not hand-written — do not edit directly.

**Contract**: Standard `supabase gen types typescript` output — a `Database` type with `public.Tables.maintenance_tasks.{Row,Insert,Update}` and `public.Enums.{maintenance_category,maintenance_importance,maintenance_frequency_unit}`.

#### 3. Shared application types

**File**: `src/types.ts`

**Intent**: Establish the shared-types convention named in this repo's CLAUDE.md ("Shared types (entities, DTOs)
go in `src/types.ts`"), which doesn't exist yet. Re-export the generated row/enum types under names S-01/S-02/S-03
will import directly, so they share one convention instead of three.

**Contract**: Export `MaintenanceTask` (`Row`), `MaintenanceTaskInsert` (`Insert`), `MaintenanceTaskUpdate`
(`Update`), `MaintenanceCategory`, `MaintenanceImportance`, `MaintenanceFrequencyUnit` — all aliased from
`Database["public"]["Tables"]["maintenance_tasks"]` and `Database["public"]["Enums"]` in
`src/db/database.types.ts`.

#### 4. Typed Supabase client

**File**: `src/lib/supabase.ts`

**Intent**: Flow the generated `Database` type through the existing client factory so every future caller gets
typed query results without changing the factory's signature.

**Contract**: Import `Database` from `@/db/database.types` and change `createServerClient(SUPABASE_URL, SUPABASE_KEY, {...})` (currently untyped, `src/lib/supabase.ts:9`) to `createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {...})`.

### Success Criteria

#### Automated Verification

- Type generation succeeds against the local instance: `npm run types:generate`
- Type-checked lint passes: `npm run lint`
- Existing unit tests still pass: `npm run test` (covers `src/lib/supabase.test.ts`, which mocks
  `createServerClient` and should be unaffected by the added generic)

#### Manual Verification

- Open `src/types.ts` and confirm every exported type's shape matches the migration's columns and enum values
  (no drift between what Phase 1 created and what Phase 2 generated).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for
manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

______________________________________________________________________

## Phase 3: Push to Hosted Project & Final Verification

### Overview

Apply the migration to the linked hosted Supabase project and repeat the RLS isolation check against real
infrastructure, so this foundation is actually usable by S-01/S-02/S-03 (which will run against the hosted
project via the deployed app).

### Changes Required

#### 1. Push migration

**File**: n/a (operational step, no file changes)

**Intent**: Sync the migration created in Phase 1 to the already-linked hosted project (ref
`kiuuewutycdwahmshpxm`), closing the gap flagged in
`context/changes/bootstrap-verification/verification.md:130`.

**Contract**: `npx supabase db push` (requires `npx supabase login` / an existing linked session) applies the
pending migration to the hosted project with no manual SQL edits.

### Success Criteria

#### Automated Verification

- Migration is applied and tracked: `npx supabase migration list` shows the new migration as applied both
  locally and remotely
- Build still passes: `npm run build`

#### Manual Verification

- In the hosted project's Supabase Studio, confirm the table, enums, index, trigger, and all four RLS policies
  match what was verified locally in Phase 1.
- Repeat Phase 1's manual RLS check (two seeded rows, cross-user isolation) against the hosted project to confirm
  the same isolation guarantee holds in production, not just locally.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for
manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

______________________________________________________________________

## Testing Strategy

### Unit Tests

- No new unit tests — `src/lib/supabase.test.ts` already covers the client factory and needs no changes beyond
  continuing to pass with the added `Database` generic.

### Integration Tests

- None automated in this change (see "What We're NOT Doing" — no pgTAP suite). RLS correctness is verified
  manually in Phases 1 and 3.

### Manual Testing Steps

1. Seed two rows for two different user UUIDs directly via SQL (bypassing RLS as the table owner).
1. Switch to the `authenticated` role scoped to one of those UUIDs and confirm `select`/`update`/`delete` only
   ever touches that user's row.
1. Confirm an unauthenticated (`anon`) query returns zero rows.
1. Repeat steps 1–3 against the hosted project after Phase 3's push.

## Performance Considerations

Target scale is small (PRD `target_scale: users: small, qps: low, data_volume: small`) — a single index on
`user_id` is sufficient; no partitioning, materialized views, or caching are warranted.

## Migration Notes

This is the first migration in the project, so there is no existing data to migrate or backfill. The hosted push
in Phase 3 is a one-time, irreversible-by-default operation (`supabase db push` has no automatic rollback) — if
it needs to be undone, a follow-up down-migration would need to be authored explicitly.

## References

- Roadmap: `context/foundation/roadmap.md:95-112` (F-01)
- PRD: `context/foundation/prd.md:92-115` (FR-004, FR-008), `context/foundation/prd.md:158-162` (Access Control)
- Prior infra decisions: `context/changes/bootstrap-verification/verification.md:130`,
  `context/changes/deployment/deployment-plan.md:5`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append `— <commit sha>` when a step lands. Do not rename step
> titles. See `references/progress-format.md`.

### Phase 1: Schema & RLS Migration

#### Automated

- [ ] 1.1 Migration applies cleanly against the local instance: `npx supabase db reset`
- [ ] 1.2 Lint passes: `npm run lint`

#### Manual

- [ ] 1.3 Table, enums, index, and all four RLS policies confirmed in Supabase Studio (local)
- [ ] 1.4 Cross-user RLS isolation confirmed via seeded rows (local)

### Phase 2: TypeScript Type Generation & Client Wiring

#### Automated

- [ ] 2.1 Type generation succeeds: `npm run types:generate`
- [ ] 2.2 Type-checked lint passes: `npm run lint`
- [ ] 2.3 Existing unit tests still pass: `npm run test`

#### Manual

- [ ] 2.4 `src/types.ts` exported shapes match the migration's columns and enum values

### Phase 3: Push to Hosted Project & Final Verification

#### Automated

- [ ] 3.1 Migration applied and tracked locally and remotely: `npx supabase migration list`
- [ ] 3.2 Build passes: `npm run build`

#### Manual

- [ ] 3.3 Hosted schema (table, enums, index, trigger, RLS policies) matches local
- [ ] 3.4 Cross-user RLS isolation confirmed against the hosted project
