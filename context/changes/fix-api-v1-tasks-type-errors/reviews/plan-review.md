<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Fix API v1 Tasks Type Errors Implementation Plan

- **Plan**: context/changes/fix-api-v1-tasks-type-errors/plan.md
- **Mode**: Deep
- **Date**: 2026-09-14
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | PASS    |
| Plan Completeness     | WARNING |

## Grounding

8/8 paths ✓ (`src/lib/api-auth.ts`, `src/lib/supabase.ts`, `src/pages/api/v1/tasks/index.ts`, `src/pages/api/v1/tasks/[id].ts`, `src/pages/api/v1/tasks/[id].test.ts`, `src/pages/api/auth/signup.test.ts`, `.github/workflows/ci.yml`, `package.json`), 6/6 symbols ✓ (`requireApiClient`, `createClient`, `makeContext`, `createTaskJsonSchema`/`updateTaskJsonSchema`, sibling guard pattern in `src/pages/api/tasks/[id].ts`, `astro.config.mjs` env schema), brief↔plan ✓.

## Findings

### F1 — New params.id guard tests will get 503, not 400, as specified

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1, Changes #2 and #4
- **Detail**: Change #2's original contract placed the new `params.id` guard after both the `user` and `supabase` `instanceof Response` checks. Since `[id].test.ts`'s `createClientMock` has no default implementation, a test following Change #4's original contract literally (no explicit `createClientMock.mockReturnValue(...)`) would get a 503 from `requireApiClient` before ever reaching the `params.id` guard, not the 400 the assertion expects. This also diverged from the sibling redirect-based route's guard ordering (user → id → supabase).
- **Fix**: Move the `params.id` guard to right after the `requireApiUser` check and before `requireApiClient()`, in all three handlers — matching the sibling route's ordering. This also removes the need for the new tests to mock `createClientMock` at all.
- **Decision**: FIXED — guard reordered in Change #2's contract; Change #4's contract updated to drop the now-unnecessary mock setup.
