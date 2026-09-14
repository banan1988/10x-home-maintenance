---
date: 2026-09-14T17:01:59+0000
researcher: banan1988
git_commit: b3ffa4e6f4c8f2e97ed7db032a13753f204360e7
branch: testing-injection-guard-ci-gates
repository: 10x-home-maintenance
topic: "Injection guard + missing CI gates (test-plan.md §3 Phase 4)"
tags: [research, codebase, ci, sql-injection, security-scan, supabase, github-actions]
status: complete
last_updated: 2026-09-14
last_updated_by: banan1988
---

# Research: Injection guard + missing CI gates

**Date**: 2026-09-14T17:01:59+0000
**Researcher**: banan1988
**Git Commit**: b3ffa4e6f4c8f2e97ed7db032a13753f204360e7
**Branch**: testing-injection-guard-ci-gates
**Repository**: 10x-home-maintenance

## Research Question

Ground test-plan.md §3 Phase 4 ("Injection guard + missing CI gates") before planning: confirm whether any
raw/string-built SQL exists today (risk #7), and determine the actual current state of the CI gates the phase
is meant to close (typecheck, security/dependency scan), per `context/foundation/test-plan.md`.

## Summary

**Risk #7 (SQL injection) is currently unrealized**: no raw or string-built SQL query exists anywhere in the
codebase. Every Supabase call goes through the query builder's parameterized methods (`.eq()`, `.insert()`,
`.update()`, `.delete()`); there are zero `.rpc()` calls; the migrations contain no dynamic SQL (`EXECUTE`,
`format(...)`, concatenation). The one real gap against the risk's own "what proves protection" bar is that
dynamic route identifiers (`context.params.id`) are never validated (no UUID/zod check) before being handed to
`.eq()` — not an injection vector today (Supabase parameterizes it), but a hole in "every dynamic route
identifier is validated server-side."

**The CI-gate picture has changed since the test plan was written.** Typecheck was wired into
`.github/workflows/ci.yml` **today**, in an unrelated same-day commit (`d0b8ac1`, "wire astro check into CI
(p2)", part of `fix-api-v1-tasks-type-errors`) — `health-check.md` and `test-plan.md` §5 both still describe it
as missing. **This half of Phase 4's stated goal is already done and should be treated as closed, not planned.**
The security/dependency-scan gate remains fully open: no `.github/workflows/` file besides `ci.yml`, no
`dependabot.yml`, no CodeQL workflow, no Snyk config, no `npm audit` step anywhere.

S-03 (the roadmap slice risk #7 explicitly worried about — "the next roadmap slice ships without the same level
of testing") has since shipped (`roadmap.md` now shows it `done`, not `proposed` as it was during Phase 1's
research) and its new routes (`src/pages/api/v1/tasks/{index,[id]}.ts`) were included in this audit — they are
clean, with the same unvalidated-route-id gap as the older `src/pages/api/tasks/` routes.

## Detailed Findings

### Injection surface (risk #7)

- Every Supabase call site in `src/` uses the query builder's object/parameter arguments — no string
  concatenation feeds a query anywhere. Table of call sites with file:line, table/operation, and input path is
  in the injection-audit sub-agent's report (reproduced under Code References below).
- **Zero `.rpc()` calls** exist in the app (`grep -rn "\.rpc("` across `src/` returns nothing) — there is no
  app→Postgres-function path to audit for argument misuse.
- Migrations (`supabase/migrations/20260827194321_create_maintenance_tasks.sql`,
  `20260828192519_harden_set_updated_at_search_path.sql`) contain no `EXECUTE`, no `format(...)`, no dynamic
  SQL. The only PL/pgSQL function, `set_updated_at()`, is a trivial trigger already hardened for
  `search_path` (see `context/foundation/lessons.md` — "New Postgres functions must pin search_path").
- **Gap**: none of the five `[id]`/`[id]/*` routes (`src/pages/api/tasks/[id].ts`,
  `src/pages/api/tasks/[id]/complete.ts`, `src/pages/api/tasks/[id]/delete.ts`,
  `src/pages/api/v1/tasks/[id].ts` GET/PATCH/DELETE) validate `context.params.id` as a UUID or with zod before
  passing it to `.eq("id", ...)`. They only null-check it. Not exploitable today (the Supabase client
  parameterizes the value), but it's the one place the risk's "every dynamic route identifier is validated
  server-side" bar isn't met.
- Request bodies ARE fully zod-validated everywhere a body exists: `addTaskSchema` (legacy form routes),
  `createTaskJsonSchema`/`updateTaskJsonSchema` (S-03's JSON API) in `src/lib/task-schema.ts` — field lengths,
  enum membership against DB enums, positive-integer frequency, future-date guard.
- No ESLint security plugin or `no-restricted-syntax` rule is configured today (`eslint.config.js` has TS,
  React, Astro, Prettier rules only — nothing security-oriented, nothing in `package.json` devDependencies
  either).
- One test-only raw client exists: `src/pages/api/v1/account.integration.test.ts:56-59` uses `pg.query()` with
  a `$1` placeholder (parameterized, not concatenated) — not a production code path.

### CI gates — current actual state

- `.github/workflows/ci.yml` job `ci` (push/PR to `main`), in order: checkout → setup-node (v26, npm cache) →
  `npm ci` → "Sync Astro types" (`npx astro sync`) → **"Type check" (`npm run check`) — already present** →
  "Lint" (`npm run lint`) → "Test" (`npm run test`) → "Build" (`npm run build`, needs `SUPABASE_URL`/
  `SUPABASE_KEY` secrets).
- `npm run check` = `astro check` (`package.json` line 10) — wired in by commit `d0b8ac1` (2026-09-14
  14:17:23, same day as this research, branch `fix-api-v1-tasks-type-errors`), confirmed present on `main`.
  **`health-check.md:85` and `test-plan.md` §5's typecheck row are now stale** — both still say "not
  configured" / "only runs locally."
- Job `deploy` (`needs: ci`) is `if: false` with an inline comment explaining Cloudflare Workers Builds owns
  production auto-deploy — matches `CLAUDE.md`'s description exactly, no discrepancy there.
- **Security/dependency scan: still fully missing**, confirmed by direct inspection — `.github/workflows/`
  contains only `ci.yml`; no `dependabot.yml`, no CodeQL workflow file, no `.snyk`, no `renovate.json`, no
  `npm audit` step, and no unused security-scanning package sitting in `devDependencies` waiting to be wired
  in. `health-check.md:86` ("Security ✗ — not configured") still holds.
- Two **moderate** `npm audit` findings are already on record in `health-check.md:44-50,102-107` (astro 6.4.8,
  `@astrojs/cloudflare` 13.5.0 XSS advisories — GHSA-f48w-9m4c-m7f5 / GHSA-4g3v-8h47-v7g6) — an upgrade was
  attempted and reverted due to upstream build breakage. Whichever tool Phase 4 wires in for dependency
  scanning will likely surface these immediately; the plan should decide whether that's a hard CI failure or a
  warning until the upstream fix lands.

### Tooling options for the security/dependency-scan gate (factual survey, no recommendation made)

| Option                                      | Catches                                                                                                                                  | New secret/account?                                                                                              | Runs as                                     | CI cost              |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------- |
| `npm audit` (context7-verified)             | Known CVEs in installed deps                                                                                                             | No — built into npm                                                                                              | CI step (`npm audit --audit-level=<level>`) | Fast (seconds)       |
| GitHub Dependabot alerts (`dependabot.yml`) | Same advisory data, plus optional auto-PRs                                                                                               | No — GitHub-native                                                                                               | Background feature, not a CI step           | None (no CI runtime) |
| GitHub CodeQL (`github/codeql-action`)      | Semantic code-pattern scanning (SQL injection, XSS, path traversal, etc.) — closest native fit to the injection-guard half of this phase | No for public repos / GitHub Advanced Security tier; **verify this repo's plan/visibility before assuming free** | CI step/job (`init` → build → `analyze`)    | Slower (2–10+ min)   |
| Snyk                                        | Deps + some code scanning                                                                                                                | **Yes** — third-party account + `SNYK_TOKEN`                                                                     | CI step or dashboard                        | Moderate             |

- `eslint-plugin-security` was investigated as a lint-time SQL-injection guard: **not resolvable via context7**
  (training knowledge only, flagged explicitly by the researching agent). It has no rule purpose-built for SQL
  string concatenation — closest rules (`detect-object-injection`, `detect-non-literal-fs-filename`) are
  filesystem/prototype-pollution oriented and `detect-object-injection` has a known high false-positive rate.
  Flat-config (typescript-eslint) compatibility is unconfirmed. If the plan considers it, verify the package
  directly rather than relying on this note.
- Open question the plan should resolve: is this repository private, and if so does it have GitHub Advanced
  Security (needed for CodeQL on private repos without incurring cost)? Not determined by this research.

### Historical context (from prior changes)

- Phase 1 (`context/changes/testing-auth-isolation-contract/`, status `impl_reviewed`, all 4 sub-phases
  complete) established `requireUser()` (`src/lib/auth.ts`) and `assertRequiresAuth()`
  (`src/test-utils/auth-contract.ts`) as the shared auth-check/test contract every `/api/*` route must use —
  already codified as a `lessons.md` entry ("Every `/api/*` route must use the shared auth-check contract").
- Phase 1's plan **explicitly deferred this phase's work**: *"Not wiring Docker/local-Supabase into CI in this
  phase — that is explicitly test-plan.md §3 Phase 4's job ('missing CI gates')."* Phase 1's own research (as
  of 2026-09-11) independently confirmed no raw SQL and no service-role key existed at that time — consistent
  with this fresh audit finding the same three days later, after S-03 shipped in between.
- No lesson currently covers SQL-injection static analysis or CI security scanning. Convention across prior
  phases (e.g. Phase 1) is to add a new `lessons.md` entry once a phase's convention lands — Phase 4 should
  follow this pattern once it establishes its own.
- PRD Access Control / NFR (source cited for risk #7): *"No user's maintenance data is ever exposed to another
  user, through any interface (UI or API)"* (`prd.md:140`); *"the server must not trust the client"* framing is
  implicit in the Access Control section (`prd.md:158-162`) rather than a literal quoted line.

## Code References

- `src/pages/api/tasks/[id].ts:41-45` — update via `.eq("id", ...)`, unvalidated `context.params.id`
- `src/pages/api/tasks/[id]/complete.ts:27-31` — same gap
- `src/pages/api/tasks/[id]/delete.ts:24` — same gap
- `src/pages/api/v1/tasks/[id].ts:22-26,62-67,87-92` — GET/PATCH/DELETE, same gap (S-03 routes)
- `src/pages/api/v1/tasks/index.ts:20,47-55` — list/insert, no dynamic id involved
- `src/lib/task-schema.ts` — `addTaskSchema`, `createTaskJsonSchema`, `updateTaskJsonSchema` (body validation, no route-id validation)
- `supabase/migrations/20260827194321_create_maintenance_tasks.sql` — no dynamic SQL
- `supabase/migrations/20260828192519_harden_set_updated_at_search_path.sql` — `search_path` hardening precedent
- `.github/workflows/ci.yml:17-39` — `ci` job (typecheck step already present), `:41-78` — parked `deploy` job (`if: false`)
- `package.json:10` — `"check": "astro check"`
- `context/foundation/health-check.md:80-86` — CI gate status table (typecheck row now stale)
- `context/foundation/test-plan.md:52,64,89,110,124,128` — risk #7, Phase 4 row, quality-gates rows

## Architecture Insights

- The codebase's injection defense today is entirely structural (Supabase's query-builder parameterization +
  RLS), not enforced by any static check — Phase 4 is genuinely the first place a guard (lint rule, CI check,
  or targeted test) would be added, matching test-plan.md's characterization of this as risk "Medium impact,
  Low likelihood" with cheapest layer "static check/lint, or a single targeted test if such a spot is found."
- CI gate additions in this repo land as small, scoped, same-day commits (see `d0b8ac1`) rather than sweeping
  changes — Phase 4's plan can likely follow the same shape: one step added to the existing `ci` job per gate,
  not a new workflow file, consistent with the single-`ci.yml` convention already established.

## Historical Context (from prior changes)

- `context/changes/testing-auth-isolation-contract/plan.md` — explicit handoff of CI wiring to this phase.
- `context/changes/testing-auth-isolation-contract/research.md` — prior (2026-09-11) confirmation of no raw SQL, no service-role key.
- `context/foundation/roadmap.md` — S-03 status flipped `proposed` → `done` between Phase 1's research and now.

## Related Research

- `context/changes/testing-auth-isolation-contract/research.md` — Phase 1 research for the same test-plan rollout.

## Open Questions

1. **Typecheck gate**: should the plan simply mark test-plan.md §5's typecheck row `complete` (via commit
   `d0b8ac1`, already on `main`) rather than re-doing this work, and scope Phase 4's plan to security-scan +
   injection guard only?
1. **CodeQL cost**: is this repository private, and does the account have GitHub Advanced Security? This
   determines whether CodeQL is free or requires a paid tier — unresolved by this research.
1. **Route-id validation gap**: is adding zod/UUID validation for `context.params.id` in scope for this phase
   (it's the one concrete gap found against risk #7's "protection" bar), or is it out of scope because it's not
   an actual injection vector today (Supabase already parameterizes it)?
1. **Existing npm audit findings**: should the new security-scan CI step hard-fail on the two already-known
   moderate advisories (astro/@astrojs/cloudflare), or should it warn-only until the upstream fix lands (the
   previous upgrade attempt broke the build)?
