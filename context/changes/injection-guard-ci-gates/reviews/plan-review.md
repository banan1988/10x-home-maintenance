<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Injection Guard + CI Gates Implementation Plan

- **Plan**: context/changes/injection-guard-ci-gates/plan.md
- **Mode**: Deep
- **Date**: 2026-09-14
- **Verdict**: REVISE (all findings fixed in this pass — plan is now SOUND)
- **Findings**: 2 critical, 1 warning, 0 observations

## Verdicts (pre-fix)

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | FAIL    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | FAIL    |
| Plan Completeness     | WARNING |

## Grounding

10/10 paths verified, 6/6 symbols confirmed (including `z.uuid()` via context7 against installed zod 4.5.4), brief↔plan consistent.

## Findings

### F1 — npm audit --audit-level=high fails today, before any code lands

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment / Blind Spots
- **Location**: Phase 3 — Dependency-scan CI gate
- **Detail**: `npm audit --audit-level=high --json` on this branch's actual lockfile reports 1 critical + 7 high + 3 moderate findings (astro RCE/XSS, fast-uri SSRF, js-yaml/postcss-selector-parser DoS, the sharp/miniflare/wrangler chain, svgo) — not the "2 moderate" the plan assumed (inherited from a stale `health-check.md` snapshot). A bare severity-threshold gate cannot express "block new findings, not today's known ones," and would fail CI on the first PR after merge.
- **Fix A ⭐ Recommended**: Swap the bare threshold for `audit-ci` (IBM, plain npm devDependency, no new account/secret) with a checked-in `audit-ci.jsonc` allowlist of today's known advisory IDs.
  - Strength: Actually achieves the stated goal — blocks genuinely new high/critical findings, doesn't block on today's known ones.
  - Tradeoff: One more devDependency + an allowlist file to maintain.
  - Confidence: HIGH — verified `audit-ci` exists on the npm registry and supports exactly this allowlist pattern.
  - Blind spot: `audit-ci`'s exact config schema wasn't available via context7; verify against its own README at implementation time.
- **Fix B**: Loosen to `--audit-level=critical`.
  - Strength: Minimal diff from the plan as written.
  - Tradeoff: Doesn't cleanly pass either (astro's critical finding still trips it); leaves 7 high-severity findings unguarded.
  - Confidence: LOW.
- **Decision**: FIXED (Fix A) — plan.md Phase 3, Desired End State, What We're NOT Doing, Current State Analysis, Phase 4 doc-sync contract, Performance Considerations, and Progress §3 all updated to `audit-ci` + allowlist.

### F2 — Raw-SQL check's own regex flags the repo's existing trigger syntax

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Injection-guard static check
- **Detail**: The migration-scan pattern `/\bexecute\b/i` would match `supabase/migrations/20260827194321_create_maintenance_tasks.sql:46` — `execute function set_updated_at();`, standard Postgres trigger-invocation syntax, not dynamic SQL — contradicting Phase 2's own success criteria ("script passes against the current codebase").
- **Fix A ⭐ Recommended**: Narrow the pattern to `/\bexecute\s+(?!function\b|procedure\b)/i` — still catches `EXECUTE format(...)`, `EXECUTE '...'`, `EXECUTE (...)`, excludes `EXECUTE FUNCTION`/`PROCEDURE`.
  - Strength: Directly verified against the one existing EXECUTE usage in this repo.
  - Tradeoff: Still heuristic — an unusually formatted trigger invocation could theoretically evade it.
  - Confidence: HIGH.
- **Fix B**: Scan for `format(...)` with `%s`/`%I`/`%L` placeholders instead of the word "execute".
  - Strength: Removes the DDL-syntax collision class entirely.
  - Tradeoff: Harder to express correctly as a simple line-scan.
  - Confidence: MEDIUM.
- **Decision**: FIXED (Fix A) — plan.md Phase 2 script contract and script-test contract updated with the negative-lookahead pattern and an explicit "must not flag EXECUTE FUNCTION" test assertion.

### F3 — Phase 1's Changes Required omits the test-file edits its own Testing Strategy promises

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Route-ID validation
- **Detail**: Testing Strategy promises a new malformed-id test case per route, but Phase 1's Changes Required didn't list the 5 existing test files, and Progress 1.1 would pass trivially without the new assertions ever being written.
- **Fix**: Add the 5 test files to Phase 1's Changes Required (new item #4) and reword Progress 1.1 to require the new cases explicitly.
- **Decision**: FIXED — plan.md Phase 1 now has an explicit "Route test coverage" changes-required item and Progress 1.1 requires the new malformed-id cases.

## Outcome

All 3 findings fixed directly in `plan.md` during triage. Plan is ready for `/10x-implement`.
