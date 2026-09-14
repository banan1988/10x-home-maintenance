<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Status/Date Regression Grid Implementation Plan

- **Plan**: `context/changes/status-date-regression-grid/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-14
- **Verdict**: REVISE (all findings fixed during triage — see Decisions below)
- **Findings**: 1 critical, 1 warning, 2 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | WARNING |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | PASS    |
| Plan Completeness     | FAIL    |

## Grounding

Grounding: 10/10 paths ✓, 4/4 symbols ✓, brief↔plan ✓

Paths verified: `src/lib/status.ts`, `src/lib/status.test.ts`, `src/lib/task-dto.ts`, `src/lib/task-dto.test.ts`,
`src/pages/tasks/index.astro`, `src/pages/dashboard.astro`, `src/lib/task-schema.ts`,
`src/lib/task-schema.test.ts`, `context/foundation/prd.md:110-119`, `context/foundation/test-plan.md:88`.
Symbols verified: `computeDueDate`, `computeStatus`, `parseISO` import at `dashboard.astro:1,24`,
`DUE_SOON_THRESHOLD_DAYS`. No `docs/reference/contract-surfaces.md` in this repo — surface check skipped.

## Findings

### F1 — Phase-body Success Criteria use checkboxes, not plain bullets

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: All four phases — Success Criteria sections
- **Detail**: All 16 Success Criteria bullets across Phases 1-4 used `- [ ] ...` checkboxes in the phase body,
  but the template contract reserves `- [ ]`/`- [x]` exclusively for the canonical `## Progress` section at
  the bottom.
- **Fix**: Strip the `[ ]` prefix from every Success Criteria bullet in the four phase bodies, leaving plain
  `-` bullets. The `## Progress` section's numbered checkboxes (1.1-4.3) already hold the checkbox state.
- **Decision**: FIXED

### F2 — Phase 3 omits the lint criterion Phases 1 and 2 both include

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Automated Verification
- **Detail**: Phase 3 edits `status.test.ts`, the same lint-covered file Phases 1 and 2 touch, but its
  Automated Verification list was missing `npm run lint`.
- **Fix**: Added `npm run lint` to Phase 3's Automated Verification list (and Progress 3.3, renumbering the
  prior 3.3 manual item to 3.4).
- **Decision**: FIXED

### F3 — Desired End State overstates the parsing fix's test coverage

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Detail**: The bullet read as if the TZ-forced test in `task-dto.test.ts` verifies both `task-dto.ts` and
  `tasks/index.astro`. It only automated-verifies `task-dto.ts`; the `.astro` fix is manual-only (already
  disclosed elsewhere in the plan and brief).
- **Fix**: Reworded the bullet to state `task-dto.ts`'s call site gets automated regression coverage, while
  `tasks/index.astro`'s identical fix is verified manually only (no `.astro` unit-test tier exists).
- **Decision**: FIXED

### F4 — Phase 4 references the S-07 note without saying where it lives

- **Severity**: 👁️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 — Overview / Manual Verification 4.3
- **Detail**: Success criterion 4.3 ("S-07 open-risk note reviewed for clarity") had no corresponding
  "Changes Required" item — the note it refers to exists only in `plan-brief.md`, not `plan.md`.
- **Fix**: Added a one-line pointer in Phase 4's Overview noting the S-07 note already exists in
  `plan-brief.md`'s Open Risks & Assumptions section — this phase reviews it, does not author it.
- **Decision**: FIXED
