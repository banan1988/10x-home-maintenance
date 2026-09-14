<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Status/Date Regression Grid Implementation Plan

- **Plan**: `context/changes/status-date-regression-grid/plan.md`
- **Scope**: Full plan (Phases 1–4 of 4, all complete)
- **Date**: 2026-09-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 1 observation

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

### F1 — `frequency_value` upper bound is app-layer only; DB and JSON read path stay unguarded

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `supabase/migrations/20260827194321_create_maintenance_tasks.sql:27`; `src/pages/api/v1/tasks/[id].ts` (GET handler)
- **Detail**: The Phase 3 deviation added `.max(1000, ...)` to `frequency_value` in `addTaskSchema` and `createTaskJsonSchema` (`updateTaskJsonSchema` inherits it correctly via `.partial()`), which closes the crash for the app's own form/JSON write paths. But the DB `CHECK` constraint is still only `frequency_value > 0` — no upper bound was added at the data layer — and the `GET /api/v1/tasks/[id]` read path calls `toTaskDto(task)` directly on DB data with no re-validation. Any row written outside the two zod-guarded routes (direct SQL, an admin tool, a future route, or a pre-existing row from before this fix in a real deployment) can still carry an unbounded `frequency_value` and crash the unguarded `format()` calls in `TaskList.tsx:70` / `task-dto.ts:11` on read. The plan's own stated reasoning for choosing a schema fix over patching call sites — "stops the invalid value from ever being persisted, fixing the root cause" — is only true for the paths it actually guards.
- **Fix A ⭐ Recommended**: Add a follow-up migration adding `CHECK (frequency_value <= 1000)` to `maintenance_tasks`, matching the app-layer bound.
  - Strength: Closes the crash risk at the data layer too, consistent with this repo's own established pattern (`lessons.md`'s "numeric fields need `.max()` too") and the plan's stated preference for root-cause fixes.
  - Tradeoff: One more migration file; if any existing row already exceeds 1000 (unverified), the constraint would fail to apply until those rows are corrected.
  - Confidence: MED — the pattern fits this repo's conventions, but I haven't queried the DB for pre-existing values that might violate a stricter check.
  - Blind spot: No audit of current data or of every write path (seed scripts, service-role/RLS-bypassing code) for whether an unguarded one exists today.
- **Fix B**: Document the DB/read-path gap as an accepted residual risk (e.g. in `lessons.md` or the plan's Open Risks) without changing the migration now.
  - Strength: No risk of a failing migration against existing data; keeps this phase's scope narrow — it was about test coverage, not schema hardening beyond the one fix already made.
  - Tradeoff: The crash risk isn't eliminated, only mitigated for the most common path.
  - Confidence: MED — reasonable if no route bypasses the two guarded schemas today, but that hasn't been independently confirmed.
  - Blind spot: Same as above — no full write-path audit performed.
- **Decision**: FIXED via Fix A — added `supabase/migrations/20260914200000_cap_maintenance_tasks_frequency_value.sql` (`CHECK (frequency_value <= 1000)`); applied to the local dev DB (verified 0 pre-existing rows would have violated it).

### F2 — `test-plan.md` §3 rollout table not synced for the completed phase

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `context/foundation/test-plan.md:88`
- **Detail**: The §3 Phased Rollout table still lists phase 3 ("Status/date logic regression grid") as `Status: not started`, `Change folder: —`, even though `status-date-regression-grid`'s `change.md` reads `status: implemented` and all 4 of its phases are checked off. `test-plan.md:69-70` documents this table's own convention: "Status moves left to right ... the orchestrator updates Status as artifacts appear on disk" — a convention this close-out didn't follow. Phase 4's "Changes Required" only listed filling in §6.5, never syncing §3's table — a gap in the plan's own contract, not just a slip in following it (same shape as the existing lessons.md entry on `roadmap.md` sync, but for `test-plan.md`).
- **Fix**: Update `test-plan.md:88` to `Status: complete`, `Change folder: status-date-regression-grid`.
- **Decision**: FIXED — `test-plan.md:88` updated.

### F3 — Stale line-number citation in the new §6.5 cookbook text

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `context/foundation/test-plan.md:194`
- **Detail**: §6.5 cites `src/lib/task-schema.test.ts:83-108` as the reference TZ-forcing block. The Phase 3 `.max(1000)` boundary tests added earlier in that same file (`task-schema.test.ts:40-50`) shifted the actual `describe("addTaskSchema last_done_date timezone handling", ...)` block down to lines 95-121. A future contributor following the citation lands mid-test-body, not at the referenced pattern.
- **Fix**: Update the citation in `test-plan.md:194` to `src/lib/task-schema.test.ts:95-121`.
- **Decision**: FIXED — citation updated.

### F4 — Progress notes miscount the Phase 2 assertion total

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `context/changes/status-date-regression-grid/plan.md:373-377`
- **Detail**: Progress notes for Phase 2 claim "All 29 `status.test.ts` assertions (16 grid rows + 1 leap-year-clamp row) passed on first run." The actual count is 17 test cases (16 grid rows + 1 leap-year row) with 34 `expect()` calls (2 per row), out of 32 tests total in the file. Neither the test count nor the assertion count is 29 — the qualitative claim (grid passed first run, no code fix needed) is independently verified as accurate; only the number is wrong.
- **Fix**: Correct "29" to the accurate figure (17 test cases / 34 assertions) in the Progress note.
- **Decision**: FIXED — `plan.md:373-377` corrected.
