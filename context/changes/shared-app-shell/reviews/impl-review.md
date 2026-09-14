<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Shared App Shell (Header, Nav, Footer) Implementation Plan

- **Plan**: context/changes/shared-app-shell/plan.md
- **Scope**: Phase 1 and Phase 2 (full plan — both fully `[x]`)
- **Date**: 2026-09-14
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | PASS    |
| Safety & Quality    | PASS    |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

## Findings

### F1 — roadmap.md S-05 status never synced at epilogue

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/roadmap.md:70,222
- **Detail**: `change.md` is `implemented` and every Phase 1/2 Progress checkbox is `[x]`, but `roadmap.md` still
  shows S-05 as `in-progress` in both the At-a-glance table (line 70) and the S-05 detail section's `Status`
  field (line 222). The epilogue commit (`0e9dcb3`) touched only `plan.md` and `change.md` — it never touched
  `roadmap.md`. The only commit that touched `roadmap.md` for this change was the phase-1-start commit
  (`2937552`), which correctly set it to `in-progress` at the time but was never followed up. This is exactly
  the failure mode the existing lesson "Closing out a plan must also update roadmap.md" describes, and matters
  concretely here because S-04's roadmap entry explicitly waits on S-05 (`Prerequisites: S-05`) — a stale
  `in-progress` status risks S-04 not being recognized as unblocked.
- **Fix**: Update `roadmap.md` line 70's Status column and line 222's `- **Status:**` field from `in-progress` to
  `done`, matching the convention already used for F-01/S-01/S-02/S-03.
- **Decision**: FIXED — both spots updated to `done`.

### F2 — `npx astro check` fails, but both phases' Progress checklists mark it `[x]`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: src/pages/api/v1/tasks/index.ts, src/pages/api/v1/tasks/[id].ts
- **Detail**: Running `npx astro check` on the current branch head (`0e9dcb3`) produces 9 real type errors, all in
  `src/pages/api/v1/tasks/index.ts` and `[id].ts` (possibly-null `supabase` client, `context.params.id` possibly
  `undefined`, an `update` payload type mismatch). These files are entirely untouched by shared-app-shell and the
  errors were confirmed present already at the Phase 1 completion commit (`1a6eb56`) by checking out that commit
  directly and re-running `astro check` — they're inherited from the already-closed `maintenance-tasks-api`
  change, not introduced here. However, both Phase 1 (`1.2`) and Phase 2 (`2.2`) Progress rows in `plan.md` mark
  "Type checking passes: `npx astro check`" as `[x]`, which is not actually true right now. Note `astro check`
  is not part of `.github/workflows/ci.yml` (only lint/test/build run there), so this hasn't been gating merges,
  but the plan's own record is inaccurate.
- **Fix A ⭐ Recommended**: Correct the Phase 1/2 `1.2`/`2.2` Progress rows to note the pre-existing, unrelated
  failure (rather than leaving a false `[x]`), and don't touch the unrelated API files under this change.
  - Strength: Keeps scope discipline intact — these files belong to `maintenance-tasks-api`, already reviewed
    and closed; fixing them here would be an unplanned, unrelated edit.
  - Tradeoff: The type-check gate stays red until a separate follow-up fixes `maintenance-tasks-api`'s API
    route typing.
  - Confidence: HIGH — verified via direct checkout of `1a6eb56` that the identical 9 errors predate this
    change's first commit.
  - Blind spot: Haven't checked whether these errors are already tracked as a known issue elsewhere.
- **Fix B**: Fix the 9 type errors in `src/pages/api/v1/tasks/index.ts` and `[id].ts` now (null-guard the
  Supabase client, guard `context.params.id`, correct the `update` payload type).
  - Strength: Gets the repo to a genuinely green `astro check` immediately.
  - Tradeoff: Expands this change's scope into files unrelated to the app-shell/UI work, which this same review
    found to otherwise have zero scope creep — introducing scope creep to fix an unrelated gate is not this
    change's job.
  - Confidence: MEDIUM — the fixes look mechanical but haven't been fully scoped.
  - Blind spot: Haven't verified fixing these won't need to touch `maintenance-tasks-api`'s own tests/behavior.
- **Decision**: FIXED via Fix A — `plan.md` rows 1.2/2.2 changed to `[ ]` with a note pointing to this finding;
  unrelated API files left untouched.

### F3 — `Header.astro` uses `class:list`, not the documented `cn()` helper

- **Severity**: 📝 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/layout/Header.astro:18-21,28-31
- **Detail**: CLAUDE.md documents `cn()` (from `@/lib/utils`) as the required helper for conditional/merged
  Tailwind class names. `Header.astro`'s active/inactive nav-link classes use Astro's native `class:list`
  directive instead. This is not a regression introduced by this change — `class:list` is already the
  established (if undocumented) convention for every `.astro` file in the repo (e.g. `Banner.astro:11`); `cn()`
  has zero usages inside any `.astro` file repo-wide. Filed as an observation, not a warning, since Header.astro
  is consistent with existing `.astro` practice.
- **Fix**: No action needed for this change. If desired, file a separate follow-up to either carve out an
  exception for `class:list` in CLAUDE.md's `.astro`-file guidance, or migrate `.astro` files to `cn()` for
  consistency with `.tsx` components.
- **Decision**: FIXED — CLAUDE.md's Tailwind class-merging convention now scopes `cn()` to `.tsx` components and
  documents `class:list` as the established `.astro` convention.
