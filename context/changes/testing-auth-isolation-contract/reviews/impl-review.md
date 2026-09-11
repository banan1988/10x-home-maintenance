<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Auth/Isolation Contract — Implementation Plan

- **Plan**: context/changes/testing-auth-isolation-contract/plan.md
- **Scope**: Phase 1-4 of 4 (full plan)
- **Date**: 2026-09-11
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — Integration test's SUPABASE_URL fallback can silently target a non-local project

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/tasks/isolation.integration.test.ts:9-14
- **Detail**: `process.env.SUPABASE_URL` / `SUPABASE_ANON_KEY` are read first and only fall back to
  local defaults (`http://127.0.0.1:54321` + the well-known Supabase CLI local demo anon key) if
  unset. This is the *same* env var name production and CI's build step use
  (`.github/workflows/ci.yml` injects `secrets.SUPABASE_URL`). If a developer runs
  `npm run test:integration` in a shell where `SUPABASE_URL` is exported to a real project (e.g.
  sourced from a root `.env`, which is this repo's own documented convention), the test would
  attempt to sign in against that real project instead of localhost — it would most likely just
  fail (the fixture accounts/local anon key won't exist there), but nothing fails loudly and
  explicitly on the mismatch itself. Currently safe in CI only because `test:integration` is never
  invoked there and `vitest.config.ts` excludes the file from the default `npm run test` run
  (verified by running both suites).
- **Fix A ⭐ Recommended**: Add a guard at the top of the test file that throws a clear error if
  `SUPABASE_URL` is set but doesn't start with `http://127.0.0.1` or `http://localhost`, before any
  `signInWithPassword` call runs.
  - Strength: Fails loudly and immediately instead of a confusing downstream auth error; minimal,
    narrowly-scoped change (a few lines).
  - Tradeoff: Still relies on a runtime check rather than making the collision structurally
    impossible.
  - Confidence: HIGH — straightforward assertion, no ambiguity in behavior.
  - Blind spot: None significant.
- **Fix B**: Rename the vars this test reads to something integration-tier-specific (e.g.
  `INTEGRATION_SUPABASE_URL` / `INTEGRATION_SUPABASE_ANON_KEY`) so they can never collide with the
  app's/CI's `SUPABASE_URL`.
  - Strength: Structurally impossible to collide — stronger guarantee than a runtime check.
  - Tradeoff: Introduces a second env-var naming convention for the same underlying concept
    (local Supabase URL/key) that isn't documented anywhere in the plan or test-plan.md §6.x; would
    need a follow-up doc update to keep Phase 4's "literal, importable contract" promise accurate.
  - Confidence: MEDIUM — solid mitigation but changes the documented Phase 3 contract (which
    specifies reading via `process.env`) after the fact.
  - Blind spot: Haven't checked whether any other tooling or setup docs already assume
    `SUPABASE_URL` doubles as the integration-tier var.
- **Decision**: FIXED — applied Fix A (guard added at isolation.integration.test.ts:16-22; verified
  `npm run test` 44/44 passing and `npm run lint` clean afterward).

### F2 — No code comment flags the RLS-only ownership design as intentional

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/tasks/[id].ts:42, src/pages/api/tasks/[id]/complete.ts:28,
  src/pages/api/tasks/[id]/delete.ts:22
- **Detail**: All three mutation routes filter only by `.eq("id", ...)`, deferring ownership
  enforcement entirely to RLS — a deliberate, already-documented, and now RLS-integration-tested
  design (per plan.md's Current State Analysis), not a gap. But nothing in the route code itself
  flags this as intentional, so a future editor unfamiliar with the plan could mistake it for a
  missing filter and "fix" it by adding a redundant or subtly wrong app-layer check.
- **Fix**: Add a one-line comment at each `.eq("id", ...)` call, e.g. "ownership enforced by RLS,
  see supabase/migrations/20260827194321_create_maintenance_tasks.sql".
- **Decision**: FIXED + ACCEPTED-AS-RULE — comments added at all 3 call sites; verified
  `npm run test` 44/44 passing and `npm run lint` clean afterward. Recorded as a standing rule in
  `context/foundation/lessons.md` ("RLS-only ownership filters need an explicit code comment").

### F3 — auth.test.ts breaks the repo's `it("should ...")` naming convention

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/auth.test.ts:13,21
- **Detail**: Uses bare descriptions ("returns the authenticated user when present", "returns a
  redirect to /auth/signin...") while every other `*.test.ts` file in the repo (task-schema.test.ts,
  status.test.ts, supabase.test.ts, and all four `src/pages/api/tasks/*.test.ts` files)
  consistently phrases `it()` titles as "should ...".
- **Fix**: Rename to "should return the authenticated user when present" / "should return a
  redirect to /auth/signin when there is no authenticated user".
- **Decision**: FIXED + ACCEPTED-AS-RULE — both `it()` titles renamed; verified `npm run test` 44/44
  passing and `npm run lint` clean afterward. Recorded as a standing rule in
  `context/foundation/lessons.md` ("Test titles must use the `it(\"should ...\")` phrasing").

## Notes

- Plan-drift sub-agent found zero DRIFT/MISSING/EXTRA across all 4 phases — every file, contract,
  and test case matches plan.md exactly.
- Git scope check: diff file list matches the plan's declared file list exactly — no unplanned
  files.
- Re-ran automated gates on the current tree (not just trusting the `## Progress` checkmarks):
  `npm run test` — 9 files / 44 tests passed; `npm run lint` — clean (only benign
  `astro-eslint-parser` informational messages, no errors).
- No CRITICAL findings. No security defects (the seed.sql credentials and hardcoded anon key were
  independently verified as the standard public Supabase CLI local-demo values, not real secrets).
