---
date: 2026-09-14T23:43:29+02:00
researcher: Łukasz Kucharski
git_commit: b4cda34
branch: test/e2e-key-user-flow
repository: 10x-home-maintenance
topic: "E2e key user flow (test-plan.md §3 Phase 5 — key-path e2e)"
tags: [research, codebase, e2e, playwright, auth, tasks, dashboard]
status: complete
last_updated: 2026-09-14
last_updated_by: Łukasz Kucharski
---

# Research: E2e key user flow

**Date**: 2026-09-14T23:43:29+02:00
**Researcher**: Łukasz Kucharski
**Git Commit**: b4cda34
**Branch**: test/e2e-key-user-flow
**Repository**: 10x-home-maintenance

## Research Question

How should a Playwright e2e test of the key user flow — login → add a maintenance task → see it on the dashboard
with the correct status → edit it → mark it complete → delete it — be implemented in this repo, through the real
UI? This is `context/foundation/test-plan.md` §3 Phase 5 ("Key-path e2e"), closing Risk #5 (the explicit PRD
guardrail "a working E2E test of the key user flow exists").

## Summary

The app has everything needed to write this test, but nothing exists yet to write it *with*:

- **No Playwright anywhere in the repo** — no `@playwright/test` dependency, no `playwright.config.*`, no `e2e/`
  directory, no `storageState` fixture. Phase 5 starts from zero tooling.
- **Login is a real, full-page-reload form POST**, not a JSON/fetch call — `page.goto` → `fill` → `click` →
  wait-for-navigation is the correct Playwright pattern, not response interception.
- **The flow spans two pages, not one.** `/dashboard` is add-only/read-only (task list + `AddTaskDialog` only);
  edit, delete, and mark-complete controls only exist on `/tasks` (`TaskList` component). A literal reading of
  the flow ("see on the dashboard... then edit/complete/delete") requires navigating dashboard → tasks mid-test.
- **A reusable seeded test user already exists** (`isolation-test-user-a@example.com` /
  `isolation-test-password`, local Supabase only) but it currently owns one seeded task — an e2e run reusing it
  needs to account for that (either use it as-is and assert against its existing row, filter by task name, or
  seed/clean up its own task instead of relying on this shared fixture untouched).
- **No `data-testid` attributes exist anywhere in `src/`.** Selector strategy must rely on element `id`s (present
  but inconsistent across dialogs), button/label text, or ARIA roles — all English copy.
- **The dev server Playwright would drive is a plain Vite/Node server** (`astro dev`), not Cloudflare's `workerd`
  runtime — no Workers-specific quirks apply to local e2e runs, only to `build`/`preview`/`deploy`.
- **A prior attempt exists only in history, not in a live branch**: `f49de3c` ("reorder rollout, move e2e to
  phase 5") references an unmerged branch `chore/testing-e2e-critical-path` holding an old
  `change.md`/`research.md`. That branch **no longer exists** (checked local + remote) — nothing to accidentally
  resume; test-plan.md already says this work is to be redone from scratch, not resumed.
- **CI has no e2e job today** — `.github/workflows/ci.yml` runs lint/typecheck/security/unit-test/build only.
  test-plan.md §5 marks "e2e on critical paths... required after §3 Phase 5", i.e. wiring CI is part of this
  phase's completion bar, not a follow-up.
- **Mid-research, the project's own `CLAUDE.md` was updated (on disk, uncommitted, in a separate concurrently-active
  worktree) to add a "Module 3, Lesson 4 (E2E Tests)" section** naming a new `/10x-e2e` skill as "the single
  source of truth for the [e2e] workflow" (risk → seed test + rules → generate → review against five
  anti-patterns → re-prompt → verify), with hard rules: locators must be `getByRole`/`getByLabel`/`getByText`
  first (`getByTestId` only if accessibility attributes are ambiguous — reinforces the "no `data-testid`" finding
  above, since role/label/text selectors are actually preferred here, not just a fallback), never
  `page.waitForTimeout()` (wait on `toBeVisible()`/`waitForURL()`/`waitForResponse()` instead), and each test must
  be independent (own setup/action/assertion/cleanup, unique ids via timestamp suffix for parallel-safe reruns).
  This skill drives an *approved plan's* e2e phases (sibling of `/10x-implement`/`/10x-tdd`), so it does not
  replace `/10x-plan` — it replaces `/10x-implement`/`/10x-tdd` as the execution step once a plan exists. **This
  skill is not yet available in this git branch/worktree** (see Open Questions).

## Detailed Findings

### Auth / session mechanics (how a UI-driven login actually works)

- `src/lib/supabase.ts:6-22` — `createClient(headers, cookies)` builds a `@supabase/ssr` server client. Reads the
  session via `requestHeaders.get("Cookie")` + `@supabase/ssr`'s `parseCookieHeader` (not `context.cookies.get()`
  on the read side); writes via `cookies.set(name, value, { ...options, httpOnly: true, secure: true })` on the
  write side — the repo forces `httpOnly`/`secure` regardless of what `@supabase/ssr` requests. No custom cookie
  name is passed, so the library's default `sb-<project-ref>-auth-token` (chunked `.0`/`.1`/… if oversized) key
  applies.
- `src/pages/api/auth/signin.ts:5,9,13,16,19` — reads `email`/`password` via `context.request.formData()` (not
  `request.json()`), calls `supabase.auth.signInWithPassword`, and returns `context.redirect("/")` on success or
  `context.redirect("/auth/signin?error=...")` on failure — a real HTTP redirect, full page reload.
- `src/components/auth/SignInForm.tsx:~43-58` — `<form method="POST" action="/api/auth/signin" ...>` with fields
  `id="email"` and `id="password"`; `handleSubmit` only calls `e.preventDefault()` on client-side validation
  failure, otherwise lets the native form submission proceed. **No fetch/XHR interception** — confirms
  `page.goto`/`fill`/`click` + navigation wait is correct, not `page.waitForResponse` on a JSON call.
- `src/middleware.ts:4,7-16,18-22` — `PROTECTED_ROUTES = ["/dashboard", "/tasks", "/account/delete"]`; on every
  request calls `supabase.auth.getUser()` from the incoming cookie to set `context.locals.user`, redirecting to
  `/auth/signin` if unset on a protected route. Because `getUser()` re-derives from the cookie on every request
  (no server-side session store), the cookie set at signin genuinely carries the session across subsequent page
  loads — this is what makes a plain UI-driven Playwright login work with no extra plumbing.
- Login success redirects to `/` (`src/pages/index.astro`, the public landing page), **not** `/dashboard` — a
  test must navigate to `/dashboard` itself after login.
- **No existing shortcut** for an authenticated Playwright context: no `playwright.config.*`, no `e2e/` dir, no
  `storageState` references anywhere in the repo. `src/test-utils/auth-contract.ts` /
  `api-auth-contract.ts` are Vitest-only helpers asserting *unauthenticated* behavior (302/401), not usable to
  establish a session.

### Seeded test user / local Supabase fixture

- `supabase/seed.sql` (full) seeds two fixed users into `auth.users` + `auth.identities` (identities row is
  required — a users-only seed makes `signInWithPassword` fail silently, per the file's own comment) —
  `isolation-test-user-a@example.com` / `isolation-test-user-b@example.com`, both password
  `isolation-test-password` — plus one `maintenance_tasks` row each (`33333333-...` for user A: "User A seeded
  task", hvac, medium, 3 months, `2026-01-01`).
- `src/pages/api/v1/tasks/isolation.integration.test.ts:12-27` confirms the pattern for reusing this fixture:
  plain `@supabase/supabase-js` `createClient(SUPABASE_URL, SUPABASE_ANON_KEY)` against
  `http://127.0.0.1:54321` with Supabase CLI's well-known local demo anon key (hardcoded, explicitly commented as
  safe only because it's local-only), and a guard that **throws if `SUPABASE_URL` doesn't match
  `127.0.0.1`/`localhost`** — refusing to run against a real project.
- Reusing `isolation-test-user-a@example.com` for the e2e login test is realistic and consistent with existing
  convention, but its seeded task ("User A seeded task") will already be visible on `/dashboard`/`/tasks`
  alongside whatever the test creates — plan for this (unique task name assertion, or a fresh user/task per
  test run per the Lesson 4 "unique ids via timestamp suffix" rule referenced above).
- Local setup requirement carried over from the integration tier: `npx supabase start` (Docker) then
  `npx supabase db reset` to load `seed.sql` — an e2e run needs the same local Supabase state.

### Dev server target for Playwright

- `npm run dev` → `astro dev` — Astro's own Vite-based dev server (`astro.config.mjs:7,11,16,19-20`); the
  `@astrojs/cloudflare` adapter only shapes `build`/`preview`/`deploy` output, not `dev`. So Playwright's
  `webServer: { command: "npm run dev", url: "http://localhost:4321" }` behaves like an ordinary Node HTTP
  server with standard readiness polling — no `workerd`-specific timing/behavior concerns at `dev` time.
  `wrangler.jsonc` is irrelevant to `dev`.
- `SUPABASE_URL`/`SUPABASE_KEY` are optional `astro:env/server` secrets; `createClient` returns `null` if unset
  rather than crashing boot — but the e2e test obviously needs them pointed at local Supabase for login to
  actually work.

### UI surfaces the flow touches

- **Signin** (`src/pages/auth/signin.astro` + `SignInForm.tsx`): fields `id="email"`, `id="password"`; errors
  surfaced via `ErrorBanner` reading a `?error=` query param.
- **Signup** (`src/pages/auth/signup.astro` + `SignUpForm.tsx:66,106`): action `/api/auth/signup`, fields
  `id="email"`, `id="password"`, `id="confirmPassword"`; not needed for this flow since a seeded user already
  exists, but relevant if the plan later decides to register a fresh user per run instead of reusing the seed.
- **Dashboard** (`src/pages/dashboard.astro`): protected; fetches tasks **server-side**
  (`supabase.from("maintenance_tasks").select("*")`, lines 14-16) and computes status via
  `computeStatus`/`computeDueDate` (`@/lib/status`), sorted via `compareByUrgency`. Renders a **read-only**
  `<ul>` of cards (lines 56-70) — task name in `span.font-semibold`, a status label span using **friendly**
  text (`STATUS_LABEL` map lines 31-35: "Overdue" / "Due soon" / "OK" — note the space and different casing vs.
  `/tasks`'s raw enum text). Only interactive control on this page: the `AddTaskDialog` trigger ("Add task"
  button, line 45). Empty state exact text: `No maintenance tasks yet.` (line 53). A `<script>` (lines 77-85)
  reads `?success=task-added` to fire a toast then strips the query param.
- **Add task** (`AddTaskDialog.tsx:82-85,92,215-219`): trigger button text "Add task"; form
  `method="POST" action="/api/tasks"` (full nav) → redirects `/dashboard?success=task-added` or
  `/dashboard?error=...`. Field ids: `name`, `category` (Select), `importance` (Select),
  `frequency_value` (number), `frequency_unit` (Select); `last_done_date` is a hidden input populated from a
  calendar Popover (no stable id on the trigger button itself — text reads "Pick a date" or a formatted date).
- **Tasks page** (`src/pages/tasks/index.astro` + `TaskList.tsx`): the actual **interactive** list — a `<Table>`
  with a Status column showing **raw enum text** (`OVERDUE`/`DUE_SOON`/`OK`, line 66) — different from the
  dashboard's friendly labels, a detail a status assertion must account for depending on which page it checks.
  Row actions: `Edit` (opens `EditTaskDialog`), `Delete` (opens `DeleteTaskAlertDialog`), and an inline
  `Mark done` form (`method="POST" action="/api/tasks/{id}/complete"`, full nav) → redirects
  `/tasks?success=task-completed`.
- **Edit** (`EditTaskDialog.tsx:74`): form `method="POST" action="/api/tasks/{id}"`, full nav → redirects
  `/tasks?success=task-updated` or `/tasks?error=...&editing={id}`. Field ids: `edit-name`,
  `edit-frequency-value`; other fields (Selects, hidden date) have no stable id, only unlabeled wrapping
  `<label>` elements.
- **Delete** (`DeleteTaskAlertDialog.tsx`): confirmation text `Delete task` / `Are you sure you want to permanently delete "{task.name}"?`; submit is a destructive-variant `Button` labeled `Delete` inside
  `method="POST" action="/api/tasks/{id}/delete"` (full nav) → redirects `/tasks?success=task-deleted`.
- **`/account/delete`** exists (protected route, `DeleteAccountForm.tsx`) but is out of scope for the core
  task-CRUD flow requested; not explored in depth.
- **Selector gap**: zero `data-testid` attributes anywhere in `src/` (`grep -rn "data-testid" src/` → no
  matches). Combined with the CLAUDE.md Lesson-4 rule preferring `getByRole`/`getByLabel`/`getByText` over
  `getByTestId` anyway, this is likely fine as a *design fit* rather than purely a gap — but inconsistent element
  `id`s across dialogs (Add has full ids; Edit only has two; several fields have no id/label association at all)
  will make `getByLabel` unreliable for some fields, worth flagging for the planning stage.

### Existing test conventions to reuse (not e2e-specific, but establish patterns worth mirroring)

- `src/test-utils/` — `auth-contract.ts` (`assertRequiresAuth`) and `api-auth-contract.ts`
  (`assertRequiresApiAuth`), both Vitest-only helpers for the unit/API tier — not directly reusable for
  Playwright, but the existing convention of a shared, imported assertion helper (rather than duplicating
  boilerplate per test file) is worth carrying into any e2e helper module (e.g., a `login(page)` helper).
- `test-plan.md` §6.7's real-RLS integration pattern (`isolation.integration.test.ts`) already establishes the
  "sign in as a seeded local user via `signInWithPassword`, guard against non-local `SUPABASE_URL`" pattern this
  e2e tier's login step should mirror conceptually (through the UI instead of the SDK directly).

## Code References

- `src/lib/supabase.ts:6-22` - cookie-based Supabase SSR client construction
- `src/pages/api/auth/signin.ts:5,9,13,16,19` - signin route: form POST, redirect on success/failure
- `src/components/auth/SignInForm.tsx:43-58` - signin form markup/fields, native submit (no fetch)
- `src/middleware.ts:4,7-16,18-22` - protected routes list, per-request user resolution from cookie
- `src/pages/index.astro` - post-login redirect target (not `/dashboard`)
- `src/pages/dashboard.astro:14-16,31-35,45,53,56-70,77-85` - server-side task fetch, status labels, Add-only UI
- `src/components/tasks/AddTaskDialog.tsx:82-85,92,215-219` - add-task trigger/form/fields
- `src/pages/tasks/index.astro`, `src/components/tasks/TaskList.tsx:66,78,88,90-94` - interactive list, status column, Edit/Delete/Mark-done actions
- `src/components/tasks/EditTaskDialog.tsx:74` - edit form action/fields
- `src/components/tasks/DeleteTaskAlertDialog.tsx` - delete confirmation copy/action
- `src/pages/account/delete.astro`, `src/components/account/DeleteAccountForm.tsx` - out-of-scope account-deletion flow
- `src/test-utils/auth-contract.ts`, `src/test-utils/api-auth-contract.ts` - Vitest-only auth assertion helpers
- `supabase/seed.sql` - two seeded local users + one task each
- `src/pages/api/v1/tasks/isolation.integration.test.ts:12-27` - local-only Supabase client + guard pattern to mirror
- `astro.config.mjs:7,11,16,19-20` - `output: "server"`, Cloudflare adapter (build/preview/deploy only), env schema
- `package.json` (scripts) - no `test:e2e` script yet; `dev` → `astro dev`
- `.github/workflows/ci.yml` - current CI stages (lint, typecheck, security, unit test, build) — no e2e job

## Architecture Insights

- Every mutation in this app (signin, signup, add/edit/delete/complete task) is a **classic server-rendered form
  POST with a redirect**, never a client-side fetch to a JSON endpoint for the *page* flows (the `/api/v1/*` JSON
  API is a separate, parallel surface used by the isolation integration tests, not by the UI). This is a strong,
  consistent convention — Playwright interactions should universally follow "fill form → click submit → wait for
  URL/toast", never response-interception patterns.
- Status text is **not consistent between the two pages that show it** — dashboard uses a friendlier `STATUS_LABEL`
  mapping, `/tasks`'s table shows the raw `TaskStatus` enum value. Any assertion on "correct status" must target
  the specific page's actual rendered text, not assume a single canonical string.
- The task list surface is split across two routes by design (`/dashboard` = add + at-a-glance, `/tasks` = manage),
  mirroring the PRD's dashboard-vs-management distinction — this is not an oversight, so the e2e flow should
  genuinely traverse both pages rather than trying to force everything through one.

## Historical Context (from prior changes)

- `context/foundation/test-plan.md` §3 Phase 5 (this phase) — reorder note (2026-09-11): originally Phase 1,
  moved to Phase 5 as a capstone once auth/isolation (Phase 1, `testing-auth-isolation-contract`), status/date
  regression (Phase 3, `status-date-regression-grid`), and injection guard (Phase 4,
  `injection-guard-ci-gates`) landed. Phase 2 (shared-component UI regression) is still `not started` — Risk #4
  ("shared UI component drifts... or client-side validation stops blocking invalid input") is explicitly called
  out as only *partially* covered by this e2e phase ("#5 (touches #1, #4)"), not fully closed by it.
- The **prior unmerged branch `chore/testing-e2e-critical-path`** (referenced in test-plan.md's reorder note)
  does **not exist** in this repo today (confirmed: absent from `git branch -a` local + remote). Nothing to
  resume; the plan already states this work will be redone from scratch.
- `context/changes/testing-auth-isolation-contract/` established the `requireUser`/`assertRequiresAuth` auth
  convention and the real-RLS integration-test pattern this e2e work should be aware of (not duplicate, but the
  e2e test proves the *browser-level* wiring these lower tiers can't).
- `context/foundation/lessons.md` — no lesson yet specific to Playwright/e2e (expected, since Phase 5 hasn't
  started); the general lessons about numeric/string field bounds, RLS-only ownership comments, and the
  auth-check-contract rule are all already reflected in the routes this e2e test will exercise, not new risks
  for this phase.

## Related Research

- None yet under `context/changes/e2e-key-user-flow/` prior to this document — this is the first artifact for
  this change.
- `context/changes/testing-auth-isolation-contract/research.md` (if present) — background on the auth-check
  convention and RLS reliance this e2e flow depends on.

## Open Questions

1. **`/10x-e2e` skill availability.** The project's `CLAUDE.md` was updated *during this research session* (on
   disk, in a separate concurrently-active worktree at the repo's main working directory, not yet committed to
   any branch reachable from `test/e2e-key-user-flow`) to designate a new `/10x-e2e` skill as the required
   execution step for this phase (risk → seed test + rules → generate → review against five anti-patterns →
   re-prompt → verify), superseding a generic `/10x-implement`/`/10x-tdd` pass for e2e phases specifically. That
   skill is **not present in this worktree's `.claude/skills/`** — only in whatever state the main working
   directory (currently on branch `docs/update-readme-project-description`) has on disk, uncommitted. Before
   `/10x-plan` hands off to execution, confirm: (a) whether that update has since been committed anywhere, and
   (b) how to bring the `/10x-e2e` skill (and the updated `CLAUDE.md` Lesson 4 section) into this branch/worktree
   — likely by rebasing/merging once the other work is committed, rather than copying files ad hoc.
1. **Test-user strategy**: reuse the shared seeded `isolation-test-user-a` (simpler, but shares state with the
   integration test tier and already owns one task) vs. register a fresh user per e2e run via the signup flow
   (fully isolated, but slower and depends on the dev-mode auto-confirm redirect in `signup.ts`/`confirm-email.astro`
   working as expected). This is a planning decision, not a research gap — flagging it here since both options
   are equally supported by what exists today.
1. **CI wiring specifics**: test-plan.md marks the e2e CI gate "required after Phase 5" but the *plan* stage
   still needs to decide the mechanics — a new job in `.github/workflows/ci.yml` needs local Supabase available
   in the runner (Docker service container + `supabase db reset`) and a running dev server (`webServer` config in
   `playwright.config.ts` or an explicit start/wait step) before Playwright can execute against it. Not
   researched further here since it's an implementation decision, but flagged so the plan doesn't treat "add a
   CI step" as a one-line afterthought.
