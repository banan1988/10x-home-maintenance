<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: E2e Key User Flow Implementation Plan

- **Plan**: context/changes/e2e-key-user-flow/plan.md
- **Scope**: Phase 1-3 of 3 (full plan)
- **Date**: 2026-09-15
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | PASS    |

## Findings

### F1 — Plan's Playwright/CI contracts drifted from shipped reality without a plan update

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `playwright.config.ts:16`, `.github/workflows/ci.yml:78-93`
- **Detail**: Phase 1's contract literally specifies `webServer.reuseExistingServer: !process.env.CI`
  (plan.md:125). The shipped file sets it unconditionally to `true`, and Phase 3 gained an entirely new,
  unitemized "Start and warm up dev server" step in the `e2e` job. Both changes are real, well-justified fixes
  for a genuine CI-only bug (a cold `node_modules/.vite` cache triggering a Vite SSR dependency pre-bundling
  reload mid-test, causing an "Invalid hook call" crash) — confirmed via commits `7aecb8e`, `6fa6581`, `b7b4cec`,
  and both are documented with inline code comments explaining the "why." The issue is narrow: `plan.md`'s
  written Phase 1/Phase 3 contracts were never updated to reflect the final shipped behavior, so a future reader
  trusting `plan.md` as ground truth would be misled about what `webServer`/the CI job actually do.
- **Fix**: Add a short addendum to `plan.md`'s Phase 1 and Phase 3 "Contract" sections noting the
  `reuseExistingServer: true` change and the added dev-server-warmup CI step, with the one-line reason (cold-start
  Vite SSR pre-bundling race), so the plan stays trustworthy as documentation of final behavior.
  - Strength: Two-line addition to a doc that already exists; no code risk, the underlying fixes are already
    correct and verified (independently re-ran `npx playwright test tests/e2e/key-user-flow.spec.ts` — passed).
  - Tradeoff: None meaningful.
  - Confidence: HIGH — this repo's convention (per `references/progress-format.md` and prior lessons) is that
    the plan doc is the durable source of truth for later reviews.
  - Blind spot: None significant.
- **Decision**: FIXED — added addendum to plan.md's Phase 1 and Phase 3 contracts documenting the
  `reuseExistingServer: true` change and the CI warm-up step, with the cold-start Vite SSR race rationale.

### F2 — No failure-path cleanup in the e2e specs

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `tests/e2e/key-user-flow.spec.ts`, `tests/e2e/seed.spec.ts`
- **Detail**: Both specs create a uniquely-named task and delete it as the last happy-path step, but neither
  wraps creation/cleanup in `test.afterEach` or `try/finally`. If a mid-test assertion fails (e.g. during the
  edit or complete step), the created task is never deleted. Low risk today since CI always runs
  `npx supabase db reset` at the start of the `e2e` job, wiping accumulated rows regardless; a local repeated run
  against a dev Supabase instance without a reset in between would accumulate orphan task rows instead.
- **Fix**: Optional — add a `test.afterEach` that deletes the task by name if local iterative debugging without
  `supabase db reset` between runs becomes a common workflow. Not needed now given the CI reset and the plan's
  explicit choice not to auto-orchestrate Supabase setup from `test:e2e`.
- **Decision**: SKIPPED — mitigated by CI's `db reset`; not worth the added complexity now.
