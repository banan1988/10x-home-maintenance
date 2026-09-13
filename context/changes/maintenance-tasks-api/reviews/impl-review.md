<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Maintenance Tasks JSON API

- **Plan**: context/changes/maintenance-tasks-api/plan.md
- **Scope**: Phase 4 of 4 (full plan)
- **Date**: 2026-09-13
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | WARNING |
| Success Criteria    | PASS    |

## Findings

### F1 — Malformed JSON body crashes the route instead of returning a JSON error

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/v1/tasks/index.ts:36, src/pages/api/v1/tasks/[id].ts:40
- **Detail**: `context.request.json()` is called with no try/catch. `Request.json()` throws a `SyntaxError` on invalid JSON, which is unhandled here and propagates out of the route handler as an uncaught exception (Astro's default error page), not the `{ error: {...} }` envelope. This directly contradicts the plan's own Desired End State: "Every response is JSON: `{ data: ... }` on success, `{ error: ... }` on failure." No test covers a malformed-JSON request body.
- **Fix A ⭐ Recommended**: Add a shared `parseJsonBody` helper (e.g. in `src/lib/api-response.ts`, alongside `jsonData`/`jsonError`) that try/catches the parse and returns `jsonError(400, "Invalid JSON body")` on `SyntaxError`; both routes call it instead of `context.request.json()` directly.
  - Strength: Matches this plan's own Phase 1 philosophy — centralize JSON-API infrastructure once rather than duplicating it — and both routes only need a one-line call-site change.
  - Tradeoff: Touches `api-response.ts`, a file Phase 1 already marked complete; adds one new exported function and its unit test.
  - Confidence: HIGH — the codebase already centralizes `jsonData`/`jsonError` for exactly this kind of shared concern.
  - Blind spot: None significant.
- **Fix B**: Wrap `context.request.json()` in try/catch inline at each of the two call sites.
  - Strength: Minimal, localized change, no new exported surface.
  - Tradeoff: Duplicates the same 3-line try/catch in two places today, and a third `/api/v1/*` route added later could easily forget it.
  - Confidence: MEDIUM — works, but reintroduces the exact "shared logic duplicated per route" problem `requireApiUser`/`requireApiClient` were built to avoid.
  - Blind spot: None significant.
- **Decision**: FIXED (via Fix A) — added `parseJsonBody` to `src/lib/api-response.ts`, both routes now call it and short-circuit on `instanceof Response`; unit tests added; `npm run test`/`lint`/`build` all pass.

### F2 — roadmap.md still shows S-03 as `in-progress` after the change was closed out

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/roadmap.md:57, context/foundation/roadmap.md:163
- **Detail**: `change.md` is `status: implemented` and every Phase 1-4 Progress checkbox is `[x]`, but the epilogue commit (`8e6bb08`) only touched `plan.md` and `change.md` — it never touched `roadmap.md`. Both the at-a-glance table (line 57) and the S-03 detail section (line 163) still read `in-progress`. This is a direct recurrence of the recorded lesson "Closing out a plan must also update roadmap.md" (`context/foundation/lessons.md`).
- **Fix**: Update S-03's status to `done` in both the at-a-glance table (line 57) and the `### S-03` detail section (line 163) of `roadmap.md`.
- **Decision**: FIXED — both S-03 status fields in `roadmap.md` set to `done`.

### F3 — Raw Supabase error message returned verbatim in 500 responses

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/v1/tasks/index.ts:23, src/pages/api/v1/tasks/index.ts:55
- **Detail**: On a Supabase query/insert error, both `GET` and `POST` return `jsonError(500, error.message)`, echoing the raw DB error string (potentially including column/constraint names) to the client. This mirrors the pre-existing pattern in `src/pages/api/tasks/index.ts:33` (same behavior, via redirect), so it isn't a new-file regression — but it's the one place in the new public JSON surface where an internal error reaches an arbitrary API consumer's response body.
- **Fix**: Return a generic message (e.g. `"Failed to load tasks"` / `"Failed to create task"`) and log `error.message` server-side instead of returning it directly.
- **Decision**: FIXED — both 500 paths in `src/pages/api/v1/tasks/index.ts` now `console.error` the raw Supabase error and return a generic client-facing message (matches `src/pages/dashboard.astro`'s existing `console.error` logging convention); `npm run test`/`build` pass, `npm run lint` reports 2 new `no-console` warnings (non-blocking, exit 0).

### F4 — `last_done_date` string has no `.max()` bound

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/task-schema.ts:12-13, src/lib/task-schema.ts:32-33
- **Detail**: `last_done_date: z.string("Pick a last-done date")` has no `.max()` before `.transform(parseISO)`, violating the house rule ("every string/text field must have an explicit `.max()`" — `lessons.md`). This is copied forward from the pre-existing `addTaskSchema` rather than newly introduced by `createTaskJsonSchema`/`updateTaskJsonSchema`, and real-world risk is low since `parseISO` fails fast on garbage input — but it's now duplicated into a second schema.
- **Fix**: Add e.g. `.max(10, "Invalid date")` to the `last_done_date` string schema in both `addTaskSchema` and the new JSON schemas.
- **Decision**: FIXED — `.max(10, "Invalid date")` added to `last_done_date` in both `addTaskSchema` and `createTaskJsonSchema`; `npm run test` still green (83/83).

### F5 — Integration test titles don't use the "should ..." phrasing

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/v1/tasks/isolation.integration.test.ts:95, :103, :113, :121
- **Detail**: None of the four `it(...)` descriptions start with "should" (e.g. `"returns 404 when user A reads user B's task via GET /api/v1/tasks/:id"`), violating the recorded house rule ("Test titles must use the `it("should ...")` phrasing" — `lessons.md`, which explicitly applies to "any new ... Vitest `it(...)` block"). The sibling precedent file (`src/pages/api/tasks/isolation.integration.test.ts`) has the identical gap, so this is consistent with (flawed) precedent rather than a new deviation — but the rule was violated again rather than corrected.
- **Fix**: Rename the four `it(...)` descriptions to start with "should ...".
- **Decision**: FIXED — all four `it(...)` descriptions in `isolation.integration.test.ts` renamed to start with "should ...". (Note: the sibling precedent file `src/pages/api/tasks/isolation.integration.test.ts` still has the same gap — out of scope for this review, flagged separately if worth a follow-up.)
