---
date: 2026-09-11T09:49:41+02:00
researcher: Claude Code
git_commit: e24c2ff8f6ba6aa2ff8a82fbe53fba355063831b
branch: chore/testing-auth-isolation-contract
repository: banan1988/10x-home-maintenance
topic: "Auth/isolation contract — generalized and required for S-03 (test-plan.md §3 Phase 1)"
tags: [research, codebase, auth, rls, idor, middleware, api-routes, test-plan-phase-1]
status: complete
last_updated: 2026-09-11
last_updated_by: Claude Code
---

# Research: Auth/isolation contract — generalized and required for S-03

**Date**: 2026-09-11T09:49:41+02:00
**Researcher**: Claude Code
**Git Commit**: e24c2ff8f6ba6aa2ff8a82fbe53fba355063831b
**Branch**: chore/testing-auth-isolation-contract
**Repository**: banan1988/10x-home-maintenance

## Research Question

This is `context/foundation/test-plan.md` §3 Phase 1: turn the existing auth-gate + cross-user
isolation pattern into an explicit, testable convention required for S-03 too. Covers risks #1
(IDOR), #2 (API route ships without its own auth check), and #3 (S-03 needs the same rigor).
Test types: unit + integration.

## Summary

The codebase already implements the *intended* isolation design correctly, but with **zero
automated coverage of the isolation behavior itself** and **zero shared convention** enforcing it
for future routes:

- **RLS is complete and correct.** The single table in scope, `maintenance_tasks`, has RLS enabled
  with four granular, per-operation policies (SELECT/INSERT/UPDATE/DELETE), all `to authenticated`,
  all keyed on `auth.uid() = user_id`, including `WITH CHECK` on UPDATE (prevents re-parenting a row
  to another user). No service-role key exists anywhere in the app — only the anon key is
  configured (`astro.config.mjs`), so RLS is never bypassed.
- **The auth check is deliberately app-layer, the ownership check is deliberately DB-layer, and
  this split is documented as an intentional design decision**, not a gap:
  `context/changes/manage-maintenance-tasks/plan.md:108-113` states outright that mutation routes
  "never" add a redundant `user_id` filter — RLS alone decides ownership, and a cross-user request
  and a nonexistent-ID request must produce byte-identical generic "not found" output (to avoid an
  existence-leak oracle). Verified live in every mutation route.
- **The auth check itself is copy-pasted four times with no shared helper.** `src/middleware.ts`'s
  `PROTECTED_ROUTES` list (`/dashboard`, `/tasks`) never matches `/api/*`, so each of
  `src/pages/api/tasks/{index.ts,[id].ts,[id]/complete.ts,[id]/delete.ts}` independently repeats
  `if (!context.locals.user) return context.redirect("/auth/signin");`. This gap was already known
  at S-01 time (`first-task-on-dashboard/reviews/impl-review.md:128`) and accepted, but nothing
  currently *enforces* that a new route (e.g. S-03) copies the pattern correctly.
- **No existing test constructs two distinct users.** All four route test files mock a single
  Supabase response (`data: []`) that stands in for "not found or not yours" — this was a deliberate
  simplification at spec-writing time (`manage-maintenance-tasks/plan.md:345-349`), and the only
  place real cross-user isolation was ever verified is a one-time **manual** SQL/JWT-impersonation
  check during the original migration's implementation
  (`maintenance-task-data-model/plan.md:145-159,284`) — never automated, never re-run since.
- **S-03 (`maintenance-tasks-api`, roadmap) is `proposed`, depends only on `F-01`**, and per PRD
  FR-011 must expose the same CRUD surface as a public API. It will need the identical
  auth-check + ownership-defers-to-RLS convention this phase should make explicit and testable.

This phase's job is therefore not "find and fix an isolation bug" — none exists today — but to
convert an implicit, three-times-repeated, once-manually-verified convention into an explicit,
automatically-enforced contract that S-03's new routes can be held to.

## Detailed Findings

### API routes and the auth-check pattern

| Route file                                      | Methods       | Auth check                                            | Ownership check                                                                                                                         | Notes                               |
| ----------------------------------------------- | ------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| `src/pages/api/tasks/index.ts:9-11`             | POST          | `if (!context.locals.user)` → redirect `/auth/signin` | N/A (insert only; `user_id` set server-side from `context.locals.user.id` at line 29 — can't be spoofed via form body)                  | zod via `addTaskSchema`             |
| `src/pages/api/tasks/[id].ts:11-13`             | POST (update) | same inline pattern                                   | **None at app layer** — `.eq("id", context.params.id)` only (line 42), no `.eq("user_id", ...)`; relies entirely on RLS `UPDATE` policy | zod via `addTaskSchema`             |
| `src/pages/api/tasks/[id]/complete.ts:10-12`    | POST          | same inline pattern                                   | **None at app layer** — `.eq("id", ...)` only (line 28); relies entirely on RLS                                                         | no body fields, no zod needed       |
| `src/pages/api/tasks/[id]/delete.ts:9-11`       | POST          | same inline pattern                                   | **None at app layer** — `.eq("id", ...)` only (line 22); relies entirely on RLS                                                         | same not-found conflation           |
| `src/pages/api/auth/{signin,signup,signout}.ts` | POST          | N/A by design (pre-auth / no-op)                      | N/A                                                                                                                                     | raw `formData.get()`, no zod schema |

- The four `locals.user` checks (`index.ts:9-11`, `[id].ts:11-13`, `[id]/complete.ts:10-12`,
  `[id]/delete.ts:9-11`) are the **only** occurrences of `locals.user` outside `middleware.ts` — no
  shared `requireUser(context)` helper exists.
- `src/middleware.ts:4` — `const PROTECTED_ROUTES = ["/dashboard", "/tasks"]`; matching is
  `context.url.pathname.startsWith(route)` (`src/middleware.ts:18`). No entry matches `/api/*`, and
  no accidental overlap was found (`/api/tasks/...` does not start with `/tasks`).
  `src/middleware.ts:9-16` sets `context.locals.user` unconditionally on every request (including
  API requests) via `supabase.auth.getUser()` — so `locals.user` is always populated correctly by
  the time a route handler runs; only the *redirect gate* is page-scoped, not the user resolution.
- `src/lib/supabase.ts:3,10` — `createServerClient` built from `SUPABASE_URL`/`SUPABASE_KEY`
  (`astro:env/server`), confirmed anon key (see below), single factory used everywhere (no separate
  browser client, no separate elevated client).
- Not-found vs. forbidden are **indistinguishable by design** in all three mutation routes:
  `data.length === 0` triggers the same generic redirect whether the row doesn't exist or belongs to
  another user — this is a correct anti-oracle pattern, not a defect.

### RLS policies (Supabase)

Single table in scope: `maintenance_tasks`
(`supabase/migrations/20260827194321_create_maintenance_tasks.sql`).

| Op     | Policy                                                    | USING                  | WITH CHECK             |
| ------ | --------------------------------------------------------- | ---------------------- | ---------------------- |
| SELECT | `"Users can select their own maintenance tasks"` (:55-58) | `auth.uid() = user_id` | n/a                    |
| INSERT | `"Users can insert their own maintenance tasks"` (:60-63) | n/a                    | `auth.uid() = user_id` |
| UPDATE | `"Users can update their own maintenance tasks"` (:65-69) | `auth.uid() = user_id` | `auth.uid() = user_id` |
| DELETE | `"Users can delete their own maintenance tasks"` (:71-74) | `auth.uid() = user_id` | n/a                    |

- `alter table maintenance_tasks enable row level security;` at `:48`. RLS is enabled and **no
  operation is missing a policy** — full 4/4 CRUD coverage, all `to authenticated`.
  `grant select, insert, update, delete on table maintenance_tasks to authenticated;` (`:53`) is
  required base-table privilege infrastructure (RLS doesn't itself grant access), not a bypass.
- `20260828192519_harden_set_updated_at_search_path.sql` only hardens a trigger function's
  `search_path` (per the existing `lessons.md` entry on that topic) — no table/policy changes.
- No service-role key found anywhere in `src/` (searched `service_role`, `SUPABASE_SERVICE_ROLE_KEY`,
  `SERVICE_ROLE`, case-insensitive — zero matches). `astro.config.mjs:17-22` declares only
  `SUPABASE_URL` and `SUPABASE_KEY` (both `context: "server", access: "secret"`) — no service-role
  var is part of this app's declared config at all.
- `src/db/database.types.ts:6-44` matches the migration's table/column shape exactly — no schema
  drift to account for.

### Existing test coverage and mocking pattern

All four route test files (`src/pages/api/tasks/{index,[id],[id]/complete,[id]/delete}.test.ts`)
share one skeleton: `vi.hoisted()` builds a `createClientMock`, `vi.mock("@/lib/supabase", ...)`
substitutes it, then the route module is dynamically `import()`-ed so the mock is active first.
`vitest.config.ts` — `environment: "node"`, alias `@` → `./src`, no setup files.

- **Unauthenticated-rejection tests exist and are strong** in `[id].test.ts:44-51`,
  `[id]/complete.test.ts:29-36`, `[id]/delete.test.ts:25-32`: each asserts the redirect **and**
  `expect(createClientMock).not.toHaveBeenCalled()` — proving the DB was never touched, not just
  that a redirect happened. `index.test.ts:38-55` is weaker: it only asserts `insertMock` (not
  `createClientMock`) was never called.
- **No test constructs two distinct users or asserts cross-user data is unmutated.** Every mutation
  route's "not found" test mocks a single `data: []` response standing in for "not found *or* not
  yours" (e.g. `[id].test.ts:68-79`) — this directly mirrors the spec at
  `manage-maintenance-tasks/plan.md:345-349`, which explicitly folded "cross-user" and "nonexistent"
  into one mocked case rather than giving cross-user its own scenario.
- **Real cross-user isolation (RLS) is unreachable from Vitest** — the mocked Supabase client has no
  RLS semantics, so a unit test can only prove (a) the route queries `.eq("id", <id>)` and adds no
  leaking filter, and (b) the generic redirect is byte-identical for the not-found/not-yours case. It
  cannot prove RLS itself works. The only place that was ever verified is a **manual**, one-time SQL
  `set local request.jwt.claims` impersonation check documented in
  `context/changes/maintenance-task-data-model/plan.md:145-159`, explicitly not automated
  (`:284` — "No automated pgTAP/SQL test suite — verification is manual").

### Roadmap and PRD context for S-03

- `context/foundation/roadmap.md:150-163` — **S-03** (`maintenance-tasks-api`): "a user (via the API,
  using their own authenticated session) can create, read, update, and delete their maintenance
  tasks," PRD ref FR-011 only, depends only on `F-01`, **status `proposed`**. Explicitly parallel to
  S-01/S-02 (Stream C), no dependency on either.
- `context/foundation/prd.md` Guardrails (:51-55): "A user has no access to another user's data";
  NFR (:140): "No user's maintenance data is ever exposed to another user, through any interface (UI
  or API)"; FR-011 (:131-134): CRUD via API, "required per the seed spec independent of consumer
  count."
- `context/archive/` is currently **empty** — F-01, S-01, S-02 are all `done` per roadmap but their
  change folders remain under `context/changes/`, not yet archived.
- `chore/testing-e2e-critical-path` (the branch mentioned in `test-plan.md`'s freshness note) has no
  folder in this worktree's `context/changes/` — confirmed out of scope, exists only on that
  unmerged branch.

## Code References

- `src/middleware.ts:4,9-16,18-20` — `PROTECTED_ROUTES`, unconditional `locals.user` resolution, page-only redirect gate
- `src/lib/supabase.ts:3,6,10` — single SSR client factory, anon key only
- `src/pages/api/tasks/index.ts:9-11,29` — auth check; server-set `user_id` on insert
- `src/pages/api/tasks/[id].ts:11-13,42,45-47` — auth check; ownership deferred to RLS; generic not-found redirect
- `src/pages/api/tasks/[id]/complete.ts:10-12,28` — auth check; ownership deferred to RLS
- `src/pages/api/tasks/[id]/delete.ts:9-11,22` — auth check; ownership deferred to RLS
- `supabase/migrations/20260827194321_create_maintenance_tasks.sql:21-32,48,53,55-74` — schema, RLS enable, 4 per-operation policies
- `src/pages/api/tasks/index.test.ts:38-55` — unauthenticated case (weaker assertion, checks `insertMock` not `createClientMock`)
- `src/pages/api/tasks/[id].test.ts:44-51,68-79` — strongest existing unauthenticated pattern; conflated not-found/not-yours case
- `vitest.config.ts:1-14` — test environment/config

## Architecture Insights

- **Convention already exists, just not codified.** Every route follows "self-check `locals.user`
  first, defer ownership to RLS, treat empty-result as generic not-found" — but it's three separate
  copies of the same four lines, not a shared function. Phase 1's most direct value-add is likely
  extracting this into one helper (or, at minimum, a documented + test-enforced contract) so S-03's
  new routes can't silently diverge — this is exactly what test-plan.md Risk #2's "What must be
  challenged" flags ("middleware protects everything" is false, and nothing currently *enforces*
  the per-route self-check pattern for new code).
- **The generic-error conflation is a feature, not a bug** — any new test must assert the two cases
  produce identical output, not try to distinguish them (that would reintroduce the leak the current
  design avoids).
- **A unit/integration test in this codebase's Vitest setup cannot prove RLS correctness** — it can
  only prove the route code doesn't add its own IDOR hole and reacts identically to the RLS-shaped
  "empty result" signal. Proving RLS itself holds requires either a real Supabase instance
  (integration test against `npx supabase start`) or a manual SQL check like the one already
  documented for F-01. This is worth deciding explicitly in the plan: does Phase 1 add an
  integration-tier test against a local Supabase instance, or does it stay at the mocked-unit tier
  and treat RLS correctness as covered by the existing (manual, one-time) F-01 verification plus a
  new manual regression checklist? test-plan.md's own guidance (§2 Risk #1 Cheapest layer hypothesis)
  says "unit/integration on the route handler" — this decision belongs to `/10x-plan`, not this
  research, but the constraint should be surfaced there.

## Historical Context (from prior changes)

- `context/changes/manage-maintenance-tasks/plan.md:61-64,108-113,345-349,514` — the design decision
  this phase generalizes: RLS-only ownership enforcement, generic conflated not-found/not-yours
  error, and the explicit choice (at spec time) to fold cross-user and nonexistent-ID into one test
  case rather than two.
- `context/changes/manage-maintenance-tasks/plan.md:367-368,436-437,499-500` — cross-user isolation
  was pushed to **manual** verification ("POST to `/api/tasks/<another user's task id>` ... confirm a
  generic 'Task not found' redirect"), never automated. This is the concrete gap Phase 1 should
  close per test-plan.md.
- `context/changes/maintenance-task-data-model/plan.md:145-159,284` — the one-time manual SQL/JWT
  impersonation check that is, to date, the *only* verification RLS itself ever received.
- `context/changes/maintenance-task-data-model/reviews/plan-review.md:29-37` — a prior review already
  flagged that a manual RLS-impersonation test description lacked exact SQL, risking a false-pass
  (`auth.uid() = NULL` silently returning zero rows "for the wrong reason") — relevant precedent if
  Phase 1's plan writes its own manual/integration RLS check.
- `context/changes/first-task-on-dashboard/reviews/impl-review.md:128` — confirms the
  middleware-doesn't-cover-`/api/*` gap was already known and accepted at S-01 time.
- `context/foundation/lessons.md` — no entry yet specific to this phase's likely outcome (a shared
  auth-check helper, or a documented contract test); once this phase lands, consider whether "every
  new `/api/*` route must use the shared auth-check helper / pass the isolation contract test" is
  worth adding as a lesson.

## Related Research

None yet — this is the first `/10x-research` pass for `testing-auth-isolation-contract`.

## Open Questions

1. **Unit-mock tier vs. integration-against-real-Supabase tier**: should Phase 1 add a real
   Supabase-backed integration test (two seeded users, real RLS enforcement) in addition to/instead
   of extending the existing mocked-Vitest pattern? The existing suite has never done this; F-01's
   only real-RLS check was manual and one-off. This is the single biggest design decision left for
   `/10x-plan`.
1. **Should the four copy-pasted auth checks be refactored into a shared helper** (e.g.
   `requireUser(context)`) as part of this phase, or should the phase only add tests against the
   current inline pattern and leave refactoring to a separate change? Test-plan Risk #2's guidance
   implies the contract should be enforced going forward, which argues for a shared helper, but that
   is a code change beyond "add tests" and should be confirmed with the user before `/10x-plan`
   scopes it in or out.
1. Risk #3 (S-03 parity) is inherently about code that doesn't exist yet — this research found no
   S-03 code to ground against (roadmap confirms `status: proposed`). Whatever contract/helper Phase
   1 establishes should be written so S-03's `/10x-research` (when that change opens) can point back
   to it directly.
