---
project: "Home Maintenance"
version: 1
status: draft
created: 2026-08-13
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: "2026-09-10"
  after_hours_only: true
---

# PRD: Home Maintenance

## Vision & Problem Statement

A homeowner or renter managing exactly one property has many cyclical maintenance tasks — filter changes,
inspections, device cleaning, battery swaps, system upkeep — that today live scattered across memory, notes, or a
calendar. During a routine check-in, there is no single place that answers "what in my home needs attention right
now?", so tasks slip past their due date unnoticed.

Generic tools (calendars, notes, spreadsheets) require the user to manually work out whether a task is overdue.
The insight behind Home Maintenance is that status — OK, DUE SOON, OVERDUE — should be computed automatically from
each task's frequency and last-completed date, and surfaced on a dedicated dashboard built for exactly this
question, rather than buried as one more event type in a general-purpose tool.

## User & Persona

Primary persona: a single homeowner or renter managing exactly one property (e.g. their own house or flat), who
wants to track their own cyclical maintenance tasks without relying on memory, notes, or an external calendar. No
secondary persona in this MVP — no property sharing, no multi-property management.

## Success Criteria

### Primary

- User can register and log in.
- User can perform full CRUD on their own maintenance tasks.
- The app correctly computes the next due date and status (OK / DUE SOON / OVERDUE) for each task.
- The dashboard lets the user quickly find which tasks need attention.

### Secondary

- The MVP can be deployed and demoed as a working application.

### Guardrails

- A user has no access to another user's data.
- A working E2E test of the key user flow exists.
- CI automatically runs tests and build on every change.

MVP flow (first session): 1) register/log in, 2) add one or more maintenance tasks (name, category, importance,
frequency, last-done date), 3) app auto-computes next due date and status, 4) dashboard surfaces tasks by urgency.

## User Stories

### US-01: User adds a maintenance task and sees it surfaced on the dashboard

- **Given** a logged-in user
- **When** they add a maintenance task with name, category, importance, frequency, and last-done date
- **Then** the app computes the next due date and status (OK / DUE SOON / OVERDUE), and the dashboard shows the
  task, prioritized/ordered by urgency

#### Acceptance Criteria

- The newly added task appears on the dashboard immediately with a computed status.
- Status correctly reflects OK / DUE SOON / OVERDUE based on frequency and last-done date.
- Dashboard ordering is: status first (OVERDUE → DUE SOON → OK), then importance within each status group
  (HIGH → MEDIUM → LOW).

## Functional Requirements

### Authentication

- FR-001: User can register an account. Priority: must-have
  > Socrates: Counter-argument considered: "a single-user app might not need full registration." Resolution: kept
  > as written.
- FR-002: User can log in. Priority: must-have
  > Socrates: Counter-argument considered: "data isolation may not require real auth." Resolution: kept as
  > written.
- FR-003: User can log out. Priority: must-have
  > Socrates: Counter-argument considered: "session expiry alone could replace explicit logout." Resolution: kept
  > as written.

### Maintenance tasks

- FR-004: User can add a maintenance task with name, category, importance, frequency, and last-done date.
  Priority: must-have
  > Socrates: Counter-argument considered: "5 required fields raises first-action friction; category could be
  > freeform." Resolution: kept as written. Categories are predefined by the app for MVP — users cannot create or
  > edit categories.
- FR-005: User can edit an existing maintenance task, including updating its last-done date to mark it as just
  completed. Priority: must-have
  > Socrates: Counter-argument considered: "edit is redundant with delete+recreate." Resolution: kept as written —
  > editing (e.g. updating last-done date after completing a task) is core to normal use.
- FR-006: User can view their maintenance tasks. Priority: must-have
  > Socrates: Counter-argument considered: "redundant with the dashboard." Resolution: kept as written — a full
  > list view serves browse/edit/delete; the dashboard is urgency-focused.
- FR-007: User can delete a maintenance task. Priority: must-have
  > Socrates: Counter-argument considered: "permanent deletion loses maintenance history." Resolution: kept as
  > written — permanent deletion with no recovery option is acceptable for MVP; history tracking is out of scope.

### Status calculation

- FR-008: App automatically calculates the next due date for a task from its frequency and last-done date.
  Priority: must-have
  > Socrates: Counter-argument considered: "ambiguous when frequency changes mid-cycle." Resolution: `next_due_date`
  > is always calculated from the task's current `frequency` and `last_done_date`. Changing the frequency does not
  > modify `last_done_date` and does not reset the maintenance cycle. Frequency model: `frequency_value` (integer)
  > combined with `frequency_unit`, limited to `day` | `week` | `month` | `year`.
- FR-009: App automatically determines a task's status (OK / DUE SOON / OVERDUE) based on its next due date. DUE
  SOON means the task is due within the next 7 days. Priority: must-have
  > Socrates: Counter-argument considered: "DUE SOON threshold isn't specified — FR is unimplementable without it."
  > Resolution: fixed 7-day threshold. Business rule: `next_due_date < today` → OVERDUE; `today <= next_due_date <= today + 7 days` → DUE SOON; `next_due_date > today + 7 days` → OK.

### Dashboard

- FR-010: User can view an urgency-focused dashboard showing the maintenance tasks that require the most
  attention, sorted first by status (OVERDUE → DUE SOON → OK), then by importance (HIGH → MEDIUM → LOW) within
  each status group. Priority: must-have
  > Socrates: Counter-argument considered: "might just be FR-006 sorted by urgency." Resolution: kept as written —
  > the dashboard is a distinct, urgency-focused view; FR-006 serves browse/manage of all tasks.

### API

- FR-011: User (via API) can perform create/read/update/delete operations on their maintenance tasks.
  Priority: must-have
  > Socrates: Counter-argument considered: "no external API consumer is planned yet." Resolution: kept as written
  > — required per the seed spec independent of consumer count.

## Non-Functional Requirements

- A user sees the dashboard and task list update within a perceptible instant of any add/edit/delete action —
  no multi-second waits for routine operations.
- No user's maintenance data is ever exposed to another user, through any interface (UI or API).
- The product remains usable on the latest versions of mainstream desktop and mobile browsers, with no
  dependency on a specific device or browser.

## Business Logic

The app automatically determines each maintenance task's status (OK / DUE SOON / OVERDUE) by comparing today's
date against a next-due-date it computes from the task's frequency and last-done date, using a fixed 7-day DUE
SOON window.

The rule consumes two user-supplied inputs per task: how often the task recurs (frequency) and when it was last
completed (last-done date). From these it derives a next-due-date, and from that a status — the user never states
a status directly; it is always derived.

The user encounters this rule everywhere a task is shown: on the dashboard, where tasks are sorted first by status
(OVERDUE → DUE SOON → OK) and then by importance (HIGH → MEDIUM → LOW) within each status group so the most
urgent items surface first, and on the task list, where each task carries its current status as a visible label.

## Access Control

Email/password login: registration, sign in, sign out. Flat role model — every authenticated user has identical
capabilities, scoped entirely to their own data. No admin role, no role hierarchy. Each user's maintenance data is
fully isolated from every other user's data; no cross-user visibility of any kind.

## Non-Goals

- No mobile app — web app only for MVP.
- No sharing a home/property with other users — single-user ownership only.
- No support for multiple properties per user — exactly one property per user.
- No push or SMS notifications — status is surfaced only when the user opens the app.
- No calendar integration — no sync with external calendar systems.
- No payments — the product is free/unmonetized at MVP stage.
- No IoT integration — no device connectivity or sensor data.
- No photos or document scanning — tasks are text/data only.
- No advanced analytics — beyond the OK/DUE SOON/OVERDUE status view, no reporting or trend analysis.
- No AI/LLM as a required element — the core status-calculation rule (frequency + last-done date, fixed 7-day
  threshold) must work without AI. AI may be explored later as an optional, non-blocking enhancement.
- No custom recommendation/scheduling algorithm — the fixed rule (next-due-date + 7-day DUE SOON window) is the
  entire decision logic; no adaptive or learned scheduling in MVP.
- No category filtering, custom categories, or category-specific business logic — categories are kept as a
  predefined, app-defined attribute for organization only; they do not drive status, sorting, or any other rule
  in MVP.

## Open Questions

No unresolved gaps — all required PRD content was present in the shaped input (score 4/4 on the shaping
heuristic). Two minor wording fixes were applied during generation for stack-openness: "REST API" → "API" (FR-011,
NFR) and "hard delete" → "permanent deletion with no recovery option" (FR-007 Socratic note); both were confirmed
by the user before writing.
