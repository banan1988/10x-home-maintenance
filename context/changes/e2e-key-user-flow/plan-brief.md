# E2e Key User Flow — Plan Brief

> Full plan: `context/changes/e2e-key-user-flow/plan.md`
> Research: `context/changes/e2e-key-user-flow/research.md`

## What & Why

Close `test-plan.md` §3 Phase 5 — the last open risk (#5) in the project's test rollout — by adding a Playwright
e2e test that proves the full login → add task → dashboard → edit → complete → delete flow works through the
real UI. This is the explicit PRD guardrail "a working E2E test of the key user flow exists," and closes the
gap `health-check.md` flagged (no e2e stage in CI at all today).

## Starting Point

Zero Playwright infrastructure exists (no dependency, config, or `tests/e2e/`). CI is one flat job with no
service containers. The feature itself (auth, `/dashboard`, `/tasks` CRUD) already shipped in earlier roadmap
slices — this plan only adds test coverage, not product code. A reusable seeded local test user already exists
(`isolation-test-user-a`) but currently owns one seeded task.

## Desired End State

A developer can run `npx playwright test tests/e2e/key-user-flow.spec.ts` locally (against a running dev server
and local Supabase) and see it pass. Every PR to `main` now runs the same test in CI against an ephemeral local
Supabase stack, and a merge is blocked if the key user flow breaks.

## Key Decisions Made

| Decision                             | Choice                                                            | Why (1 sentence)                                                                                                                                          | Source               |
| ------------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| CI scope                             | Include CI wiring in this plan                                    | `test-plan.md` §5 marks the e2e CI gate "required after Phase 5" — deferring it leaves the guardrail half-closed.                                         | Plan                 |
| Test user strategy                   | Reuse `isolation-test-user-a`, unique task name                   | Matches the existing integration-test convention; avoids depending on the signup/email-confirm flow.                                                      | Plan                 |
| "Correct status" assertion scope     | Assert both `/dashboard` (friendly label) and `/tasks` (raw enum) | The two pages render genuinely different text; the PRD's literal wording only concerns the dashboard, but `/tasks` is where the rest of the flow happens. | Plan                 |
| Happy-path-only vs. + negative check | Happy path + one inline negative assertion (same test)            | `test-plan.md`'s own anti-pattern note for this exact risk names "happy path only" as the failure mode to avoid.                                          | Plan (from Research) |
| CI gate strictness                   | Required (blocking) from day one                                  | Matches `test-plan.md` §5's "required after Phase 5" — a non-blocking gate wouldn't actually close the guardrail.                                         | Plan                 |
| Local dev prerequisite               | Manual (`supabase start && db reset` documented, not automated)   | Matches the existing `test:integration` convention; avoids a destructive `db reset` running implicitly.                                                   | Plan                 |
| Login mechanism in the test          | Real UI login, not `storageState`                                 | Login is the risk under test (test-plan.md risk #5 names it explicitly) — a deliberate exception to `/10x-e2e`'s own default rule.                        | Plan                 |

## Scope

**In scope:**

- Playwright installation, config, and npm script
- One e2e spec covering the full key user flow + one negative assertion
- A new required CI job running that spec against an ephemeral local Supabase stack
- README updates (scripts table, CI section)

**Out of scope:**

- Multi-browser (Firefox/WebKit) coverage
- Fresh-user-per-run signup flow
- Visual/pixel regression testing (test-plan.md §3 Phase 2, separate and still not started)
- Cross-user isolation assertions (already covered by the unit/integration tier)
- The `/account/delete` flow
- Auto-orchestrating local Supabase setup from `test:e2e`

## Architecture / Approach

Three phases, each owned by the skill suited to it: `/10x-implement` sets up Playwright tooling (Phase 1),
`/10x-e2e` plans/generates/reviews/verifies the one risk-tied spec (Phase 2, and creates its own seed-test +
rules levers here), then `/10x-implement` wires CI around the now-real, now-passing spec (Phase 3) — so the CI
job is validated against real content from the start rather than an empty test directory.

## Phases at a Glance

| Phase                        | What it delivers                                             | Key risk                                                                                        |
| ---------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| 1. Playwright Infrastructure | Installed, configured, documented tooling; no test logic yet | Config/webServer misconfiguration surfaces late, in Phase 2                                     |
| 2. Key-User-Flow E2E Test    | One reviewed, risk-tied, deliberate-break-verified spec      | Seeded-task collision or status-boundary flakiness (see plan's Critical Implementation Details) |
| 3. CI Wiring                 | New required `e2e` job; Supabase-in-CI running the real spec | First-ever service-container use in this repo's CI — Docker/Supabase startup flakiness          |

**Prerequisites:** Phase 2 assumes the running app is stable (already true — no product code changes needed).
**Estimated effort:** ~1 session across 3 phases; Phase 3's CI wiring carries the most external-tool uncertainty.

## Open Risks & Assumptions

- `supabase start` in CI has known intermittent "service not healthy" failures on some container combinations
  (tracked upstream); Phase 3 excludes non-essential services to reduce surface area, but isn't guaranteed
  flake-free on first run.
- Enabling the new `e2e` check as a required branch-protection status check is a GitHub repository setting, not
  a file change — Phase 3's manual verification calls this out explicitly since it can't be automated here.
- The chosen `DUE_SOON`-band input values for the test's task avoid known status boundaries, but any future
  change to the FR-008/FR-009 threshold values would need this test's fixture data re-checked too.

## Success Criteria (Summary)

- A human can run one command locally and watch the entire login→CRUD journey pass against the real UI.
- Every future PR that breaks this flow is blocked from merging by CI, not just caught after the fact.
- The test fails when its own risk is deliberately broken (verified once during Phase 2, then reverted) — proving
  it protects something real, not just that it's green.
