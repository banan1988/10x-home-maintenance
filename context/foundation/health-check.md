---
project: "Home Maintenance"
checked_at: 2026-08-15T19:13:40Z
health_status: healthy
context_type: brownfield
language_family: js
stack_assessment_available: false
checks_run:
  - lockfile
  - dependency_audit
  - outdated_deps
  - test_runner
  - ci_cd
  - configuration
audit_findings:
  critical: 0
  high: 0
  moderate: 2
  low: 0
test_runner_detected: true
ci_provider: "GitHub Actions"
recommended_fixes: 2
---

# Health Check: Home Maintenance

## Dependency Health

### Lockfile

```
Status: present (package-lock.json)
Package manager: npm
```

### Security Audit

```
Tool: npm audit --json
Summary: 0 CRITICAL, 0 HIGH, 2 MODERATE, 0 LOW
Direct vs transitive: both findings are direct dependencies (astro, @astrojs/cloudflare)
```

#### MODERATE findings

- **astro** 6.4.8 — [GHSA-f48w-9m4c-m7f5](https://github.com/advisories/GHSA-f48w-9m4c-m7f5): XSS via unescaped spread attribute names in `renderHTMLElement` (incomplete fix for CVE-2026-54298). Fix available at astro 7.2.2 (semver-major).
- **astro** 6.4.8 — [GHSA-4g3v-8h47-v7g6](https://github.com/advisories/GHSA-4g3v-8h47-v7g6): Reflected XSS via unescaped View Transition animation properties. Fix available at astro 7.2.2 (semver-major).
- **@astrojs/cloudflare** 13.5.0 — inherits the astro advisory above via its `astro` peer dependency. Fix available at 14.2.1 (semver-major).

**Upgrade attempted and reverted in a previous check.** Ran `npx @astrojs/upgrade` (astro 7.2.2, `@astrojs/cloudflare` 14.2.1, `@astrojs/react` 6.0.2). Lint and tests passed, but `npm run build` failed with two different internal Vite/Rollup errors depending on `prerenderEnvironment` configuration — a genuine upstream incompatibility, not a local config issue. Reverted; project confirmed working on astro 6.4.8 / `@astrojs/cloudflare` 13.5.0. Validates the original deferred decision in the project's history.

### Outdated Dependencies

```
Packages with major version gaps: 8
```

- **eslint-plugin-astro**: 1.7.0 → 3.1.0 (2 major versions behind)

Also 1 major behind: `astro` (6→7 — see Security Audit above), `@astrojs/cloudflare` (13→14), `@astrojs/react` (5→6), `eslint` (9→10), `@eslint/js` (9→10), `lint-staged` (16→17), `typescript` (6→7).

## Test Suite

```
Test runner: Vitest 4.1.10
Tests found: 3 tests
Test execution: passing
```

Configuration: `vitest.config.ts` (plain `defineConfig` from `vitest/config`, not Astro's `getViteConfig()`)
Framework: Vitest 4.1.10

## CI/CD

```
Provider: GitHub Actions
Configuration: .github/workflows/ci.yml
```

| Stage      | Status | Notes                                                                                                                                                                       |
| ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint       | ✓      | `npm run lint` (ESLint)                                                                                                                                                     |
| Test       | ✓      | `npm run test` (Vitest)                                                                                                                                                     |
| Build      | ✓      | `npm run build` (Astro build)                                                                                                                                               |
| Type check | ✓      | `npm run check` (`astro check`) runs in CI, `.github/workflows/ci.yml`                                                                                                      |
| Security   | ✓      | `npx audit-ci --config audit-ci.jsonc` (allowlists today's known findings) + `node scripts/check-no-raw-sql.mjs` in CI; `.github/dependabot.yaml` for background monitoring |

`actions/checkout` and `actions/setup-node` were bumped from `@v4` to `@v7` this cycle (changelogs reviewed — no breaking changes apply to this workflow's usage), and the runner/local Node version was bumped from 22.14.0 to 26.7.0 (`.nvmrc`, `ci.yml` `node-version`) to match the actual local dev environment. `cloudflare/wrangler-action@v4` was already current.

## Configuration

All expected configuration files present. No gaps detected.

## Stack Assessment Cross-Reference

No stack-assessment.md found. Run /10x-stack-assess for quality-gate analysis.

## Recommended Fixes

### Fix before agent work (Category A)

### 1. Moderate astro/@astrojs/cloudflare XSS advisories — upgrade currently blocked upstream

**Impact**: Both advisories are cross-site scripting vectors in Astro's server-side rendering path (spread attributes, view-transition properties) — directly relevant to an SSR app that renders user-controlled data.
**Severity**: medium
**Effort**: significant (> 1 hour) — and currently blocked regardless of time spent
**Fix**: The upgrade was attempted via `npx @astrojs/upgrade` (astro 7.2.2, `@astrojs/cloudflare` 14.2.1, `@astrojs/react` 6.0.2) and failed the build with two different internal Vite/Rollup errors depending on `prerenderEnvironment` configuration — a genuine upstream incompatibility, not a local config issue. Don't retry blindly; watch the `@astrojs/cloudflare` changelog and the `withastro/astro` issue tracker for a fix. If the SSR pages don't render untrusted user input through spread attributes or view-transition props, accepting this risk for now is reasonable.

### 2. `eslint-plugin-astro` is 2+ major versions behind — blocked by ESLint major version

**Impact**: The longer this sits, the more breaking changes accumulate between the installed 1.7.0 and current 3.1.0.
**Severity**: low
**Effort**: moderate (15–30 min) — but blocked on a prerequisite
**Fix**: Every `eslint-plugin-astro` version above 1.7.0 (2.0.0+) requires `eslint >=10.0.0`; this project is on ESLint 9.x. Bumping `eslint-plugin-astro` alone isn't possible — it requires an ESLint 9→10 major upgrade first, which also touches `eslint-plugin-react`, `eslint-plugin-jsx-a11y`, and `eslint-config-prettier` compatibility (unverified). Treat as a separate, dedicated upgrade task.

### Addressed in upcoming lessons (Category B)

### CI stage gaps (type-check, security)

**Lesson**: [Sprint Zero z Agentem: infrastruktura, walking skeleton i pierwszy deploy (M1L5)](https://platforma.przeprogramowani.pl/external/10xdevs-3/m1-l5)
**What you'll do there**: Extend the CI pipeline with a type-check step (`astro check` or `tsc --noEmit`) and a security-scan step, now that lint, test, and build are already wired up.

### Missing AGENTS.md

**Lesson**: [Agent Onboarding: Agents.md, AI Rules i feedback loops (M1L4)](https://platforma.przeprogramowani.pl/external/10xdevs-3/m1-l4)
**What you'll do there**: Build the AGENTS.md agent-instruction file with the right content and structure — generating a stub now would be premature. `CLAUDE.md` already exists and is well-developed for this repo.

## Summary

Health status: healthy

Local and CI health both remain solid: working Vitest suite, pinned lockfile, strict TypeScript (6.0.3), a CI pipeline that lints, tests, and builds on every push using current-generation GitHub Actions (`checkout@v7`, `setup-node@v7`), and a Node version (26.7.0) that matches the actual local dev environment instead of a stale pin. The two remaining Category A items are both confirmed blocked rather than merely deferred: the astro 7 / Cloudflare adapter bump hits a genuine upstream build bug, and `eslint-plugin-astro` can't move without an unplanned ESLint 9→10 migration. Neither blocks agent-assisted work.

Next step: your project is healthy — proceed to agent onboarding (M1L4). Revisit the astro/Cloudflare bump when upstream fixes the build issue, and treat the ESLint major upgrade as its own task if you want `eslint-plugin-astro` current.
