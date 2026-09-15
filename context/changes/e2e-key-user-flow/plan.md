# E2e Key User Flow Implementation Plan

## Overview

Close `context/foundation/test-plan.md` §3 Phase 5, the last open risk (#5) in the test rollout: add a Playwright
e2e test that proves the full login → add task → dashboard → edit → complete → delete flow works through the
real UI, and wire it into CI as a required gate. This closes the explicit PRD guardrail "a working E2E test of
the key user flow exists."

## Current State Analysis

- No Playwright anywhere in the repo: no dependency, no config, no `tests/e2e/` directory, no `test:e2e` script.
- CI (`.github/workflows/ci.yml`) is a single flat job (lint → typecheck → security → unit test → build); it has
  never run a service container or the Supabase CLI.
- The feature under test already exists and is stable: auth (signin/signup), the `/dashboard` add-only view, and
  the `/tasks` manage view (edit/complete/delete) all shipped in earlier roadmap slices.
- A reusable seeded local test user (`isolation-test-user-a@example.com` / `isolation-test-password`) exists in
  `supabase/seed.sql`, already used by the real-RLS integration tier, and already owns one seeded task ("User A
  seeded task").
- The `/10x-e2e` skill (present in this worktree since commit `3ca2419`) is the required execution path for this
  phase's actual test-writing step — it drives its own PLAN→GENERATE→REVIEW→VERIFY loop and creates its own
  quality levers (`seed.spec.ts`, an E2E rules file) the first time it drives a phase in this plan.

## Desired End State

A single Playwright spec (`tests/e2e/key-user-flow.spec.ts`) passes locally and in CI, proving: a user can log in
through the real sign-in form, add a task, see it on `/dashboard` with the correct friendly status label,
navigate to `/tasks` and see the correct raw-enum status there, edit the task, mark it complete, and delete it —
plus one inline assertion that an invalid submission is blocked rather than silently accepted. A new required CI
job runs this test against an ephemeral local Supabase stack on every push/PR to `main`.

Verify by: `npx playwright test tests/e2e/key-user-flow.spec.ts` passes locally (with `npx supabase start && npx supabase db reset` and `npm run dev` already running), and the new `e2e` job is green on a real PR.

### Key Discoveries

- Login is a real full-page-reload form POST (`src/pages/api/auth/signin.ts`), not a JSON/fetch call — the
  correct Playwright pattern is `fill` → `click` → wait-for-navigation, never response interception
  (`src/components/auth/SignInForm.tsx:43-58`).
- Login success redirects to `/`, not `/dashboard` (`src/pages/index.astro`) — the test must navigate to
  `/dashboard` itself after login.
- Status text differs by page: `/dashboard` renders a friendly `STATUS_LABEL` ("Due soon"/"OK"/"Overdue"),
  `/tasks` renders the raw `TaskStatus` enum ("DUE_SOON"/"OK"/"OVERDUE") — `src/pages/dashboard.astro:31-35` vs.
  `src/components/tasks/TaskList.tsx:66`.
- `npm run dev` runs Astro's plain Vite dev server (`astro dev`), not the Cloudflare `workerd` runtime — no
  Workers-specific timing concerns apply to Playwright's `webServer`.
- Zero `data-testid` attributes exist anywhere in `src/` — this is a design fit, not a gap, since
  `getByRole`/`getByLabel`/`getByText` are the preferred locators anyway. Inconsistent element `id`s across
  dialogs (Add has full ids; Edit only has two) means some fields need role/text locators rather than `getByLabel`.
- `supabase/setup-cli` is the official GitHub Action for running the Supabase CLI's local stack in CI; on
  `ubuntu-latest` it needs no extra Docker setup and no access-token secrets (those are only for remote
  `supabase link`/`db push` operations, not local `start`).

## What We're NOT Doing

- Multi-browser coverage (Firefox/WebKit) — Chromium only for this MVP e2e layer.
- Registering a fresh user per test run — reusing the shared seeded `isolation-test-user-a` instead (see Phase 2).
- Auto-orchestrating local Supabase setup from `test:e2e` — the script assumes Supabase is already running
  locally; this is documented as a manual prerequisite, matching the existing `test:integration` convention.
- Cross-user isolation assertions in this e2e test — already covered by the unit/integration tier
  (`testing-auth-isolation-contract`); this phase only touches isolation via out attempt to use the shared seed
  user without colliding with it (unique task name).
- Visual/pixel regression testing of the dialogs or task list — that's test-plan.md §3 Phase 2 (still not
  started), a separate concern from this phase's functional flow coverage.
- Testing the `/account/delete` flow — out of scope for the core task-CRUD flow this PRD guardrail names.
- CI test sharding/parallelization — a single spec doesn't need it.

## Implementation Approach

Three phases, each owned by the skill best suited to it:

1. **Playwright infrastructure** (`/10x-implement`) — install and configure the tooling; no test logic yet.
1. **The actual key-flow test** (`/10x-e2e`) — the one genuinely browser-level risk in this plan; `/10x-e2e`
   creates its own seed test and E2E rules levers here as part of driving this phase, then plans, generates,
   reviews, and verifies the risk-tied spec itself.
1. **CI wiring** (`/10x-implement`) — a new required job running the now-existing, now-passing spec against an
   ephemeral Supabase stack on every push/PR.

This order means Phase 3's CI job has a real spec to validate against from the moment it's added, instead of
wiring a pipeline around an empty test directory.

## Critical Implementation Details

- **The generic E2E rules override for this specific test.** `/10x-e2e`'s own rules template
  (`.claude/skills/10x-e2e/references/e2e-quality-rules.md`) says "use storageState for authentication — never
  log in through UI in individual tests." That default does not apply to Phase 2's test: login through the real
  UI *is* the risk being tested (test-plan.md risk #5 explicitly names "login" as part of the flow). When
  `/10x-e2e` drives Phase 2, it must treat this as a deliberate, named exception to its own default rule, not an
  oversight to "fix."
- **Env var ordering for the CI job.** `supabase status -o env` must be captured to `$GITHUB_ENV` *before* the
  step that runs `npm run dev`/Playwright's `webServer` — the dev server subprocess only inherits environment
  variables present at the moment it's spawned, not ones set afterward in the same job.
- **The seeded task collision.** `isolation-test-user-a` already owns one task ("User A seeded task") that will
  be visible on both `/dashboard` and `/tasks` alongside whatever this test creates. Every assertion must key off
  the test's own uniquely-named task (timestamp suffix), never assume it's the only row or the first row.
- **Choosing a due date that actually exercises both status texts.** Picking input values that land on the exact
  status boundary (0 or 7 days) risks flaking near a value already pinned by `status-date-regression-grid`'s unit
  tests, and picking values that produce `OK` status makes the dashboard/`tasks` text assertions identical
  strings (defeating the point of checking both pages). Use input values comfortably inside the `DUE_SOON` band
  (e.g. `last_done_date` = today, `frequency_value` = 3, `frequency_unit` = day) so the two pages' texts are
  genuinely different strings ("Due soon" vs. "DUE_SOON") and the test isn't sitting on a boundary already
  covered elsewhere.

## Phase 1: Playwright Infrastructure

### Overview

Install and configure Playwright so a spec file can be written and run — no test logic in this phase.

### Changes Required

#### 1. Playwright dependency and config

**File**: `package.json`

**Intent**: Add Playwright as a dev dependency and a script to run e2e tests, following the existing
`test`/`test:integration` script-naming convention.

**Contract**: New devDependency `@playwright/test` (latest). New script `"test:e2e": "playwright test"`.

**File**: `playwright.config.ts` (new)

**Intent**: Configure Playwright to run against the local dev server, single-browser (Chromium) for this MVP
layer, with CI-aware retry/worker/reporter settings.

**Contract**: `testDir: "tests/e2e"`; `use.baseURL: "http://localhost:4321"`; `webServer: { command: "npm run dev", url: "http://localhost:4321", reuseExistingServer: !process.env.CI, timeout: 120_000 }`; `forbidOnly: !!process.env.CI`; `retries: process.env.CI ? 2 : 0`; `workers: process.env.CI ? 1 : undefined`; one project,
Chromium (`devices["Desktop Chrome"]`).

#### 2. Ignore Playwright artifacts

**File**: `.gitignore`

**Intent**: Keep Playwright's local run artifacts out of version control, following the existing
`.playwright-mcp/` entry already present for the unrelated Playwright MCP tool.

**Contract**: Add `test-results/` and `playwright-report/`.

#### 3. Document the new script and local prerequisite

**File**: `README.md`

**Intent**: Add `test:e2e` to the "Available Scripts" table, and note the local prerequisite (Supabase running,
dev server running) next to the existing `test:integration` documentation pattern.

**Contract**: One new row in the "Available Scripts" table; one short note near it stating the e2e test assumes
`npx supabase start && npx supabase db reset` has already been run, matching how `test:integration`'s
prerequisite is already documented.

### Success Criteria

#### Automated Verification

- Type check passes: `npm run check`
- Lint passes: `npm run lint`
- Playwright CLI is installed and runs: `npx playwright --version`

#### Manual Verification

- `npm run dev` still starts normally (no regression from the new config file)
- README's new script row and prerequisite note render correctly

______________________________________________________________________

## Phase 2: Key-User-Flow E2E Test

### Overview

The one genuinely browser-level risk in this plan (test-plan.md risk #5): prove the full login → add → view on
dashboard → view on tasks → edit → complete → delete journey works through the real UI, as a single
risk-tied, self-contained test. Driven by `/10x-e2e`, which creates its own `seed.spec.ts` and E2E rules levers
as part of this phase since it's the first (and only) phase this skill drives in this plan.

### Changes Required

#### 1. The key-user-flow spec

**File**: `tests/e2e/key-user-flow.spec.ts` (new)

**Intent**: One test, one file, covering the entire journey named in test-plan.md risk #5, plus one inline
negative assertion so the test isn't happy-path-only (per the anti-pattern test-plan.md explicitly calls out for
this risk).

**Contract**:

- **Auth**: sign in through the real UI (`/auth/signin`, fields `id="email"`/`id="password"`) as
  `isolation-test-user-a@example.com` / `isolation-test-password` — this test's login step is a deliberate
  exception to the general "use storageState" E2E rule (see Critical Implementation Details), since login is the
  risk under test, not incidental setup.
- **Test data**: a uniquely-named task (timestamp suffix, e.g. `E2E Task ${Date.now()}`), with `last_done_date` /
  `frequency_value` / `frequency_unit` chosen to land inside the `DUE_SOON` band (see Critical Implementation
  Details) so the dashboard and `/tasks` status texts are genuinely distinct strings.
- **Negative assertion**: before submitting the valid task, attempt to submit `AddTaskDialog` with an empty
  `name` field and assert the dialog stays open / no navigation occurs — client-side validation blocking it.
- **Flow assertions, in order**: add task → redirected to `/dashboard?success=task-added` → task visible with
  friendly status text "Due soon" → navigate to `/tasks` → same task visible with raw status text "DUE_SOON" →
  edit the task (`EditTaskDialog`, fields `edit-name`/`edit-frequency-value`) → redirected to
  `/tasks?success=task-updated` → mark complete (`Mark done` inline form) → redirected to
  `/tasks?success=task-completed` → delete (`DeleteTaskAlertDialog`, confirm "Delete") → redirected to
  `/tasks?success=task-deleted` → task no longer present in the list (cleanup doubles as the last assertion).
- Locators: `getByRole`/`getByLabel`/`getByText` only, matching this repo's element ids/ARIA roles/button text
  documented in the research doc — never CSS selectors.
- Waits: `toBeVisible()` / `waitForURL()` — never `page.waitForTimeout()`.

### Success Criteria

#### Automated Verification

- The new spec passes standalone: `npx playwright test tests/e2e/key-user-flow.spec.ts`
- Deliberate-break check (per `/10x-e2e`'s VERIFY step): temporarily invert the status-boundary or the delete
  redirect the test asserts on, re-run, confirm the test goes red, then revert the break before committing

#### Manual Verification

- Human visually confirms the flow against the running app once (dashboard/tasks pages show expected content at
  each step)

______________________________________________________________________

## Phase 3: CI Wiring

### Overview

Add a new required CI job that runs the Phase 2 spec against an ephemeral local Supabase stack on every
push/PR to `main`, closing test-plan.md §5's "e2e on critical paths... required after Phase 5" gate.

### Changes Required

#### 1. New `e2e` job

**File**: `.github/workflows/ci.yml`

**Intent**: A new, independent job (not appended to the existing `ci` job, which builds against real hosted
Supabase secrets) that spins up a local Supabase stack via the official CLI action, starts the dev server, and
runs the Phase 2 spec — required for merge like the existing `ci` job.

**Contract**: New job `e2e`, `runs-on: ubuntu-latest`, `timeout-minutes: 15` (matching the existing `ci` job's
convention — guards against a hung `supabase start` health check per the Open Risks note below), same `on:`
triggers as the existing `ci` job, no `needs:` dependency on `ci` (runs in parallel). Steps: checkout → setup-node (Node 26, `cache: npm`) → `npm ci` →
`supabase/setup-cli@v3` → `supabase start --exclude studio,imgproxy,logflare,vector,edge-runtime,realtime,storage-api,mailpit,postgres-meta,supavisor`
(keep `gotrue`/`postgrest`/`kong`/`db`; the excluded services aren't needed for this test and materially cut boot time)
→ `supabase db reset` → capture connection info to `$GITHUB_ENV` via `supabase status -o env --override-name api.url=SUPABASE_URL --override-name auth.anon_key=SUPABASE_KEY` (must run before the next step, per Critical
Implementation Details) → `npx playwright install --with-deps chromium` → `npm run test:e2e` → upload
`playwright-report/` as a build artifact on failure (`actions/upload-artifact`, `if: failure()`).

#### 2. Document the CI gate

**File**: `README.md`

**Intent**: Note the new required `e2e` check in the existing "## CI" section, alongside the already-documented
lint/typecheck/test/build/security gates.

**Contract**: One additional bullet describing the `e2e` job and what it runs.

### Success Criteria

#### Automated Verification

- Workflow YAML is valid: GitHub accepts the push and the `e2e` job appears and runs (no syntax rejection)
- The `e2e` job passes on a real push/PR

#### Manual Verification

- Confirm the `e2e` check is added to the repository's branch protection required-status-checks list in GitHub
  settings (this is a GitHub repo setting, not a file change, so it can't be verified by a local command)
- Deliberately push a commit that breaks the e2e flow (or reuse Phase 2's deliberate-break) and confirm the PR is
  blocked from merging by the new required check, then revert

______________________________________________________________________

## Testing Strategy

### Unit Tests

- None added by this plan — the risk this plan closes is inherently a cross-boundary, browser-level one; the
  functions it exercises (`computeStatus`, `computeDueDate`, `requireUser`, etc.) already have unit coverage from
  earlier phases.

### Integration Tests

- None added — the real-RLS integration tier (`isolation.integration.test.ts`) already covers ownership
  enforcement; this plan proves the browser-level wiring on top of it, not a duplicate of it.

### Manual Testing Steps

1. Run `npx supabase start && npx supabase db reset`, then `npm run dev`, then
   `npx playwright test tests/e2e/key-user-flow.spec.ts` and watch it pass.
1. Visually walk the same flow by hand once in a real browser to sanity-check the assertions match what a human
   sees.
1. Push a branch and confirm the new `e2e` CI job runs and passes.

## Performance Considerations

`supabase start` in CI typically takes 2-5 minutes cold (image pulls dominate); excluding unneeded services
(studio, imgproxy, logflare, vector, edge-runtime) cuts this further. Combined with `npm ci`, Playwright browser
install, and a single short spec, the `e2e` job should comfortably finish within a 15-minute timeout.

## Migration Notes

Not applicable — no data model or existing-data changes.

## References

- Related research: `context/changes/e2e-key-user-flow/research.md`
- Test rollout context: `context/foundation/test-plan.md` §3 Phase 5, §6.3 (cookbook placeholder this phase
  fills in), §6.7 (real-RLS integration pattern this e2e tier mirrors through the UI)
- `/10x-e2e` skill: `.claude/skills/10x-e2e/SKILL.md` (Phase 2's execution path)
- Similar auth/isolation convention: `src/pages/api/tasks/isolation.integration.test.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append `— <commit sha>` when a step lands. Do not rename step
> titles. See `references/progress-format.md`.

### Phase 1: Playwright Infrastructure

#### Automated

- [x] 1.1 Type check passes: `npm run check` — 35b7234
- [x] 1.2 Lint passes: `npm run lint` — 35b7234
- [x] 1.3 Playwright CLI installed and runs: `npx playwright --version` — 35b7234

#### Manual

- [x] 1.4 `npm run dev` still starts normally — 35b7234
- [x] 1.5 README's new script row and prerequisite note render correctly — 35b7234

### Phase 2: Key-User-Flow E2E Test

#### Automated

- [x] 2.1 New spec passes standalone: `npx playwright test tests/e2e/key-user-flow.spec.ts`
- [x] 2.2 Deliberate-break check confirms the test is risk-tied, then reverted

#### Manual

- [x] 2.3 Human visually confirms the flow against the running app

### Phase 3: CI Wiring

#### Automated

- [ ] 3.1 Workflow YAML valid; `e2e` job appears and runs
- [ ] 3.2 The `e2e` job passes on a real push/PR

#### Manual

- [ ] 3.3 `e2e` check added to branch protection required-status-checks
- [ ] 3.4 Deliberate-break push confirms the required check blocks merge, then reverted
