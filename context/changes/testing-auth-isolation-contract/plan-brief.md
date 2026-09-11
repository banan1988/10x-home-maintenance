# Auth/Isolation Contract — Plan Brief

> Full plan: `context/changes/testing-auth-isolation-contract/plan.md`
> Research: `context/changes/testing-auth-isolation-contract/research.md`

## What & Why

The app's auth-check + "defer ownership to RLS" pattern is already correct across all 4 mutation
routes, but it's copy-pasted four times with zero automated proof that cross-user isolation
actually holds. This phase (test-plan.md §3 Phase 1) turns that implicit convention into an
explicit, enforced, testable contract — closing Risks #1 (IDOR), #2 (a route shipping without its
own auth check), and #3 (S-03 needs the same rigor) — before S-03's public CRUD API is built.

## Starting Point

4 route files each repeat `if (!context.locals.user) return context.redirect("/auth/signin")`
inline; RLS (4/4 per-operation policies, no service-role key anywhere) is correct but has never
been automatically verified — only a one-time manual SQL/JWT-impersonation check during F-01. No
test constructs two distinct users; the mocked Supabase client used everywhere has no RLS
semantics.

## Desired End State

One `requireUser()` helper is the only auth-check implementation. A shared, importable test
utility proves that contract identically on every route. A new local-only integration tier signs
in as two real seeded users (no admin key) and proves RLS itself blocks cross-user access. `npm run test`/CI stay exactly as fast and Docker-free as today. The cookbook and lessons document the
contract literally enough that S-03's future routes/tests can point back to it.

## Key Decisions Made

| Decision                          | Choice                                                                             | Why (1 sentence)                                                                                                                | Source |
| --------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Integration-tier CI timing        | Local-only this phase; CI wiring deferred to §3 Phase 4                            | Docker/CI wiring is explicitly Phase 4's job ("missing CI gates"); pulling it in here would duplicate planned work.             | Plan   |
| Auth-check refactor               | Extract `requireUser()` shared helper                                              | A documented-only convention with nothing enforcing it is exactly the gap Risk #2 names.                                        | Plan   |
| Cross-user fixture users          | Predefined `seed.sql`, no admin/service-role API                                   | Avoids ever needing an admin key in test code; a stable fixture reusable by S-03's future integration tests.                    | Plan   |
| S-03 contract form                | Shared test-utility function (`assertRequiresAuth`) + cookbook doc                 | Gives S-03 a literal, importable contract instead of prose to remember.                                                         | Plan   |
| Create-route `user_id` spoof test | Add it                                                                             | Closes the one route with no isolation-flavored test today; matches PRD NFR on cross-user data exposure.                        | Plan   |
| Mocked-unit cross-user depth      | Add explicit two-user cases per mutation route, alongside the new integration tier | Cheap, fast, per-PR signal that complements (not replaces) the real-RLS proof; matches test-plan.md's own cost×signal guidance. | Plan   |

## Scope

**In scope:**

- `requireUser()` helper + refactor of all 4 routes
- Shared test-utility module + expanded unit tests (two-user cases, spoof test, upgraded
  create-route assertion)
- `supabase/seed.sql` + separate `vitest.integration.config.ts`/`test:integration` script +
  real-RLS integration test
- `test-plan.md` §6 cookbook update + a new `lessons.md` entry

**Out of scope:**

- Full HTTP-level integration tests against a running Astro dev server
- Wiring Docker/Supabase into CI (test-plan.md §3 Phase 4)
- Any change to `src/middleware.ts` / page-level `PROTECTED_ROUTES`
- New RLS policies or schema changes
- Any admin/service-role test tooling

## Architecture / Approach

```
requireUser() (src/lib/auth.ts)
        │
        ├─► used by all 4 route handlers (Phase 1)
        │
assertRequiresAuth (src/test-utils/auth-contract.ts)
        │
        ├─► used by all 4 route test files (Phase 2)
        │
seed.sql (2 real users, no admin key) ──► isolation.integration.test.ts (Phase 3, local-only)
        │
        └─► documented in test-plan.md §6 + lessons.md (Phase 4) — S-03 inherits directly
```

## Phases at a Glance

| Phase                            | What it delivers                                                 | Key risk                                                                 |
| -------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1. Shared auth-check helper      | `requireUser()`, all 4 routes refactored                         | Behavior drift during refactor (redirect target, `user_id` source)       |
| 2. Test-utility contract + tests | `assertRequiresAuth`, two-user cases, spoof test                 | Mock-chain differences across routes make a fully generic helper awkward |
| 3. Real-RLS integration tier     | `seed.sql`, `test:integration` script, real cross-user RLS proof | Seed file missing `auth.identities` silently breaks sign-in              |
| 4. Cookbook + lessons            | Concrete §6 entries, new lessons.md rule                         | Documentation drifting from what Phases 1-3 actually built               |

**Prerequisites:** Docker running locally for Phase 3 (`npx supabase start`); no other external
dependencies.
**Estimated effort:** ~1-2 sessions across 4 phases.

## Open Risks & Assumptions

- Assumes Supabase CLI's local demo anon key stays stable enough to hardcode as a fallback in the
  integration test; if it changes, the test needs an explicit env var instead.
- Assumes `auth.identities` is still required for local password sign-in on the pinned `supabase`
  CLI version — worth a quick smoke check at Phase 3 implementation time.

## Success Criteria (Summary)

- Every `/api/*` route rejects an unauthenticated request identically, proven by one shared
  assertion, not four hand-written copies.
- A real cross-user request against another user's task is proven blocked at the database level,
  not just "the mocked query looked right."
- `npm run test`/CI remain unchanged in speed and dependencies; the new integration tier is
  strictly additive and opt-in.
