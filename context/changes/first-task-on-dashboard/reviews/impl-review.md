<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: User adds a maintenance task and sees it correctly prioritized on the dashboard

- **Plan**: context/changes/first-task-on-dashboard/plan.md
- **Scope**: All 3 phases (full plan)
- **Date**: 2026-09-07 (triage completed: 2026-09-08)
- **Verdict at review time**: NEEDS ATTENTION
- **Verdict post-triage**: APPROVED (see `## Verdicts` table below) — all 8 findings resolved (F1, F2, F3 (partial — WebKit deferred), F4, F5, F6, F7, F8 all FIXED); 2 lessons recorded (`context/foundation/lessons.md`)
- **Findings**: 0 critical, 3 warnings, 5 observations (F8 added during triage of F3, itself found and fixed)

## Verdicts

| Dimension           | Verdict (at review) | Verdict (post-triage)                                                                                                                                |
| ------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan Adherence      | PASS                | PASS                                                                                                                                                 |
| Scope Discipline    | PASS                | PASS                                                                                                                                                 |
| Safety & Quality    | WARNING             | PASS — F1, F4, F5, F8 all fixed                                                                                                                      |
| Architecture        | PASS                | PASS                                                                                                                                                 |
| Pattern Consistency | WARNING             | PASS — F2, F6, F7 all fixed                                                                                                                          |
| Success Criteria    | WARNING             | PASS — F3's "at least two browsers" bar is now met (Chromium + Firefox); WebKit remains a knowingly deferred, documented gap, not an unmet criterion |

**Overall verdict — post-triage: APPROVED** (was NEEDS ATTENTION at review time; superseded once all 8 findings were triaged — see Decision fields below and the Notes section's "Triage outcome").

## Findings

### F1 — Dashboard query error silently discarded

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:13
- **Detail**: `const { data: rawTasks } = supabase ? await supabase.from("maintenance_tasks").select("*") : { data: null };` discards the query's `error` entirely. A failed query (RLS denial, transient DB error, misconfigured client) silently falls through to the "No maintenance tasks yet." empty-state branch — a user has no way to distinguish "I really have zero tasks" from "the load failed." Violates the project's "never suppress errors silently" rule.
- **Fix**: Destructure `error` alongside `data`, and when it's non-null render an error banner (reuse the existing error-banner styling pattern already used for the `?error=` dialog case) instead of falling through to the empty-state branch.
- **Decision**: FIXED — destructured `tasksError`, logged via `console.error` server-side, and render a generic "We're having trouble loading your tasks right now. Please try refreshing the page." banner (no raw Supabase error surfaced to the user) using the existing `destructive` color tokens.

### F2 — Field errors don't clear as the user retypes

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/tasks/AddTaskDialog.tsx:102,114,133,159,173
- **Detail**: `src/components/auth/SignUpForm.tsx` clears a field's error as soon as the user edits it (its `onChange` handlers call `clearError`). `AddTaskDialog`'s `onChange`/`onValueChange` handlers only update the field's state — none of them touch `errors` — so a shown validation error stays on screen even after the user has fixed the field, until the next submit attempt. Deviates from this repo's established validate-on-submit UX convention.
- **Fix**: In each `onChange`/`onValueChange` handler, also clear `errors[field]` (e.g. `setErrors((prev) => ({ ...prev, name: undefined }))`), mirroring `SignUpForm.tsx`'s pattern.
- **Decision**: FIXED — added a `clearError(field)` helper matching `SignUpForm.tsx`'s pattern and called it from all six field handlers (name, category, importance, frequency_value, frequency_unit, last_done_date's `Calendar.onSelect`).

### F3 — Cross-browser manual check marked done despite only one browser tested

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: plan.md Progress item 3.11
- **Detail**: Phase 3's own Manual Verification criterion reads "Check the dashboard and dialog at a mobile viewport width and in at least two browsers, per the NFR on cross-browser/device usability." Progress item 3.11 is checked `[x]` with the note "Mobile viewport checked (Chromium only — Firefox/Safari not covered)." The item is marked complete despite not meeting its own stated bar — the disclosure is transparent (not rubber-stamped silently), but the checkbox state overstates what was actually verified against the NFR.
- **Fix A ⭐ Recommended**: Actually run the mobile-viewport check in a second browser (Firefox or WebKit/Safari via Playwright) now, and update the Progress note once confirmed.
  - Strength: Closes the gap the plan's own criterion asked for, with real evidence instead of a caveat.
  - Tradeoff: A few extra minutes of manual/automated browser testing before closing out the change.
  - Confidence: HIGH — Playwright MCP tooling is already used in this repo (per `.gitignore`'s playwright-scratch-output entry) and can drive a second browser directly.
  - Blind spot: None significant.
- **Fix B**: Leave Chromium-only as a consciously accepted, explicitly-scoped-down criterion — reword the Progress note as an accepted risk rather than a completed check, and note it in `change.md`.
  - Strength: No additional testing effort right now.
  - Tradeoff: The NFR's cross-browser bar goes unmet for this slice, with the risk deferred rather than resolved.
  - Confidence: MEDIUM — reasonable if this is genuinely low-risk (e.g. Tailwind/shadcn components with no known WebKit quirks), but that assumption isn't verified here.
  - Blind spot: Whether any of `Dialog`/`Popover`/`Calendar` (Radix-based) have known WebKit-specific issues hasn't been checked.
- **Decision**: FIXED (partially) — drove the dashboard and Add Task dialog at a 375×667 mobile viewport in Firefox (via a scratch Playwright script; a real Gecko engine, not Chromium) against this branch's own dev server (port 4322 — not the `manage-maintenance-tasks` worktree's server that happened to be running on 4321). Confirmed: no horizontal overflow, "Add task" button fully visible, and all dialog fields render within the viewport. Screenshots saved to the session scratchpad (not committed — one-off verification artifacts). Progress item 3.11 updated with real two-browser evidence.
  WebKit/Safari still isn't covered: attempting it surfaced that this app's `secure: true` session cookie (`src/lib/supabase.ts:20`) is silently rejected by WebKit over the plain-`http://localhost` dev server (Chromium and Firefox both treat `localhost` as a trustworthy origin for `Secure` cookies; WebKit did not in this test), so sign-in never persists a session for WebKit under local dev — the same origin serves HTTPS in production via Cloudflare Workers, so this is very likely a local-testing-environment artifact rather than a production defect, but it wasn't independently confirmed against a real HTTPS-fronted deployment. Testing Safari here would need a local HTTPS-fronted dev server (e.g. `astro dev` behind a TLS proxy) — deferred as a separate, smaller piece of work rather than blocking this decision.

### F4 — Future-date validation can misfire near midnight across timezones

- **Severity**: ⚪ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/task-schema.ts:16
- **Detail**: `.refine((date) => date <= new Date(), ...)` compares the parsed calendar-day (local midnight per `parseISO`) against the server's current instant. Cloudflare Workers evaluate `new Date()` in UTC. A user in a timezone ahead of UTC can have their genuine "today" rejected as a future date in the hour(s) after their local midnight but before UTC midnight, and the reverse can let a technically-future date slip through for users behind UTC. This is a different issue from the already-fixed "stale `new Date()` at module load" bug — it's an inherent cross-timezone comparison gap, not a regression.
- **Fix A ⭐ Recommended**: Accept and document the limitation — add a one-line comment on the `.refine` noting the known cross-timezone edge case is accepted, since the product's target scale/NFRs don't call out strict timezone correctness.
  - Strength: Zero code risk, matches the "small scale, low QPS" NFR framing already in the plan's Performance Considerations.
  - Tradeoff: The edge case remains user-visible (rare, narrow window) if it ever matters.
  - Confidence: HIGH — consistent with how the rest of this slice treats date handling (calendar-day granularity, no timezone-aware infrastructure elsewhere).
  - Blind spot: None significant.
- **Fix B**: Widen the boundary with a one-day grace window (e.g. `date <= addDays(new Date(), 1)`) to tolerate the worst-case ~24h timezone skew.
  - Strength: Removes the false-rejection failure mode entirely for any real-world timezone offset.
  - Tradeoff: Slightly weakens the "no future dates" rule — a user could submit a date up to ~24h ahead of true UTC-now and it would pass.
  - Confidence: MEDIUM — a standard mitigation pattern, but changes the validation's precise semantics.
  - Blind spot: Whether the PRD's FR-008/FR-009 wording treats "future date" as a hard business rule that this would violate.
- **Decision**: FIXED via Fix B — `last_done_date`'s refine now compares against `addDays(new Date(), 1)`. Discussed the direction of the bug first: it only affects timezones ahead of UTC (e.g. Warsaw, UTC+1/+2), only as a false *rejection* of a genuinely-today date in the 1-2 hour window between local midnight and UTC midnight — never a false acceptance, since the client-side picker already blocks true future dates using the browser's own clock. Updated `task-schema.test.ts`: the old "reject tomorrow" case now asserts *acceptance* (within the grace window) and a new case asserts rejection at +2 days (beyond it). Recorded as a lesson (see `context/foundation/lessons.md`).

### F5 — `name` field has no maximum length

- **Severity**: ⚪ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/task-schema.ts:7
- **Detail**: `name: z.string().trim().min(1, "Name is required")` has no `.max()`, and the underlying `name text` column is unbounded too, so an arbitrarily large string can be inserted.
- **Fix**: Add `.max(200, "Name must be 200 characters or less")` (or similar) to `addTaskSchema.name`.
- **Decision**: FIXED + ACCEPTED-AS-RULE: "String fields must always have a maximum length" — added `.max(200, ...)` and a rejection test case for a 201-character name.

### F6 — API route tests don't cover the validation-failure or misconfigured-Supabase branches

- **Severity**: ⚪ OBSERVATION
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/tasks/index.test.ts
- **Detail**: The plan's own Testing Strategy calls out the auth-gate as this phase's biggest risk and only requires the null-user and happy-path cases, both of which are present. But `index.ts` also has a zod-validation-failure redirect branch and a "Supabase is not configured" branch, neither of which has a test, even though the file already uses the `vi.hoisted()` mock convention needed to add them cheaply.
- **Fix**: Add a case asserting `redirect` is called with the zod error message (and `insert` never invoked) for an invalid payload.
- **Decision**: FIXED — added a validation-failure test case (blank `name`) asserting the `?error=Name%20is%20required` redirect and that `insert` is never called. Needed an `insertMock.mockClear()` at the top of the new test since this test file doesn't reset mocks between cases and an earlier test's call count would otherwise leak in. Left the "Supabase is not configured" branch untested — same shape as the untested branch in `signup.ts`'s own tests, so not a new gap introduced here.

### F7 — No test for `computeDueDate`'s exhaustiveness guard

- **Severity**: ⚪ OBSERVATION
- **Dimension**: Pattern Consistency
- **Location**: src/lib/status.test.ts
- **Detail**: `status.ts` guards its frequency-unit switch with a `default` branch that throws on an unhandled value (the plan's own safeguard against the repo's missing ESLint exhaustiveness-check). No test exercises that branch.
- **Fix**: Add a test that casts an invalid `frequency_unit` past the type system and asserts `computeDueDate` throws.
- **Decision**: FIXED — added a test casting `"decade"` past the type system via `as unknown as MaintenanceFrequencyUnit` and asserting `computeDueDate` throws with the "Unhandled frequency unit" message.

### F8 — Zod's raw internal messages leak to the user for 3 of 6 fields

- **Severity**: ⚪ OBSERVATION
- **Dimension**: Safety & Quality
- **Location**: src/lib/task-schema.ts:8-11,12-16
- **Detail**: Discovered while confirming F3 live in the running app. `category`, `importance`, and `frequency_unit` are declared as `z.enum(Constants.public.Enums...)` with no custom message, and `last_done_date`'s two `.refine()` calls only cover "Invalid date" and the future-date rule, not the underlying `z.string().transform(parseISO)` step. Triggering these in `AddTaskDialog` shows the user Zod's default wording verbatim: `Invalid option: expected one of "hvac"|"plumbing"|"electrical"|"appliances"|"safety_securit..."` and `Invalid input: expected string, received undefined` — internal type-checking language, not a message written for an end user. `name` and `frequency_value` already have proper custom messages, so the gap is inconsistent rather than total.
- **Fix**: Add a custom `message` (or `.refine`/`error` map) to the `category`/`importance`/`frequency_unit` enums and to `last_done_date`'s date-parse step, matching the tone of the existing `name`/`frequency_value` messages.
- **Decision**: FIXED — verified the exact Zod v4 API via context7 first (`z.enum(values, "message")` / `z.string("message")`, the same positional-string shorthand this schema already uses for `.min()`/`.positive()`). Added `"Select a valid category"` / `"Select a valid importance"` / `"Select a valid frequency unit"` to the three enums and `"Pick a last-done date"` to `last_done_date`'s base `z.string()` (the actual source of the `last_done_date` message shown in the F3 screenshot — it's the base-type check firing when the client sends `undefined` for an unpicked date, before the `.refine()` chain ever runs, not the refines themselves, which already had their own custom messages). Added two new test cases asserting the friendly messages. Confirmed both live via a scratch Vitest check before committing to the wording.

## Notes

- **Plan Adherence**: all three phases' planned files match their contracts exactly (verified file-by-file) — no drift, no missing implementation.
- **Scope Discipline**: all "What We're NOT Doing" guardrails respected (no CRUD beyond POST, no react-hook-form/testing-library, no prerender retrofit on auth routes, no field-value preservation across error redirects, no client-side fetch, no non-goal features). One benign, unrequested extra: `task-schema.test.ts` includes an additional timezone round-trip test block — harmless extra robustness coverage, not scope creep.
- **Automated verification** (re-run during this review): `npm run test` (23/23 passed), `npx astro check` (0 errors), `npm run lint` (clean), `npm run build` (succeeded under the Cloudflare adapter).
- **Architecture**: new `src/components/tasks/` folder correctly kept separate from `src/components/auth/*`; `POST /api/tasks` correctly self-checks `context.locals.user` since `PROTECTED_ROUTES` doesn't cover `/api/*`; RLS relied upon for the unscoped `.select("*")` (verified against the `maintenance_tasks` migration's per-operation, per-`user_id` policies).
- **Triage outcome (2026-09-08)**: all 8 findings fixed. Final automated verification after all fixes: `npm run test` (28/28 passed), `npx astro check` (0 errors), `npm run lint` (clean, one pre-existing `no-console` warning on the new F1 error-logging line — that rule is `"warn"` project-wide by design, exit code 0), `npm run build` (succeeded). Two lessons recorded: "Server-side 'no future date' checks on a bare calendar-day string need a timezone grace window" and "String fields must always have a maximum length". `plan.md` Progress item 3.11 updated with real Firefox mobile-viewport evidence (WebKit still not covered — local dev serves plain HTTP, and WebKit rejects this app's `Secure` session cookie over non-TLS `localhost`, unlike Chromium/Firefox; production is HTTPS via Cloudflare Workers so this is very likely a local-testing-environment limitation, not a confirmed production defect).
