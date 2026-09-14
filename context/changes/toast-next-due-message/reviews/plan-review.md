<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Toast Next-Due Message + Mark-Done Confirmation Guardrail

- **Plan**: `context/changes/toast-next-due-message/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-14
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 0 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | PASS    |
| Plan Completeness     | WARNING |

## Grounding

6/6 paths verified (`TaskList.tsx`, `Layout.astro`, `complete.ts`, `complete.test.ts`, `index.astro`,
`status.ts`), 5/5 symbols verified (`TaskStatus`, `MaintenanceTaskWithStatus.dueDate`, `computeStatus`,
`formatCompletionMessage`/`isFrequencyUnit`, `shouldConfirmCompletion` confirmed not yet defined),
brief↔plan consistent.

Deep verification (sub-agent): `npm run test` 143/143 passed across 18 files (matches plan's claim exactly),
`npm run lint` clean (4 pre-existing unrelated warnings), `npx tsc --noEmit` clean. Zero blast-radius
surprises — `TaskList.tsx` has exactly one importer (`src/pages/tasks/index.astro`), `status.ts`'s new
export is additive against its 4 existing importers. `DeleteTaskAlertDialog`/`EditTaskDialog` pattern
confirmed reusable for `ConfirmCompleteDialog.tsx` with existing primitives — `AlertDialogDescription`
accepts arbitrary JSX children, `date-fns` `format` already used the same way in sibling `.tsx` files.
`frequency_unit` is a strict Postgres enum and `frequency_value` a bounded integer — no URL-encoding risk
in the `complete.ts` redirect.

## Findings

### F1 — Phase 1's "committed to git" promise has no tracking criterion

- **Severity**: WARNING
- **Impact**: LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Desired End State; Phase 1 Success Criteria / Progress
- **Detail**: Current State Analysis notes the Phase 1 code (`format-completion-message.ts`, `complete.ts`,
  `TaskList.tsx`, `Layout.astro` + tests) is "not yet committed to git," and Desired End State promises it
  will be "committed, manually verified in a browser." Phase 1's Success Criteria only listed automated
  tests + 2 manual browser checks — no criterion tracked the actual `git commit`, so an implementer could
  finish manual verification and never commit, silently missing this end state.
- **Fix**: Add an explicit Manual Verification / Progress item for Phase 1 ("Phase 1 code changes committed
  to git") and reference it in the Implementation Note as a prerequisite before Phase 2.
- **Decision**: FIXED — added Manual Verification bullet + Progress item 1.6 to `plan.md`. Left Progress
  items 1.1–1.3 (automated checks) checked as-is rather than un-checking them, since those specific
  pass/fail claims (test/lint/typecheck) are independently true and were re-verified live during this
  review — only the commit-tracking gap itself needed a new item.
