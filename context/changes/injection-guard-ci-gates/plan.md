# Injection Guard + CI Gates Implementation Plan

## Overview

Close test-plan.md §3 Phase 4 ("Injection guard + missing CI gates"). Risk #7 (SQL injection) is unrealized
today — no raw/string-built SQL exists anywhere in the codebase — so this phase adds forward-looking guards
rather than fixing a live vulnerability: a route-id format check (the one concrete gap research found), a static
CI check against future raw-SQL patterns, and the security/dependency-scan CI gate. The typecheck half of this
phase's original goal already landed via an unrelated same-day commit (`d0b8ac1`), so this plan only needs to
correct the rollout docs for that gate, not re-implement it.

## Current State Analysis

- No raw/string-built SQL or `.rpc()` calls exist anywhere in `src/` — confirmed by `research.md`'s full audit
  of every Supabase call site. Every call uses the query builder's parameterized methods.
- The typecheck CI gate is already wired (`npm run check` = `astro check`, `.github/workflows/ci.yml:29-30`,
  landed via commit `d0b8ac1`) — `test-plan.md` §5 and `health-check.md:85` still describe it as missing (stale).
- The security/dependency-scan CI gate is fully open — no `dependabot.yml`/`.yaml`, no CodeQL workflow, no
  `npm audit` step anywhere in `.github/workflows/`.
- The repo is a **private, personal-account-owned** repository (`gh repo view` confirms `visibility: PRIVATE`,
  owner type `User`) — this rules out GitHub Advanced Security/CodeQL as a free option; that tier is
  Enterprise-only for private repos.
- Five `[id]` routes never validate `context.params.id`'s format before `.eq("id", ...)`:
  `src/pages/api/tasks/[id].ts`, `src/pages/api/tasks/[id]/complete.ts`, `src/pages/api/tasks/[id]/delete.ts`,
  and `src/pages/api/v1/tasks/[id].ts` (GET/PATCH/DELETE). Not exploitable today — Supabase parameterizes the
  value regardless — but it's the one concrete gap against risk #7's "every dynamic route identifier is
  validated server-side" bar.
- `zod` is at v4 (`package.json`); `z.string().uuid()` is deprecated in favor of the top-level `z.uuid()`
  (verified via context7 against the current zod docs).
- This repo has **zero bash/bats-core infrastructure** — every existing automation path is Node/Vitest. A new
  bash script would be first-of-its-kind tooling with no precedent.
- `tsconfig.json` has `include: ["**/*"]` with no `allowJs`, and ESLint's type-aware linting
  (`parserOptions.projectService: true`) requires every linted file to be part of the TS program. A new plain
  `.mjs`/`.js` file under `scripts/` would not be included in the program and would fail type-aware linting with
  a "file was not found in project" parser error unless explicitly excluded.
- `npm audit --audit-level=high --json` on this branch currently reports **1 critical + 7 high + 3 moderate**
  findings (astro RCE/XSS advisories, fast-uri SSRF, js-yaml/postcss-selector-parser DoS, the
  sharp/miniflare/wrangler chain, svgo) — not the "2 moderate" count `health-check.md` records; new advisories
  were published against these already-installed versions after `health-check.md` was last generated. A prior
  upgrade attempt to resolve the astro chain broke the build and was reverted. A bare `npm audit --audit-level=high` CI step would therefore fail on the very first PR after this phase merges.

### Key Discoveries

- `src/lib/task-schema.ts` — the existing zod schema module; the new route-id schema belongs here alongside
  `addTaskSchema`/`createTaskJsonSchema`/`updateTaskJsonSchema`.
- `.github/workflows/ci.yml:17-39` — single `ci` job; new gates land as additional steps in this same job,
  matching the repo's established convention of small, scoped step additions (`d0b8ac1`).
- `supabase/migrations/20260827194321_create_maintenance_tasks.sql:22` — `id uuid primary key default gen_random_uuid()` confirms UUID is the correct format to validate against.
- `eslint.config.js` already has a per-glob override pattern (`generatedTypesConfig`, `astroConfig`) that the
  new `scripts/**` override follows directly.
- `src/pages/api/v1/account.integration.test.ts:56-59` — the one existing raw `pg.query()` call in the repo,
  already parameterized (`$1` placeholder) and test-only; the new raw-SQL check must not flag it.

## Desired End State

- Every `[id]` route rejects a malformed task id with the same generic not-found response it already returns
  for a well-formed-but-nonexistent id, before the request reaches Supabase.
- CI fails if a future change introduces a raw/string-built SQL pattern in `src/` or `supabase/migrations/`.
- CI fails on any dependency vulnerability newly introduced after this phase lands; today's already-known
  high/critical/moderate findings are allowlisted, not silently ignored, and do not block merges.
- Dependabot is enabled for background dependency monitoring.
- `test-plan.md` §3 Phase 4 reads `complete`; §5's typecheck and security rows reflect actual CI state;
  `health-check.md`'s stale rows are corrected; `lessons.md` documents both new conventions.

**Verification**: `npm run lint`, `npm run test`, `npm run check`, `node scripts/check-no-raw-sql.mjs`, and
`npx audit-ci --config audit-ci.jsonc` all pass locally; a CI run on the branch shows every step green including
the two new security steps.

## What We're NOT Doing

- Not adding CodeQL or Snyk — CodeQL is blocked by the private personal-repo tier limitation; Snyk requires a
  new third-party account/secret neither research nor the interview justified.
- Not building an allowlist/exceptions mechanism for the raw-SQL check — zero violations exist today; a future
  genuine need edits the script directly rather than maintaining a suppression list.
- Not banning `.rpc()` calls outright — none exist today, and an RPC call itself isn't unsafe (only dynamic SQL
  built inside the called Postgres function would be) — out of this narrow check's scope.
- Not introducing bash/bats-core tooling for the new check script — it stays Node/Vitest-native, matching every
  other automation path in this repo.
- Not resolving the existing high/critical/moderate `npm audit` findings (astro, fast-uri, js-yaml,
  postcss-selector-parser, the sharp/miniflare/wrangler chain, svgo) — a prior astro upgrade attempt broke the
  build; they're allowlisted in `audit-ci.jsonc` until the upstream fixes land cleanly.
- Not adding e2e or UI component test coverage — that's rollout Phases 2/3/5, not this phase.

## Implementation Approach

Land as four small, independently verifiable phases, mirroring this repo's existing "small scoped commit" CI
convention: (1) route-id validation, (2) raw-SQL static check + its CI/lint wiring, (3) dependency-scan CI gate,
(4) rollout-doc sync. Phases 1–3 are code changes; phase 4 is docs-only and closes out the rollout phase.

## Critical Implementation Details

### Type-aware ESLint will error on the new plain-JS script unless excluded

`tsconfig.json`'s `include: ["**/*"]` has no `allowJs`, so `scripts/check-no-raw-sql.mjs` is not part of the TS
program `projectService` builds — type-aware ESLint rules will fail to resolve it. Add an override to
`eslint.config.js` targeting `scripts/**/*.mjs` with `tseslint.configs.disableTypeChecked`, following the same
per-glob override pattern already used for `generatedTypesConfig`/`astroConfig`:

```js
const scriptsConfig = tseslint.config({
  files: ["scripts/**/*.mjs"],
  extends: [tseslint.configs.disableTypeChecked],
});
```

Include `scriptsConfig` in the exported `tseslint.config(...)` list, before `eslintPluginPrettier`.

## Phase 1: Route-ID validation

### Overview

Add a shared UUID schema and wire it into all 5 `[id]` route handlers so a malformed id is rejected before it
reaches Supabase, closing the one concrete gap research found against risk #7.

### Changes Required

#### 1. Shared task-id schema

**File**: `src/lib/task-schema.ts`

**Intent**: Add a single reusable schema for validating a task id's format, colocated with the other task-related
zod schemas.

**Contract**: Export `taskIdSchema = z.uuid()` (top-level `z.uuid()`, not the deprecated `z.string().uuid()` —
verified against zod v4 docs). No new type export needed; callers use `.safeParse(...).success`.

#### 2. Legacy form routes

**File**: `src/pages/api/tasks/[id].ts`

**Intent**: Reject a malformed id with the same generic not-found redirect already used for a nonexistent id,
before the update query runs.

**Contract**: Immediately after the existing `if (!context.params.id) return context.redirect(NOT_FOUND_REDIRECT);`
check, add `if (!taskIdSchema.safeParse(context.params.id).success) return context.redirect(NOT_FOUND_REDIRECT);`. Import `taskIdSchema` from `@/lib/task-schema`.

**File**: `src/pages/api/tasks/[id]/complete.ts`

**Intent/Contract**: Identical pattern to `[id].ts` — same guard, same `NOT_FOUND_REDIRECT` import already present.

**File**: `src/pages/api/tasks/[id]/delete.ts`

**Intent/Contract**: Identical pattern to `[id].ts`.

#### 3. Public JSON API route

**File**: `src/pages/api/v1/tasks/[id].ts`

**Intent**: Reject a malformed id with the same generic 404 JSON error each handler already returns for a
nonexistent id, before its query runs.

**Contract**: In `GET`, `PATCH`, and `DELETE`, immediately after the existing `if (!context.params.id) return jsonError(400, "Missing task id");` check, add `if (!taskIdSchema.safeParse(context.params.id).success) return jsonError(404, "Task not found");` — 404 (not 400) to match the "same response as nonexistent id" contract these
handlers already use for the DB-miss case. Import `taskIdSchema` from `@/lib/task-schema`.

#### 4. Route test coverage

**Files**: `src/pages/api/tasks/[id].test.ts`, `src/pages/api/tasks/[id]/complete.test.ts`,
`src/pages/api/tasks/[id]/delete.test.ts`, `src/pages/api/v1/tasks/[id].test.ts`

**Intent**: Prove the new guard actually rejects a malformed id, not just that existing tests keep passing.

**Contract**: In each file, add a case asserting a malformed (non-UUID) id produces the identical response as
the existing well-formed-but-nonexistent-id case in that same file (same status code / redirect target), and
that it does so without a Supabase call being made (e.g. assert the mocked client isn't invoked, or that the
response returns before any DB mock is triggered).

### Success Criteria

#### Automated Verification

- Unit tests pass, including new malformed-id cases in all 5 route test files: `npm run test`
- Type checking passes: `npm run check`
- Linting passes: `npm run lint`

#### Manual Verification

- Locally, `POST /api/tasks/not-a-uuid/complete` and `GET /api/v1/tasks/not-a-uuid` both return the same
  not-found response as a well-formed-but-nonexistent id, with no 500

______________________________________________________________________

## Phase 2: Injection-guard static check

### Overview

Add a Node script that fails CI if a future change introduces raw/string-built SQL, wire it into the `ci` job,
and exclude it from type-aware ESLint.

### Changes Required

#### 1. Raw-SQL check script

**File**: `scripts/check-no-raw-sql.mjs` (new)

**Intent**: Give CI a static, purpose-built check for the two vectors that would open a real SQL-injection
surface in this codebase, per test-plan.md risk #7's "cheapest layer: static check ... if such a spot is found."

**Contract**: A plain Node script (ESM, `package.json` already has `"type": "module"`) that:

1. Scans every `*.sql` file under `supabase/migrations/` and flags any line matching
   `/\bexecute\s+(?!function\b|procedure\b)/i` (dynamic SQL execution such as `EXECUTE format(...)`,
   `EXECUTE '...'`, `EXECUTE (...)`) — deliberately excluding `EXECUTE FUNCTION`/`EXECUTE PROCEDURE`, which is
   Postgres trigger-invocation syntax already present in this repo's own
   `create_maintenance_tasks.sql:46` (`execute function set_updated_at();`) and is not dynamic SQL. No dynamic
   SQL execution exists today.
1. Scans every `*.ts` file under `src/` — excluding `*.test.ts` and `*.integration.test.ts` — and flags any
   `.query(` call whose argument is a template literal containing `${` interpolation
   (`/\.query\(\s*`\[^`]*\$\{/`) or built via string concatenation (`/\.query\([^)]*\+[^)]*\)/`). This must not
   flag `src/pages/api/v1/account.integration.test.ts:56-59` (already parameterized, and excluded by the test-file
   filter anyway).
1. Prints each violation as `file:line` and exits `1` if any are found; exits `0` with a short success message
   otherwise.

#### 2. Script test

**File**: `scripts/check-no-raw-sql.test.mjs` (new)

**Intent**: Prove the script actually catches both vectors, not just that it runs.

**Contract**: Use temp fixture files (e.g. `fs.mkdtempSync`) — one migration-style fixture containing
`EXECUTE format(...)`, one `.ts` fixture with a template-literal `.query()` call — and assert the script's scan
function reports a violation for each. Also assert a fixture containing `EXECUTE FUNCTION set_updated_at();`
(trigger-invocation syntax) reports **no** violation, proving the exclusion works. Finally assert the script
reports no violations for the current real `supabase/migrations/` and `src/` trees (which already contain the
`EXECUTE FUNCTION` trigger call in `create_maintenance_tasks.sql:46`).

#### 3. ESLint override for the new script

**File**: `eslint.config.js`

**Intent/Contract**: As described in Critical Implementation Details above — add `scriptsConfig` targeting
`scripts/**/*.mjs` with `tseslint.configs.disableTypeChecked`, included in the exported config list.

#### 4. CI wiring

**File**: `.github/workflows/ci.yml`

**Intent**: Run the check on every push/PR to `main`, failing fast before the slower `Test`/`Build` steps.

**Contract**: Add a new step named `"Security: raw SQL check"` running `node scripts/check-no-raw-sql.mjs`,
placed after the existing `"Lint"` step and before `"Test"`.

### Success Criteria

#### Automated Verification

- Script passes against the current codebase: `node scripts/check-no-raw-sql.mjs`
- Script's own tests pass: `npm run test`
- Linting passes with no type-aware crash on `scripts/**`: `npm run lint`
- Type checking passes: `npm run check`

#### Manual Verification

- Temporarily add a throwaway `EXECUTE format(...)` line to a scratch `.sql` file and a template-literal
  `.query()` call to a scratch `.ts` file, confirm `node scripts/check-no-raw-sql.mjs` fails with a clear
  `file:line` message for both, then revert

______________________________________________________________________

## Phase 3: Dependency-scan CI gate

### Overview

Close the remaining half of the security/dependency-scan gate: a CI step that blocks on *newly introduced*
high/critical vulnerabilities, plus GitHub-native background monitoring. A bare `npm audit --audit-level=high`
cannot ship this as stated — `npm audit --audit-level=high --json` on this branch currently reports 1 critical +
7 high findings (astro RCE/XSS, fast-uri SSRF, js-yaml/postcss-selector-parser DoS, the sharp/miniflare/wrangler
chain, svgo), so a bare threshold gate would fail on the very first PR after merge. Use `audit-ci` instead, which
supports an allowlist of already-known advisory IDs while still failing on anything new — a plain npm
devDependency, no new account or secret.

### Changes Required

#### 1. Dependabot configuration

**File**: `.github/dependabot.yaml` (new)

**Intent**: Enable GitHub-native background dependency monitoring and auto-PRs for the npm ecosystem — no CI
runtime cost, no new secret (GitHub confirmed to support the `.yaml` extension for this file, keeping this repo's
"always `.yaml`, never `.yml`" convention intact).

**Contract**:

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: "/"
    schedule:
      interval: weekly
```

#### 2. Dependency-audit tooling

**File**: `package.json` (devDependencies)

**Intent**: Add the tool that makes "block new findings, don't block today's known ones" actually expressible —
a severity threshold alone can't distinguish the two.

**Contract**: Add `audit-ci` (IBM, npm-registry package, no account/secret) as a devDependency. `audit-ci` is not
covered by context7 — verify its current CLI flags/config schema against its own README at implementation time
rather than trusting this plan's description of it.

#### 3. Audit allowlist config

**File**: `audit-ci.jsonc` (new)

**Intent**: Encode today's already-known findings so the gate only fails on genuinely new high/critical
advisories.

**Contract**: Threshold `high` (catches high and critical); `allowlist` populated at implementation time from a
fresh `npm audit --audit-level=high --json` run (the exact advisory set may have shifted by then). As of this
plan's writing that list is: `GHSA-26w7-cxv4-gfx2`, `GHSA-376h-93r7-7g6f`, `GHSA-4g3v-8h47-v7g6`,
`GHSA-f48w-9m4c-m7f5` (astro), `GHSA-5jgf-p345-68v8`, `GHSA-f65p-4m7j-42xc`, `GHSA-fph4-wmhf-6fwf`,
`GHSA-jqff-g426-hqxp` (fast-uri), `GHSA-2883-xcg3-v3hh` (js-yaml), `GHSA-rgj7-g3m4-5g8c` (sharp),
`GHSA-4vpr-x523-8j87`, `GHSA-w27v-7q3p-w38r` (svgo).

```jsonc
{
  "$schema": "https://github.com/IBM/audit-ci/raw/main/docs/schema.json",
  "high": true,
  "allowlist": [
    // re-verify this list against a fresh `npm audit --audit-level=high --json` before landing
    "GHSA-26w7-cxv4-gfx2",
    "GHSA-376h-93r7-7g6f",
    "GHSA-4g3v-8h47-v7g6",
    "GHSA-f48w-9m4c-m7f5",
    "GHSA-5jgf-p345-68v8",
    "GHSA-f65p-4m7j-42xc",
    "GHSA-fph4-wmhf-6fwf",
    "GHSA-jqff-g426-hqxp",
    "GHSA-2883-xcg3-v3hh",
    "GHSA-rgj7-g3m4-5g8c",
    "GHSA-4vpr-x523-8j87",
    "GHSA-w27v-7q3p-w38r",
  ],
}
```

#### 4. CI dependency-audit step

**File**: `.github/workflows/ci.yml`

**Intent**: Block merges on any newly introduced high/critical-severity dependency vulnerability, without
failing on today's already-known, allowlisted findings.

**Contract**: Add a new step named `"Security: dependency audit"` running `npx audit-ci --config audit-ci.jsonc`,
placed immediately after the `"Security: raw SQL check"` step added in Phase 2 and before `"Test"`.

### Success Criteria

#### Automated Verification

- Gate passes locally with today's findings allowlisted: `npx audit-ci --config audit-ci.jsonc`
- Temporarily removing one id from the allowlist causes the gate to fail locally, confirming it actually blocks
  new/unlisted findings, then the removal is reverted
- CI run on the branch shows the new step green

#### Manual Verification

- After merge, confirm the repo's GitHub Insights → Dependency graph → Dependabot tab shows the config was
  picked up (requires a push to the remote default branch to observe)

______________________________________________________________________

## Phase 4: Rollout-doc sync

### Overview

Close out test-plan.md §3 Phase 4 and correct the stale gate descriptions this research surfaced, plus record
the two new conventions in `lessons.md`.

### Changes Required

#### 1. Test plan rollout status

**File**: `context/foundation/test-plan.md`

**Intent**: Reflect that this rollout phase is done, and that both quality gates are now real CI steps rather
than "required after Phase 4" placeholders.

**Contract**:

- §3 Phased Rollout table, Phase 4 row: `Status` → `complete`, `Change folder` → `injection-guard-ci-gates`.
- §5 Quality Gates table, `typecheck` row: `Required?` → `required (already wired)`; note text updated to state
  it runs in CI via `.github/workflows/ci.yml` (commit `d0b8ac1`), removing the now-false "only runs locally"
  claim.
- §5 Quality Gates table, `security/dependency scan` row: `Required?` → `required (already wired)`; note text
  updated to name the actual mechanism (`npx audit-ci --config audit-ci.jsonc` CI step + Dependabot).
- §6.6 "Per-phase rollout notes": add an entry for Phase 4 naming `scripts/check-no-raw-sql.mjs` (run locally via
  `node scripts/check-no-raw-sql.mjs`), `taskIdSchema` (`src/lib/task-schema.ts`), and the two new CI steps.

#### 2. Health-check gate table

**File**: `context/foundation/health-check.md`

**Intent**: Fix the two rows research flagged as stale.

**Contract**: In the CI gate table (around line 80-86): `Type check` row status → `✓`, note → references
`npm run check` now running in CI. `Security` row status → `✓`, note → names the new `audit-ci` step (with its
allowlist of today's already-known findings) and Dependabot config.

#### 3. Lessons

**File**: `context/foundation/lessons.md`

**Intent**: Record both new conventions so future routes/checks follow them without rediscovering the reasoning.

**Contract**: Append two entries following the file's existing format (Context/Problem/Rule/Applies to):

1. "Dynamic route identifiers must be format-validated before hitting Supabase" — rule: every `/api/*` route
   taking a dynamic id from `context.params` must validate its format (e.g. `taskIdSchema` /
   `z.uuid()`) before passing it to a query, returning the same not-found response as a genuine miss.
1. "New raw-SQL/dependency vectors are guarded by CI, not convention alone" — rule: any code path that
   introduces raw SQL, string-built queries, or a new `.rpc()` call must be checked against
   `scripts/check-no-raw-sql.mjs`'s patterns (extend the script if it introduces a new vector), and any new
   dependency is subject to the `audit-ci` CI gate — a newly introduced advisory must be fixed or explicitly
   added to `audit-ci.jsonc`'s allowlist, not silently ignored.

### Success Criteria

#### Automated Verification

- No stale claim remains: `grep -n "not configured" context/foundation/health-check.md` matches nothing for the
  typecheck/security rows
- No stale claim remains: `grep -n "only runs locally" context/foundation/test-plan.md` returns no match

#### Manual Verification

- Human review of the updated `test-plan.md`, `health-check.md`, and `lessons.md` prose for accuracy and tone
  consistency with the surrounding document

______________________________________________________________________

## Testing Strategy

### Unit Tests

- `taskIdSchema` rejects non-UUID strings, accepts valid UUIDs (can be covered inline in each route's test file
  rather than a standalone schema test, following this repo's existing per-route test convention).
- Each of the 5 `[id]` route handlers: a malformed id produces the identical not-found response as a
  well-formed-but-nonexistent id.
- `scripts/check-no-raw-sql.mjs`: flags each of the two vectors on fixture files; reports clean against the real
  `supabase/migrations/` and `src/` trees.

### Integration Tests

- None new — this phase's risk is guarded by static checks and CI gates, not runtime behavior; the existing
  real-RLS integration tier (§6.7) already covers cross-user isolation for these same routes.

### Manual Testing Steps

1. Hit each of the 5 routes locally with a malformed id and confirm the generic not-found response.
1. Introduce a throwaway raw-SQL violation, confirm the script catches it, then revert.
1. Push the branch and confirm the CI run shows all steps (including the two new security steps) green.

## Performance Considerations

The raw-SQL check and `audit-ci` both run in seconds against this codebase's current size — no caching or
parallelization needed at this scale.

## Migration Notes

Not applicable — no data migration; all changes are code, CI config, and docs.

## References

- Research: `context/changes/injection-guard-ci-gates/research.md`
- Rollout strategy: `context/foundation/test-plan.md` (§2 risk #7, §3 Phase 4, §5 gates table)
- Auth-check contract precedent (same "small scoped CI/convention addition" shape): `context/changes/testing-auth-isolation-contract/plan.md`
- Existing per-glob ESLint override precedent: `eslint.config.js` (`generatedTypesConfig`, `astroConfig`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append `— <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Route-ID validation

#### Automated

- [x] 1.1 Unit tests pass, including new malformed-id cases in all 5 route test files: `npm run test` — 41c7dfd
- [x] 1.2 Type checking passes: `npm run check` — 41c7dfd
- [x] 1.3 Linting passes: `npm run lint` — 41c7dfd

#### Manual

- [x] 1.4 Malformed id on `POST /api/tasks/[id]/complete` and `GET /api/v1/tasks/[id]` returns the same not-found response as a nonexistent id, with no 500 — 41c7dfd

### Phase 2: Injection-guard static check

#### Automated

- [x] 2.1 Script passes against the current codebase: `node scripts/check-no-raw-sql.mjs` — e206d28
- [x] 2.2 Script's own tests pass: `npm run test` — e206d28
- [x] 2.3 Linting passes with no type-aware crash on `scripts/**`: `npm run lint` — e206d28
- [x] 2.4 Type checking passes: `npm run check` — e206d28

#### Manual

- [x] 2.5 Throwaway raw-SQL fixtures are caught by the script with a clear file:line message, then reverted — e206d28

### Phase 3: Dependency-scan CI gate

#### Automated

- [x] 3.1 Gate passes locally with today's findings allowlisted: `npx audit-ci --config audit-ci.jsonc`
- [x] 3.2 Temporarily removing one allowlisted id causes the gate to fail locally, confirming it blocks new/unlisted findings, then reverted
- [ ] 3.3 CI run on the branch shows the new step green

#### Manual

- [ ] 3.4 GitHub Insights → Dependency graph → Dependabot tab shows the config was picked up after a push to the remote

### Phase 4: Rollout-doc sync

#### Automated

- [ ] 4.1 No stale claim remains: `grep -n "not configured" context/foundation/health-check.md` matches nothing for the typecheck/security rows
- [ ] 4.2 No stale claim remains: `grep -n "only runs locally" context/foundation/test-plan.md` returns no match

#### Manual

- [ ] 4.3 Human review of updated `test-plan.md`, `health-check.md`, and `lessons.md` prose
