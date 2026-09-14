# Injection Guard + CI Gates — Plan Brief

> Full plan: `context/changes/injection-guard-ci-gates/plan.md`
> Research: `context/changes/injection-guard-ci-gates/research.md`

## What & Why

Close test-plan.md §3 Phase 4 ("Injection guard + missing CI gates"). Risk #7 (SQL injection) is unrealized
today — no raw/string-built SQL exists in the codebase — so this is forward-looking guarding, not a live fix:
validate dynamic route ids, add a static CI check against future raw-SQL patterns, and close the
security/dependency-scan CI gate. The typecheck half of this phase's original goal already landed via an
unrelated commit, so the plan only corrects the rollout docs for it.

## Starting Point

Every Supabase call already uses parameterized query-builder methods — zero raw SQL, zero `.rpc()` calls. The
only real gap: 5 `[id]` routes never validate `context.params.id`'s format before querying. CI has lint, test,
build, and (as of today, via an unrelated commit) typecheck — but no security/dependency-scan step at all, and
the repo's private/personal-account tier rules out CodeQL as a free option.

## Desired End State

Malformed route ids are rejected before hitting the database. CI fails on any future raw-SQL pattern or new
high/critical dependency vulnerability. Dependabot watches dependencies in the background. The rollout docs
(`test-plan.md`, `health-check.md`, `lessons.md`) accurately reflect all of this.

## Key Decisions Made

| Decision                  | Choice                                        | Why (1 sentence)                                                                                                                          | Source |
| ------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Dependency-scan tool      | npm audit CI step + Dependabot                | Zero new accounts/secrets; CodeQL is off the table (private personal repo, Enterprise-only tier) and Snyk needs a new third-party account | Plan   |
| npm audit fail policy     | `--audit-level=high`; warn on moderate        | Unblocks CI without an allowlist; the 2 known moderate findings already broke a prior upgrade attempt                                     | Plan   |
| Injection-guard mechanism | Node script (`check-no-raw-sql.mjs`), CI step | Purpose-built for the two real vectors (migration `EXECUTE`, raw `pg.query()`); no viable off-the-shelf ESLint plugin found               | Plan   |
| Route-id validation scope | In scope — add `taskIdSchema = z.uuid()`      | The one concrete gap research found against risk #7's protection bar; small, well-scoped (5 files, same pattern)                          | Plan   |
| Guard/CI placement        | New steps in the existing `ci` job            | Matches this repo's established "small scoped step addition" convention (e.g. the recent typecheck wiring)                                | Plan   |
| Script language           | Node/TS, not bash                             | Repo has zero bash/bats-core infra; introducing it for one grep-style check is disproportionate                                           | Plan   |

## Scope

**In scope:**

- `taskIdSchema` (`z.uuid()`) wired into all 5 `[id]` route handlers
- `scripts/check-no-raw-sql.mjs` + its test + CI wiring + ESLint type-check exclusion
- `.github/dependabot.yaml` + `npm audit --audit-level=high` CI step
- `test-plan.md`, `health-check.md`, `lessons.md` doc sync

**Out of scope:**

- CodeQL, Snyk (cost/tier blockers)
- An allowlist/exceptions mechanism for the raw-SQL check
- Resolving the 2 existing moderate `npm audit` findings
- Banning `.rpc()` calls outright
- e2e / UI component coverage (rollout Phases 2/3/5)

## Architecture / Approach

Four small, independently verifiable phases landing as scoped commits in the existing single `ci.yml` job:
(1) route-id validation, (2) raw-SQL static check + its wiring, (3) dependency-scan CI gate, (4) doc sync.

## Phases at a Glance

| Phase                           | What it delivers                                            | Key risk                                                                                   |
| ------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 1. Route-ID validation          | `taskIdSchema` wired into all 5 `[id]` routes               | Low — additive guard, existing behavior unchanged for valid ids                            |
| 2. Injection-guard static check | `scripts/check-no-raw-sql.mjs` + CI step + ESLint exclusion | Type-aware ESLint choking on the new plain-JS file if the exclusion is missed              |
| 3. Dependency-scan CI gate      | Dependabot config + `npm audit` CI step                     | Wrong `--audit-level` threshold either blocks merges on known findings or misses real ones |
| 4. Rollout-doc sync             | `test-plan.md`/`health-check.md`/`lessons.md` corrected     | None — docs only                                                                           |

**Prerequisites:** None — no dependency on other in-flight changes.
**Estimated effort:** ~1 session across 4 phases; each phase is a handful of files.

## Open Risks & Assumptions

- The raw-SQL grep-style patterns are heuristic, not a full parser — a determined obfuscation could still slip
  past. Accepted given the risk is rated Low likelihood in test-plan.md.
- `npm audit --audit-level=high` assumes no existing high/critical findings; if one exists at implementation
  time, the plan's Phase 3 success criteria will need re-checking before landing.

## Success Criteria (Summary)

- A malformed `[id]` route request returns the same not-found response as a genuine miss, for all 5 routes.
- `node scripts/check-no-raw-sql.mjs` and `npm audit --audit-level=high` both pass in CI on every PR.
- `test-plan.md` §3 Phase 4 reads `complete`, and no stale gate description remains in `health-check.md`.
