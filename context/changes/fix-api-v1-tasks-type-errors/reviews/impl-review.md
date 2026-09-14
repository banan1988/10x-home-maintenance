<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Fix API v1 Tasks Type Errors Implementation Plan

- **Plan**: context/changes/fix-api-v1-tasks-type-errors/plan.md
- **Scope**: Full plan (Phase 1 + Phase 2 of 2)
- **Date**: 2026-09-14
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 0 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | PASS    |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Summary

Both sub-agent passes (plan-drift detection and safety/pattern review) came back clean.

**Plan adherence** — all 7 planned changes verified as exact matches against the plan's contracts:

1. `src/lib/api-auth.ts` — `requireApiClient` return type widened to `NonNullable<ReturnType<typeof createClient>> | Response`. MATCH.
1. `src/pages/api/v1/tasks/[id].ts` — `params.id` guard added in GET/PATCH/DELETE, correctly ordered after the user check and before `requireApiClient()`, matching the sibling redirect-based routes' guard ordering. MATCH.
1. `src/pages/api/v1/tasks/[id].ts` PATCH — `update` object rebuilt via destructure-then-conditional-merge, verified semantically identical to the original at runtime. MATCH.
1. `src/pages/api/v1/tasks/[id].test.ts` — `makeContext`'s id defaulting switched to `"id" in overrides ? overrides.id : "task-1"`; one `should return 400 when params.id is missing` test added per handler, none needing `createClientMock.mockReturnValue(...)`. MATCH.
1. `src/pages/api/auth/signup.test.ts` — `createClientMock`'s `vi.fn` initial implementation annotated to include `null` in its return type. MATCH.
1. `package.json` — `"check": "astro check"` script added. MATCH.
1. `.github/workflows/ci.yml` — "Type check" step added between "Sync Astro types" and "Lint". MATCH.

**Documented, not-in-plan additions** (both confirmed sound, not scope creep):

- `eslint.config.js` — `{ ignores: [".claude/worktrees/**"] }` added at explicit user request during Phase 1 to unblock `npm run lint`, which was picking up an unrelated local git worktree checkout only excluded via `.git/info/exclude` (never seen by `includeIgnoreFile()`, which only reads the tracked `.gitignore`). Verified the pattern cannot shadow any real project source path.
- `src/lib/api-auth.ts` — `requireApiAdminClient`'s return type widened identically to `requireApiClient`, required after rebasing this branch onto `main` mid-implementation (`feat/account-deletion` had merged in and introduced the same null-inclusive-return-type bug in this new sibling function). Verified consistent with the `requireApiClient` fix.

**Safety & quality** — the type changes are pure narrowing with no runtime behavior change beyond the intended new 400 responses; the PATCH `update` refactor preserves original "send only what was provided" semantics.

**Success criteria verified directly**: `npx astro check` → 0 errors (86 files), `npm run test` → 102/102 passed, `npm run lint` → 0 errors (2 pre-existing unrelated `no-console` warnings), `npm run build` → succeeds. CI on PR #26 is green including the new "Type check" step.

No findings to triage.
