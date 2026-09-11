# Auth/Isolation Contract — Implementation Plan

## Overview

Turn the existing (already-correct) auth-gate + cross-user isolation pattern into an explicit,
enforced, testable contract, so that S-03 (`maintenance-tasks-api`) and any future `/api/*` route
inherit it automatically instead of by convention. This closes test-plan.md §3 Phase 1 (Risks #1,

# 2, #3): IDOR, a route shipping without its own auth check, and S-03 parity

## Current State Analysis

- All 4 mutation routes (`src/pages/api/tasks/index.ts`, `[id].ts`, `[id]/complete.ts`,
  `[id]/delete.ts`) independently repeat the identical inline check
  `if (!context.locals.user) return context.redirect("/auth/signin");` — no shared helper exists.
- Ownership is correctly deferred to RLS everywhere (`.eq("id", ...)` only, never a redundant
  `user_id` filter), and a cross-user request produces the same generic "not found" redirect as a
  nonexistent-id request — a deliberate anti-oracle design, not a gap.
- `src/middleware.ts`'s `PROTECTED_ROUTES` (`/dashboard`, `/tasks`) never matches `/api/*`; the
  per-route inline check is the only thing standing between an unauthenticated request and the
  database today.
- RLS itself (`supabase/migrations/20260827194321_create_maintenance_tasks.sql:55-74`) has full
  4/4 per-operation coverage keyed on `auth.uid() = user_id`. No service-role key exists anywhere
  in the app (`astro.config.mjs` declares only `SUPABASE_URL`/`SUPABASE_KEY`, both anon-scoped).
- Test coverage: unauthenticated-rejection is well-tested on 3 of 4 routes (asserts the redirect
  **and** that the Supabase client was never constructed); the create route's equivalent
  assertion is weaker (only checks `insertMock`, not `createClientMock`). No test constructs two
  distinct users or exercises real RLS — the mocked Supabase client used everywhere has no RLS
  semantics, so today's suite cannot prove the database itself enforces isolation. The only
  real-RLS verification ever performed was a one-time **manual** SQL/JWT-impersonation check
  during F-01 (`context/changes/maintenance-task-data-model/plan.md:145-159`), never automated,
  never re-run.
- `supabase` CLI is a dev dependency and `supabase/migrations/` exists, but there is no seed file
  and CI (`.github/workflows/ci.yml`) has no Docker/local-Supabase step — `npm run test` runs
  Vitest against mocks only.

## Desired End State

- A single `requireUser()` helper is the only auth-check implementation; all 4 routes call it.
- A shared, importable test-utility module proves the auth-check contract identically across all
  4 route test files, and the 3 mutation routes each carry an explicit two-distinct-user unit
  test case (not just an empty-array stand-in) plus the create route carries a `user_id`-spoof
  test.
- A new, local-only integration tier authenticates as two real seeded Supabase users (no
  admin/service-role key anywhere) and proves RLS itself blocks cross-user reads/writes at the
  database level — the one thing the mocked-unit tier structurally cannot prove.
- `npm run test` / CI stays exactly as fast and Docker-free as today; the integration tier is a
  separate, explicitly-opt-in command.
- `test-plan.md` §6 documents the helper, the test-utility module, and the integration-tier
  commands as a literal, importable contract S-03's own routes and tests can point back to.

### Key Discoveries

- `src/pages/api/tasks/index.test.ts:38-55` is the one existing auth-check assertion that doesn't
  check `createClientMock` — Phase 2 fixes this as a side effect of switching it to the shared
  assertion helper.
- `addTaskSchema` (`src/lib/task-schema.ts:6-20`) has no `user_id` field today, so a spoofed
  `user_id` in the form body is already dropped by `safeParse` before it could reach the insert —
  but nothing currently regression-tests that this stays true if the schema ever changes.
- Local Supabase's auth schema requires both an `auth.users` row (with a bcrypt-hashed password
  via `crypt(..., gen_salt('bf'))`) and a matching `auth.identities` row for password sign-in to
  succeed — a seed file that only inserts into `auth.users` will fail to authenticate at
  `signInWithPassword` time. This is a known Supabase local-seeding gotcha, not a design choice.

## What We're NOT Doing

- Not adding a full HTTP-level integration test that boots the Astro dev server — the integration
  tier authenticates directly against local Supabase with the same `@supabase/supabase-js`
  client library calls the app uses, and queries `maintenance_tasks` directly. This is the
  cheapest layer that can actually reach RLS; route-level HTTP behavior is already proven by the
  existing/expanded mocked-unit tests.
- Not wiring Docker/local-Supabase into CI in this phase — that is explicitly test-plan.md §3
  Phase 4's job ("missing CI gates"). The integration tier runs locally via a dedicated script
  until Phase 4 lands.
- Not changing `src/middleware.ts` or its `PROTECTED_ROUTES` — the page-level gate is a separate,
  already-correct mechanism; this phase only touches the per-route API check.
- Not adding new RLS policies or schema changes — RLS is already complete and correct for all
  4 operations; this phase adds proof, not new enforcement at the database layer.
- Not building any admin/service-role test tooling — every integration test authenticates as a
  real, ordinary seeded user via the anon key and password sign-in, identical to production auth.

## Implementation Approach

Four sequential phases, each independently verifiable: (1) extract the shared auth helper and
refactor the 4 routes onto it, (2) build the shared test-utility contract and expand unit
coverage using it, (3) add the local-only real-RLS integration tier, (4) document everything in
the cookbook and lessons so S-03 inherits the contract without re-deriving it.

## Critical Implementation Details

**Timing & lifecycle**: The default `vitest.config.ts` must exclude `**/*.integration.test.ts`
(Phase 3's naming convention) so `npm run test` / CI never attempts to reach a Supabase instance
that may not be running. The new `test:integration` script uses a separate
`vitest.integration.config.ts` that includes only that pattern. Running the integration tier
locally requires, in order: `npx supabase start` (once), then `npx supabase db reset` (loads
`seed.sql` fresh) before each integration run — reset, not just start, is what (re-)applies the
seed file.

**State sequencing**: `seed.sql` must insert into both `auth.users` and `auth.identities` for
each of the two seeded users (see Key Discoveries) — a users-only seed will silently fail at
sign-in time with an auth error that gives no indication the seed file itself is incomplete.

## Phase 1: Shared auth-check helper

### Overview

Extract the 4 copy-pasted inline auth checks into one helper so the "self-check `locals.user`
first" contract has exactly one implementation.

### Changes Required

#### 1. New auth helper

**File**: `src/lib/auth.ts`

**Intent**: Provide the single implementation of "reject an unauthenticated request with the
standard sign-in redirect" that every `/api/*` route (present and future, including S-03) calls
instead of repeating the inline check.

**Contract**: `requireUser(context: APIContext): User | Response` — returns
`context.locals.user` when present; returns `context.redirect("/auth/signin")` when absent. Callers
narrow with `if (result instanceof Response) return result;` before using the user. This exact
signature is what Phase 2's test-utility module and S-03's future routes depend on — do not change
it without updating both.

#### 2. Route refactors

**Files**: `src/pages/api/tasks/index.ts`, `src/pages/api/tasks/[id].ts`,
`src/pages/api/tasks/[id]/complete.ts`, `src/pages/api/tasks/[id]/delete.ts`

**Intent**: Replace each route's inline `if (!context.locals.user) return context.redirect(...)`
with a call to `requireUser()`, preserving identical external behavior (same redirect, same
"never touch the database" property).

**Contract**: Each route's `POST` handler starts with
`const user = requireUser(context); if (user instanceof Response) return user;` and uses `user`
in place of `context.locals.user` for the rest of the handler (e.g. `index.ts`'s
`user_id: user.id`).

### Success Criteria

#### Automated Verification

- [ ] Unit tests pass: `npm run test`
- [ ] Type checking passes: `npx astro check`
- [ ] Linting passes: `npm run lint`

#### Manual Verification

- [ ] Signed-out `curl -X POST http://localhost:4321/api/tasks` (dev server running) redirects to
  `/auth/signin` exactly as before the refactor

______________________________________________________________________

## Phase 2: Shared test-utility contract + expanded unit tests

### Overview

Give the auth-check contract a literal, importable proof (not just a pattern to copy by eye), and
add the two-distinct-user and spoof-defense cases the current suite is missing.

### Changes Required

#### 1. Shared test-utility module

**File**: `src/test-utils/auth-contract.ts`

**Intent**: One reusable assertion that every route's test file calls to prove the auth-check
contract, instead of each file re-asserting the same two expectations by hand. This is the
literal artifact S-03's future route tests import.

**Contract**: `assertRequiresAuth(handler: APIRoute, buildContext: (user: null) => APIContext, createClientMock: Mock): Promise<void>` —
invokes `handler` with a no-user context and asserts both that the response redirects to
`/auth/signin` and that `createClientMock` was never called. Import path: `@/test-utils/auth-contract`.

#### 2. Apply the helper to all 4 route test files

**Files**: `src/pages/api/tasks/index.test.ts`, `[id].test.ts`, `[id]/complete.test.ts`,
`[id]/delete.test.ts`

**Intent**: Replace each file's hand-written unauthenticated-case assertions with a single call
to `assertRequiresAuth`. This is where `index.test.ts`'s weaker existing assertion (only checks
`insertMock`) gets upgraded to the same `createClientMock`-never-called guarantee the other 3
routes already have.

**Contract**: Each file's existing "no user" `it(...)` block body becomes
`await assertRequiresAuth(POST, makeContext, createClientMock);` (adapting each file's existing
`makeContext` helper to accept `user: null`).

#### 3. Two-distinct-user cross-user unit cases

**Files**: `src/pages/api/tasks/[id].test.ts`, `[id]/complete.test.ts`, `[id]/delete.test.ts`

**Intent**: Add a new case per file, distinct from the existing "empty data" not-found case,
that mocks a request from `user-1` targeting a task id belonging to a different user
(`user-2`), and asserts the query still only filters by `.eq("id", ...)` (no leaking additional
filter) and produces the identical generic not-found redirect as the nonexistent-id case — proving
the app-layer code adds no exploitable filter, independent of what RLS itself does.

**Contract**: New `it("should produce the same generic not-found redirect for another user's task as for a nonexistent one", ...)` per file, reusing each file's existing mock-chain builder with a
task id clearly labeled as belonging to another user (e.g. `"other-users-task"`).

#### 4. `user_id` spoof-defense test

**File**: `src/pages/api/tasks/index.test.ts`

**Intent**: Regression-proof that a client-supplied `user_id` form field can never override the
server-set one, independent of whether `addTaskSchema` happens to include that field today.

**Contract**: New `it("should ignore a client-supplied user_id and insert with the authenticated user's id", ...)` — submit form data including a `user_id` field for a different user, assert the mocked `insert` call's argument has `user_id` equal to the authenticated user's id, not the submitted one.

### Success Criteria

#### Automated Verification

- [ ] Unit tests pass: `npm run test`
- [ ] Type checking passes: `npx astro check`
- [ ] Linting passes: `npm run lint`

#### Manual Verification

- [ ] Reviewer confirms the two-distinct-user cases use a task id clearly distinguishable from the
  "nonexistent" case in test output (so a future reader can tell the two scenarios apart)

______________________________________________________________________

## Phase 3: Real-RLS integration tier (local-only)

### Overview

Add the one tier that can actually reach RLS: two real seeded users, authenticated the same way
production does (password sign-in via the anon key, no admin/service-role key), proving the
database itself — not just the app code — blocks cross-user access.

### Changes Required

#### 1. Seed file

**File**: `supabase/seed.sql`

**Intent**: Provide two fixed, stable test users (with known email/password) and one
`maintenance_tasks` row each, loaded automatically by `supabase db reset`, so integration tests
don't need any admin API to create fixtures.

**Contract**: Inserts two rows into `auth.users` (fixed UUIDs, bcrypt-hashed passwords via
`crypt(..., gen_salt('bf'))`) and their corresponding `auth.identities` rows (required for
password sign-in — see Critical Implementation Details), plus one `maintenance_tasks` row per
user with `user_id` matching. Repo's first seed file — establishes the convention referenced in
`supabase/config.toml`'s existing (commented) seed path.

#### 2. Integration test config + script

**Files**: `vitest.config.ts`, `vitest.integration.config.ts` (new), `package.json`

**Intent**: Keep `npm run test`/CI exactly as they are today (mocked, Docker-free) while adding a
separate, explicitly-invoked command for the real-RLS tier.

**Contract**: `vitest.config.ts` adds `test.exclude` for `**/*.integration.test.ts` (alongside
Vitest's own defaults). `vitest.integration.config.ts` mirrors the `@` alias and sets
`test.include: ["**/*.integration.test.ts"]`. `package.json` adds
`"test:integration": "vitest run --config vitest.integration.config.ts"`.

#### 3. Integration test

**File**: `src/pages/api/tasks/isolation.integration.test.ts`

**Intent**: Prove real RLS: user A can read/update/delete their own task; user A cannot read,
update, or delete user B's task (the operation returns zero affected rows, exactly like the
app-layer "not found" case); user A's insert is rejected if attempted with `user_id` set to user
B's id.

**Contract**: Uses `@supabase/supabase-js`'s plain `createClient(url, anonKey)` (not the app's
`@/lib/supabase` SSR factory — no cookies needed here), reading the local Supabase URL/anon key
from environment variables read via `process.env` (not `astro:env/server`, which is an
Astro-only virtual module unavailable to a plain Vitest run) with the well-known local defaults
(`http://127.0.0.1:54321` and Supabase CLI's standard local demo anon key) as fallback. Signs in
as each seeded user via `auth.signInWithPassword`, then runs the four assertions above directly
against the `maintenance_tasks` table.

### Success Criteria

#### Automated Verification

- [ ] `npx supabase start` succeeds locally
- [ ] `npx supabase db reset` applies `seed.sql` without error
- [ ] Integration tests pass: `npm run test:integration`
- [ ] `npm run test` (default/CI) still passes and does not attempt to reach Supabase
- [ ] Type checking passes: `npx astro check`
- [ ] Linting passes: `npm run lint`

#### Manual Verification

- [ ] Confirm `npm run test` completes successfully with local Supabase **stopped**
  (`npx supabase stop`), proving the default suite has no hidden dependency on it

______________________________________________________________________

## Phase 4: Cookbook + lessons documentation

### Overview

Make the contract established in Phases 1-3 the literal thing S-03 (and any future `/api/*`
route) is held to, per test-plan.md's own cookbook-fills-in-per-phase convention.

### Changes Required

#### 1. Test-plan cookbook update

**File**: `context/foundation/test-plan.md`

**Intent**: Replace §6.2's existing prose with the now-concrete contract, and add a new §6
subsection for the integration tier, so `/10x-tdd` (Lesson 2) and S-03's future planning read the
real pattern, not a placeholder.

**Contract**: §6.2 gains a reference to `requireUser()` and `assertRequiresAuth` (with the
reference test file paths from Phases 1-2). A new §6.x ("Adding a real-RLS integration test") documents the `seed.sql` fixture, the `*.integration.test.ts` naming convention, and the
`npx supabase start && npx supabase db reset && npm run test:integration` command sequence.
§3 Phase 1's Status cell moves to `complete`.

#### 2. Lessons entry

**File**: `context/foundation/lessons.md`

**Intent**: Codify the contract as a standing rule so `/10x-research`/`/10x-plan` for S-03 (and
any future `/api/*` route) surfaces it automatically, per this lesson file's stated purpose.

**Contract**: New append-only entry: every new `/api/*` route must call `requireUser()` for its
auth check and its test file must call `assertRequiresAuth` from `@/test-utils/auth-contract`, plus
add a cross-user case following the Phase 2 pattern; routes whose ownership check matters for RLS
should be covered by the Phase 3 integration tier's pattern too. Cites this change's `plan.md` as
context.

### Success Criteria

#### Automated Verification

- [ ] Linting passes: `npm run lint` (markdown lint-staged formatting on the two edited `.md`
  files)

#### Manual Verification

- [ ] Reviewer confirms §6.2/§6.x read as concrete instructions (file paths, exact commands), not
  restated prose from this plan

______________________________________________________________________

## Testing Strategy

### Unit Tests

- `requireUser()` behavior (returns user vs. returns redirect Response) — `src/lib/auth.test.ts`
- All 4 routes' auth-check via `assertRequiresAuth`
- Cross-user not-found conflation on the 3 mutation routes
- `user_id` spoof-defense on the create route

### Integration Tests

- Real RLS: user A vs. user B read/update/delete/insert against `maintenance_tasks`

### Manual Testing Steps

1. `curl` an unauthenticated `POST /api/tasks` against the dev server, confirm redirect to
   `/auth/signin`
1. Stop local Supabase and run `npm run test`, confirm it still passes (no hidden dependency)
1. Run `npx supabase start && npx supabase db reset && npm run test:integration`, confirm it
   passes against the real local database

## Performance Considerations

None — this phase adds test coverage and a thin helper function; no runtime hot paths are
touched, and the integration tier runs outside the request path.

## Migration Notes

`supabase/seed.sql` is a new, additive file — it does not alter any existing migration and only
affects local/test databases that run `supabase db reset`. No production data or schema is
touched.

## References

- Research: `context/changes/testing-auth-isolation-contract/research.md`
- Test strategy: `context/foundation/test-plan.md` §2 Risks #1-#3, §3 Phase 1
- Prior design decision generalized here: `context/changes/manage-maintenance-tasks/plan.md:108-113,345-349`
- Prior one-time manual RLS check being superseded by Phase 3's automated tier: `context/changes/maintenance-task-data-model/plan.md:145-159,284`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append `— <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Shared auth-check helper

#### Automated

- [x] 1.1 Unit tests pass: `npm run test` — c7699bc
- [x] 1.2 Type checking passes: `npx astro check` — c7699bc
- [x] 1.3 Linting passes: `npm run lint` — c7699bc

#### Manual

- [x] 1.4 Signed-out curl to `/api/tasks` still redirects to `/auth/signin` — c7699bc

### Phase 2: Shared test-utility contract + expanded unit tests

#### Automated

- [x] 2.1 Unit tests pass: `npm run test`
- [x] 2.2 Type checking passes: `npx astro check`
- [x] 2.3 Linting passes: `npm run lint`

#### Manual

- [x] 2.4 Reviewer confirms cross-user vs. nonexistent-id cases are clearly distinguishable in test output

### Phase 3: Real-RLS integration tier (local-only)

#### Automated

- [ ] 3.1 `npx supabase start` succeeds locally
- [ ] 3.2 `npx supabase db reset` applies `seed.sql` without error
- [ ] 3.3 Integration tests pass: `npm run test:integration`
- [ ] 3.4 `npm run test` (default/CI) still passes and does not attempt to reach Supabase
- [ ] 3.5 Type checking passes: `npx astro check`
- [ ] 3.6 Linting passes: `npm run lint`

#### Manual

- [ ] 3.7 `npm run test` passes with local Supabase stopped

### Phase 4: Cookbook + lessons documentation

#### Automated

- [ ] 4.1 Linting passes: `npm run lint`

#### Manual

- [ ] 4.2 Reviewer confirms §6.2/§6.x read as concrete instructions, not restated plan prose
