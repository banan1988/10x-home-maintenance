---
project: Home Maintenance
version: 1
status: draft
created: 2026-08-25
updated: 2026-09-14
prd_version: 1
main_goal: speed
top_blocker: capacity
milestone_id: mvp-launch
milestone_seq: 1
milestone_status: open
---

# Roadmap: Home Maintenance

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-1: MVP Launch — Task Tracking with Auto Status** — Status: open

- **Intent:** Ship every must-have PRD capability — task CRUD, automatic due-date/status computation, a
  per-user urgency dashboard, and full cross-user data isolation — as one deployable, demoable application.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** every F-NN and S-NN below is `done`, and the app has been deployed and demoed as a working
  application (PRD Success Criteria, Secondary).
- **Scope anchors:** FR-001–FR-011, US-01 — this milestone is the entire MVP scope of PRD v1. Extended
  2026-09-14 with three audit-sourced scope anchors (found via a Playwright + code walkthrough of the running
  app, not derived from the PRD text) that the user explicitly authorized as in-scope for this milestone:
  - MS-01: Replace the untouched 10x-Astro-Starter landing page with real product content — a demoable MVP
    (Success Criteria, Secondary: "deployed and demoed as a working application") should not greet a
    first-time visitor with generic starter copy about "cosmic developer experience."
  - MS-02: Give every authenticated page one consistent header/nav/footer instead of each page hand-rolling
    its own ad-hoc navigation — same Secondary Success Criterion: a demoable app needs its screens to read as
    one product, not disconnected fragments.
  - MS-03: Let a user delete their own account and all associated data (RODO/GDPR right to erasure). This item
    was previously logged in `## Parked` as *"not in PRD scope (no FR; not in Non-Goals either — a real
    gap)"*; promoted to in-scope here by explicit user decision on 2026-09-14.

## Vision recap

A homeowner or renter managing exactly one property has cyclical maintenance tasks — filter changes,
inspections, battery swaps — that today live scattered across memory, notes, or a calendar, so tasks slip past
their due date unnoticed. Home Maintenance's bet is that status (OK / DUE SOON / OVERDUE) should be computed
automatically from each task's frequency and last-completed date and surfaced on a dedicated dashboard, instead
of requiring the user to work it out by hand.

## North star

**S-01: User adds a maintenance task and sees it correctly prioritized on the dashboard** — this is the only
formal user story in the PRD (US-01) and it directly exercises every primary Success Criterion at once: task
CRUD, automatic status computation, and an urgency-ordered dashboard.

> "North star" here means the smallest end-to-end slice that, if it works, proves the product's central bet —
> that automatic status derivation beats a manually-tracked to-do list. It is sequenced as early as its
> Prerequisites allow, because every other slice only matters once this one is proven.

## At a glance

| ID   | Change ID                       | Outcome (user can …)                                                                     | Prerequisites | PRD refs                                                      | Status   |
| ---- | ------------------------------- | ---------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------- | -------- |
| F-01 | `maintenance-task-data-model`   | (foundation) maintenance task schema with per-user RLS isolation lands                   | —             | NFR (cross-user data isolation), Access Control               | done     |
| S-01 | `first-task-on-dashboard`       | add a maintenance task and see it correctly prioritized on the dashboard                 | F-01          | US-01, FR-001, FR-002, FR-003, FR-004, FR-008, FR-009, FR-010 | done     |
| S-02 | `manage-maintenance-tasks`      | view, edit (incl. mark-complete), and delete their maintenance tasks                     | F-01          | FR-005, FR-006, FR-007                                        | done     |
| S-03 | `maintenance-tasks-api`         | perform full CRUD on their maintenance tasks via the API                                 | F-01          | FR-011                                                        | done     |
| S-04 | `home-maintenance-landing-page` | understand the product and sign up/in from a real landing page, not the starter template | S-05          | MS-01                                                         | proposed |
| S-05 | `shared-app-shell`              | navigate every page via one consistent header/nav + footer                               | —             | MS-02                                                         | ready    |
| S-06 | `account-deletion`              | permanently delete their own account and all of their data                               | —             | MS-03                                                         | ready    |

(S-04/S-05/S-06 are listed here in ID order rather than strict dependency order, by request — S-04 actually
waits on S-05. See its `Prerequisites` above, S-05's `Risk` below, or the sequencing notes in
`## Backlog Handoff` for the real build order.)

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the
dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                        | Chain           | Note                                                                                                                                                                                   |
| ------ | ---------------------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A      | Core capability (north star) | `F-01` → `S-01` | Primary path — ships the capability that validates the product before anything else, per `main_goal: speed`.                                                                           |
| B      | Task management              | `F-01` → `S-02` | Independent of Stream A once `F-01` lands — a second agent run can build this in parallel.                                                                                             |
| C      | API access                   | `F-01` → `S-03` | Independent of Streams A/B once `F-01` lands — a third agent run can build this in parallel.                                                                                           |
| D      | Consistent UI shell          | `S-05` → `S-04` | `S-04` waits on `S-05` — both touch how `Layout.astro`/`index.astro` compose page chrome; building the landing hero after the shared header/footer exists avoids redesigning it twice. |
| E      | Account lifecycle (RODO)     | `S-06`          | Standalone — new API route + its own confirmation UI, no shared files with Streams A–D; safe to run fully in parallel with everything else.                                            |

(All three of A/B/C share one foundation and remain parallel once `F-01` lands, as before. Streams D and E are
new: `S-05` and `S-06` have no dependency on anything and can start immediately, in parallel with each other
and with any of A/B/C — `top_blocker: capacity` makes this the most actionable lever again. `S-04` is the one
exception: sequence it after `S-05` rather than in parallel, to avoid two agents reworking the same
landing-page composition.)

## Baseline

What's already in place in the codebase as of `2026-08-25` (auto-researched + user-confirmed). Foundations
below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro 6 SSR + React 19 islands, Tailwind 4, shared UI components (`src/components/ui/`,
  `src/layouts/Layout.astro`).
- **Backend / API:** partial — API routes exist only for auth (`src/pages/api/auth/{signin,signup,signout}.ts`);
  no routes yet for maintenance tasks (FR-011 not implemented).
- **Data:** absent — no migration or table for maintenance tasks exists yet; only Supabase project config
  (`supabase/config.toml`).
- **Auth:** present — Supabase SSR client (`src/lib/supabase.ts`), request-scoped user resolution and route
  protection (`src/middleware.ts`), auth pages (`src/pages/auth/{signin,signup,confirm-email}.astro`), session
  cookies forced `Secure`/`HttpOnly` (PR #6).
- **Deploy / infra:** present — Cloudflare adapter (`wrangler.jsonc`, `@astrojs/cloudflare`), CI running
  lint+test+build on every push/PR (`.github/workflows/ci.yml`), production auto-deploy via Cloudflare Workers
  Builds' native Git integration.
- **Observability:** absent — no logging, error-tracking, or metrics library found in the codebase.

## Foundations

### F-01: Maintenance task data model with per-user isolation

- **Outcome:** (foundation) a `maintenance_tasks` table exists (name, predefined category, importance,
  `frequency_value` + `frequency_unit`, `last_done_date`, owning user) with row-level security enforcing that a
  user can only read/write their own tasks.
- **Change ID:** `maintenance-task-data-model`
- **PRD refs:** Access Control (per-user data isolation), Non-Functional Requirements (no user's data ever
  exposed to another user)
- **Unlocks:** S-01, S-02, S-03 — none of the three vertical slices has anything to read, write, or compute
  against until this table and its isolation policy exist.
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Highest-leverage item in the roadmap — every slice reuses this schema, and an isolation mistake here
  directly violates the PRD's guardrail that a user must never see another user's data. Sequenced first because
  nothing else can start, or be safely verified, without it.
- **Status:** done

## Slices

### S-01: User adds a maintenance task and sees it correctly prioritized on the dashboard

- **Outcome:** user can add a maintenance task (name, category, importance, frequency, last-done date) and
  immediately see it on the dashboard with an automatically computed status (OK / DUE SOON / OVERDUE), ordered
  by status then importance.
- **Change ID:** `first-task-on-dashboard`
- **PRD refs:** US-01, FR-001, FR-002, FR-003, FR-004, FR-008, FR-009, FR-010
- **Prerequisites:** F-01; registration/login/logout already implemented (Baseline: Auth — present), so this
  slice consumes that flow rather than building it.
- **Parallel with:** S-02, S-03 (all three depend only on F-01)
- **Blockers:** —
- **Unknowns:** —
- **Risk:** This is the north star — the smallest full add-to-dashboard loop that proves the core product bet.
  Sequenced immediately after F-01, ahead of every other slice, because a hard 2026-09-10 deadline with a
  solo-plus-agent team means the validating slice has to land before anything else competes for the remaining
  time.
- **Status:** done

### S-02: User views, edits, and deletes their maintenance tasks

- **Outcome:** user can browse their full maintenance task list, edit a task (including updating its last-done
  date to mark it as just completed), and permanently delete a task.
- **Change ID:** `manage-maintenance-tasks`
- **PRD refs:** FR-005, FR-006, FR-007
- **Prerequisites:** F-01
- **Parallel with:** S-01, S-03
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Marking a task complete (via the edit flow's last-done-date update) is how a user resets a task's
  due cycle every time they act on it — a defect here breaks the core value loop just as surely as a broken add
  flow, so it must not be treated as lower-priority polish. It depends only on F-01, so it can be planned and
  built in parallel with S-01 rather than queued behind it.
- **Status:** done

### S-03: User performs task CRUD via the API

- **Outcome:** a user (via the API, using their own authenticated session) can create, read, update, and delete
  their maintenance tasks.
- **Change ID:** `maintenance-tasks-api`
- **PRD refs:** FR-011
- **Prerequisites:** F-01
- **Parallel with:** S-01, S-02
- **Blockers:** —
- **Unknowns:** —
- **Risk:** No external API consumer is confirmed yet (noted in the PRD itself), but it is a stated must-have.
  Because it depends only on F-01 and not on the other two slices, it is the easiest of the three to hand to a
  separate parallel agent run without risking the deadline.
- **Status:** done

### S-04: User understands the product and can sign up/in from a real landing page

- **Outcome:** a first-time visitor sees actual product content (problem statement, value proposition, CTA
  to sign up/sign in) instead of the untouched 10x-Astro-Starter template.
- **Change ID:** `home-maintenance-landing-page`
- **PRD refs:** MS-01
- **Prerequisites:** S-05 — not a technical blocker (the landing page could be rewritten today without it),
  but both slices compose the same `Layout.astro` → `index.astro` render path; designing the new hero before
  the shared header/footer exists risks a rework pass once S-05 wraps every page (including this one) in
  persistent chrome.
- **Parallel with:** S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Found by direct audit: page title is literally "10x Astro Starter", copy reads "a production-ready
  starter with authentication, modern tooling, and a cosmic developer experience" — nothing about home
  maintenance. Sequenced right after S-05 so the new hero is designed to sit under the shared header rather
  than fighting it later.
- **Status:** proposed

### S-05: User navigates every page through one consistent header, nav, and footer

- **Outcome:** user sees the same header (app name, nav: Dashboard / Tasks, user menu with sign-out) and
  footer on every authenticated page, instead of each page hand-rolling its own ad-hoc chrome.
- **Change ID:** `shared-app-shell`
- **PRD refs:** MS-02
- **Prerequisites:** —
- **Parallel with:** S-06 (and any of S-01/S-02/S-03's follow-on work); NOT parallel with S-04, which waits on
  this slice — see S-04's Risk.
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Found by direct audit (Playwright walkthrough): `src/components/Topbar.astro` is only wired into
  the landing page today; `dashboard.astro` hand-rolls its own inline sign-out form and `tasks/index.astro`
  hand-rolls its own "← Back to dashboard" link — three different ad-hoc navigation patterns across three
  pages. Sequenced early (no Prerequisites) because it touches every existing page and every later UI change
  is cheaper once there is one shared chrome to change instead of three.
- **Status:** ready

### S-06: User permanently deletes their own account and all of their data

- **Outcome:** an authenticated user can, from a strongly-confirmed UI action, trigger immediate deletion of
  their Supabase auth account; all of their `maintenance_tasks` rows are removed as a consequence (RODO/GDPR
  right to erasure).
- **Change ID:** `account-deletion`
- **PRD refs:** MS-03
- **Prerequisites:** —
- **Parallel with:** S-04, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Requires a new server-only secret/service-role Supabase client (never exposed to the client
  bundle) calling `auth.admin.deleteUser(user.id)` — an immediate, hard delete; a 30-day soft-delete-then-cron
  approach was explicitly considered and rejected (GoTrue's native soft-delete revokes credentials instantly
  anyway, so it wouldn't give a genuine change-your-mind window, and it would add pg_cron/Vault infrastructure
  outside this app for no real benefit). `maintenance_tasks` cascade-deletes automatically via the existing
  `on delete cascade` FK in `supabase/migrations/20260827194321_create_maintenance_tasks.sql` — no new
  migration needed. To stay genuinely parallel-safe with S-05 (which also touches `dashboard.astro`), give
  the delete action its own page/entry point rather than bolting it onto the dashboard. The UI confirmation
  must be stronger than the existing single-click `DeleteTaskAlertDialog.tsx` pattern (e.g. type your email or
  a confirmation phrase before the button activates) — this is irreversible for a whole account, not one
  task.
- **Status:** ready

## Backlog Handoff

| Roadmap ID | Change ID                       | Suggested issue title                                        | Ready for `/10x-plan` | Notes                                                         |
| ---------- | ------------------------------- | ------------------------------------------------------------ | --------------------- | ------------------------------------------------------------- |
| F-01       | `maintenance-task-data-model`   | Design maintenance_tasks schema with per-user RLS isolation  | yes                   | —                                                             |
| S-01       | `first-task-on-dashboard`       | Add maintenance task + urgency-sorted dashboard (north star) | no                    | Waiting on F-01                                               |
| S-02       | `manage-maintenance-tasks`      | View, edit (mark-complete), and delete maintenance tasks     | no                    | Waiting on F-01; can run parallel to S-01/S-03 once unblocked |
| S-03       | `maintenance-tasks-api`         | Expose maintenance task CRUD via the API (FR-011)            | no                    | Waiting on F-01; can run parallel to S-01/S-02 once unblocked |
| S-04       | `home-maintenance-landing-page` | Write a real landing page, replacing the starter template    | no                    | Waiting on S-05; can run parallel to S-06 once unblocked      |
| S-05       | `shared-app-shell`              | Build one shared header/nav/footer, retire per-page nav      | yes                   | No prerequisites; can run parallel to S-06; unblocks S-04     |
| S-06       | `account-deletion`              | Add self-service account + data deletion (RODO/GDPR)         | yes                   | No prerequisites; can run parallel to S-04/S-05               |

## Open Roadmap Questions

None currently. The PRD scored 4/4 on the roadmap-readiness heuristic with zero open questions, and no
cross-cutting sequencing question emerged during the interview. MS-01/MS-02/MS-03 (added 2026-09-14) carry no
blocking unknowns either — all three were fully specified during the audit conversation with the user.

## Parked

- **Mobile app** — Why parked: PRD Non-Goals — web app only for MVP.
- **Sharing a home/property with other users** — Why parked: PRD Non-Goals — single-user ownership only.
- **Multiple properties per user** — Why parked: PRD Non-Goals — exactly one property per user.
- **Push or SMS notifications** — Why parked: PRD Non-Goals — status is surfaced only when the user opens the app.
- **Calendar integration** — Why parked: PRD Non-Goals — no sync with external calendar systems.
- **Payments** — Why parked: PRD Non-Goals — product is free/unmonetized at MVP stage.
- **IoT integration** — Why parked: PRD Non-Goals — no device connectivity or sensor data.
- **Photos or document scanning** — Why parked: PRD Non-Goals — tasks are text/data only.
- **Advanced analytics / reporting** — Why parked: PRD Non-Goals — beyond OK/DUE SOON/OVERDUE, no trend analysis.
- **AI/LLM as a required element** — Why parked: PRD Non-Goals — the status rule must work without AI.
- **Custom recommendation/scheduling algorithm** — Why parked: PRD Non-Goals — the fixed rule is the entire
  decision logic; no adaptive scheduling in MVP.
- **Category filtering / custom categories / category-specific logic** — Why parked: PRD Non-Goals — categories
  are predefined and organizational only.
- **Password reset** — Why parked: not in PRD scope (no FR; not in Non-Goals either — a real gap). User
  decision: fast-follow after the main implementation, nice-to-have.

> Account deletion was parked here until 2026-09-14, when the user promoted it to `S-06` (MS-03) after a
> UI/code audit surfaced it as a genuine RODO/GDPR gap. See `## Slices` → S-06.

## Milestone History

(Empty — this is the first milestone.)

## Done

(Empty on first generation.)
