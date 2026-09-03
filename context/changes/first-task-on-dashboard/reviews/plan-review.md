<!-- PLAN-REVIEW-REPORT -->

# Plan Review: User adds a maintenance task and sees it correctly prioritized on the dashboard (S-01)

- **Plan**: `context/changes/first-task-on-dashboard/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-03
- **Verdict**: REVISE → SOUND (all findings fixed in triage)
- **Findings**: 1 critical, 2 warnings, 0 observations — all FIXED

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | FAIL    |

## Grounding

8/8 existing paths ✓, 4/4 new paths correctly absent ✓, 4/4 new symbols collision-free ✓, brief↔plan ✓
(dependency gap surfaced separately — see F1). `context.locals.user.id` confirmed non-optional
(`src/env.d.ts:3`, `@supabase/supabase-js` `User` type). No `docs/reference/contract-surfaces.md` in this
repo — that check was skipped.

## Findings

### F1 — date-fns and zod are never installed as direct dependencies

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 (`src/lib/status.ts`) and Phase 2 (`src/lib/task-schema.ts`)
- **Detail**: Confirmed against `package.json` and `node_modules`: `date-fns` is absent entirely (not in
  `package.json`, not in `node_modules`). `zod` is absent from `package.json` but happens to be physically
  present in `node_modules` v4.4.3 as a *transitive* dependency of something else (per `package-lock.json`) —
  importing it today would work by accident, but a future lockfile change could remove it silently. Neither
  Phase 1 nor Phase 2's "Changes Required" lists an install step. As written, `npm run test` on Phase 1 fails
  immediately with "Cannot find package 'date-fns'".
- **Fix**: Add an explicit install step to each phase's Changes Required: Phase 1 — `npm install date-fns`;
  Phase 2 — `npm install zod` (pin it as a direct dependency even though it's currently reachable transitively).
- **Decision**: FIXED — added "Install dependency" as item 1 in Phase 1 and Phase 2's Changes Required

### F2 — POST /api/tasks' auth-gate has no automated test

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 — API route
- **Detail**: The plan's own Critical Implementation Details section flags this route's self-checked auth as
  the phase's biggest risk (middleware's `PROTECTED_ROUTES` doesn't cover `/api/*`), yet Phase 2's Success
  Criteria cover it only with manual REST-client checks (2.5–2.6), not an automated test. A later refactor
  could silently drop the null-user check with nothing to catch it.
- **Fix A ⭐ Recommended**: Add a Vitest test for the route handler
  - Strength: Directly exercises the exact property the plan calls out as highest-risk; establishes a reusable
    pattern for testing Astro API routes (none exists yet).
  - Tradeoff: Requires hand-building a minimal mock `APIContext` (locals.user, request.formData(), a stubbed
    Supabase client) — no existing precedent in this repo to copy.
  - Confidence: MED — the mocking approach is standard for Astro but unverified against this repo's exact
    Supabase client shape.
  - Blind spot: Haven't confirmed how much boilerplate a minimal `APIContext` mock actually needs.
- **Fix B**: Keep manual-only coverage
  - Strength: Matches the existing precedent — `signin.ts`/`signup.ts`/`signout.ts` have zero automated tests
    today either.
  - Tradeoff: The one route in the repo explicitly flagged as carrying an auth-bypass risk stays
    regression-prone.
  - Confidence: HIGH — this is simply "do nothing," so it's guaranteed consistent with current repo state.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — added `src/pages/api/tasks/index.test.ts` as Phase 2 Changes Required item 4,
  with a matching Automated Verification bullet and Progress item 2.2

### F3 — The "fails to compile" exhaustiveness claim isn't actually enforced

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 Contract / Critical Implementation Details
- **Detail**: The plan says to add "a `default`-less exhaustive switch (or a `satisfies never` fallthrough
  guard) ... so a future enum addition fails to compile." Verified: `eslint.config.js` extends
  `strictTypeChecked`, which does NOT include `@typescript-eslint/switch-exhaustiveness-check`, and no explicit
  rule adds it. Combined with `noImplicitReturns` already confirmed off, a plain default-less switch catches
  nothing — neither TS nor ESLint will flag a future 5th enum value falling through to `undefined`, which is
  exactly the bug class this guard exists to prevent. Only the second, vaguer alternative ("satisfies never
  guard") actually works, and only if written as an explicit `default` branch assigning the narrowed value to a
  `never`-typed variable.
- **Fix**: Rewrite the Phase 1 Contract to specify the concrete pattern — a `default` case doing
  `const _exhaustive: never = frequencyUnit; throw new Error(...)` (or equivalent) — and drop "default-less" as
  an option, since this repo's config gives it no enforcement.
- **Decision**: FIXED — Phase 1 Contract now specifies the explicit `never`-assertion `default` branch and
  drops "default-less" as an option
