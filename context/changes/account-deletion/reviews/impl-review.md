<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Account Deletion Implementation Plan

- **Plan**: context/changes/account-deletion/plan.md
- **Scope**: Phase 1 of 4, Phase 2 of 4, Phase 3 of 4, Phase 4 of 4 (full plan, all phases complete)
- **Date**: 2026-09-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 6 warnings, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — roadmap.md status never resynced at plan close-out

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/roadmap.md (At-a-glance table + S-06 detail "Status:" line); root cause in commits 3d6a688 and 8218043
- **Detail**: Phase-1 commit `3d6a688` flipped S-06's roadmap status to `in-progress` mid-implementation — violating the already-documented lesson "`roadmap.md` status must only be synced by the epilogue step, not a mid-phase commit." The epilogue commit `8218043` then never touched `roadmap.md` at all — violating the separate already-documented lesson "Closing out a plan must also update roadmap.md." Result: `change.md` reads `implemented` and all 4 phases' Progress checkboxes are `[x]`, but `roadmap.md` still shows S-06 as `in-progress`, inconsistent with the `done` convention already used for F-01/S-01/S-02/S-03.
- **Fix**: Update roadmap.md's At-a-glance table Status cell and S-06's detail-section "Status:" line from `in-progress` to `done`.
- **Decision**: FIXED

### F2 — `.env.example` never got its documented placeholder line

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `.env.example` (Phase 1 item 4's contract); Progress item 1.4
- **Detail**: Plan Phase 1 item 4 explicitly required a `SUPABASE_SERVICE_ROLE_KEY=` placeholder line in `.env.example` alongside the README updates. README got all three documented locations correctly (local-setup step, cloud-project table, deployment secrets list), but `.env.example` was never touched by any commit in this feature's range — confirmed via `git diff --name-only 3ce1746^..8218043`, which excludes the file entirely — even though Progress item 1.4 is checked `[x]`.
- **Fix**: Add a `SUPABASE_SERVICE_ROLE_KEY=` placeholder line to `.env.example`, matching the existing two lines' style (fake placeholder, no real value).
- **Decision**: FIXED (manually, by user — Claude is denied file access to `.env*` paths by permission policy)

### F3 — Unplanned `pg`/`@types/pg` dependency added for Phase 4 verification

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: `package.json` (new `pg`/`@types/pg` deps); `src/pages/api/v1/account.integration.test.ts:3,52-64`
- **Detail**: The plan's Phase 4 contract said to verify the cascade "using the admin client... assert a `maintenance_tasks` select ... returns zero rows." The actual test instead adds a new dependency and connects directly to Postgres, bypassing the Supabase client and PostgREST entirely. The in-file comment's justification checks out: `supabase/migrations/20260827194321_create_maintenance_tasks.sql` grants `select/insert/update/delete` on `maintenance_tasks` only to `authenticated`, never to `service_role` — so the plan's literal `adminClient.from("maintenance_tasks").select()` would fail with a Postgres permission error regardless of RLS (RLS bypass and table `GRANT`s are separate mechanisms). The substitution is technically sound, but it's undisclosed scope growth: a new npm dependency shipped without the plan being updated to reflect the actual approach taken.
- **Fix A ⭐ Recommended**: Document the deviation as an addendum to `plan.md`'s Phase 4 section (note the missing `service_role` grant and the `pg`-based verification decision), keeping the working test as-is.
  - Strength: Preserves already-passing, correctly-reasoned test work; the addendum makes the plan an accurate record for future readers.
  - Tradeoff: The `pg` dependency stays in devDependencies for one test file's benefit.
  - Confidence: HIGH — the technical justification is independently verified against the actual migration grants.
  - Blind spot: Haven't confirmed `pg` has zero production-bundle impact (it's devDependency-only, so should be excluded from the Cloudflare Worker bundle, but worth a quick sanity check).
- **Fix B**: Add a `grant select on maintenance_tasks to service_role;` migration and rewrite the test to use `adminClient.from(...).select()` per the plan's literal contract, removing the `pg` dependency.
  - Strength: Matches the plan exactly with no new dependency; keeps verification within the same Supabase-client surface used everywhere else in the app.
  - Tradeoff: Grants `service_role` a standing table privilege it doesn't otherwise need, for the sole benefit of one test.
  - Confidence: MEDIUM — introduces a new migration for a narrow purpose; unverified whether the team wants to avoid giving `service_role` even unused RLS-bypass-capable access to user data as a defense-in-depth principle.
  - Blind spot: Whether this migration would have any other interaction with existing RLS policies.
- **Decision**: FIXED via Fix A — addendum added to plan.md's Phase 4 section

### F4 — PII (email) logged in the account-deletion audit line, even on non-actionable attempts

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/v1/account.ts:34`
- **Detail**: The audit line logs `user.email` and fires before the admin-client-configured guard (line 36), so a request that later 503s (misconfigured server) still logs the requester's raw email into Cloudflare Workers logs. Logging PII in a GDPR-erasure code path, beyond what's needed for the audit trail, is avoidable.
- **Fix**: Drop the email from the log line — log `user.id` and the timestamp only.
- **Decision**: FIXED

### F5 — `deleteUser` failure isn't logged, breaking the sibling-route error-logging convention

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/v1/account.ts:39-42`
- **Detail**: Every sibling `/api/v1/tasks/*` route logs the underlying Supabase error via `console.error` before returning its error response (e.g. `tasks/index.ts:23,58`). `account.ts`'s 502 branch returns silently, losing the only audit trail the plan explicitly designed for this destructive action's failure path (the plan's own "No dedicated audit table" section relies solely on console logging for observability).
- **Fix**: Add `console.error("Failed to delete account:", error);` before the `502` return.
- **Decision**: FIXED

### F6 — New `DELETE /api/v1/account` endpoint undocumented in README

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `README.md:163-171` (Endpoints table)
- **Detail**: CLAUDE.md's repo-wide rule requires documenting new features' usage; the Phase 1 env var got documented in all three required README locations, but the new `DELETE /api/v1/account` endpoint itself was never added to the existing Endpoints table alongside the `/api/v1/tasks*` rows.
- **Fix**: Add a `| DELETE | /api/v1/account | Permanently delete the authenticated user's account (body:`{"confirmEmail": "<their email>"}`) |` row to the Endpoints table.
- **Decision**: FIXED

## Clean areas (verified, no findings)

- Auth gating, server-side confirmation-email validation (cannot be bypassed via a forged/omitted field), session-intact-on-failure ordering (`signOut` only after `deleteUser` succeeds, confirmed by both code and an existing test), double-submit protection in the UI, service-role key never reaching client-shipped code, no SQL injection in the new `pg`-based integration query (parameterized), integration-test connection cleanup (`try/finally`), and the two new shadcn primitives (`input.tsx`/`label.tsx`) avoiding both known install pitfalls from `lessons.md` (`"cn"` package / `next-themes` imports).
- Route sequencing in `src/pages/api/v1/account.ts` matches the plan's "Critical Implementation Details > State sequencing" section exactly.
- `src/middleware.ts`'s `"/account/delete"` addition is the literal string only (no bare `/account` prefix), and does not collide with `/account-deleted` as the plan's reasoning predicted.
- All automated success criteria pass: `npm run lint` (0 errors), `npm run test` (95/95 passing), `npm run build` (succeeds).
