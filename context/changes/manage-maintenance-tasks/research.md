---
date: 2026-09-03T19:49:50+00:00
researcher: Claude Sonnet 5
git_commit: d7edbc1abab1e502682433f3feecfe5620eee482
branch: feat/plan-S-02-manage-maintenance-tasks
repository: banan1988/10x-home-maintenance
topic: "Is external-research.md compatible with the codebase for S-02 (manage-maintenance-tasks)?"
tags: [research, codebase, S-02, react-hook-form, zod, react-day-picker, sonner, shadcn, react-compiler]
status: complete
last_updated: 2026-09-04
last_updated_by: Claude Sonnet 5
last_updated_note: "Recorded user decisions on all 4 open questions, plus the agreed execution sequence (shared prep branch, S-01 plan patch, then S-02 planning)."
---

# Research: Is `external-research.md` compatible with the codebase for S-02?

**Date**: 2026-09-03T19:49:50+00:00
**Researcher**: Claude Sonnet 5
**Git Commit**: d7edbc1abab1e502682433f3feecfe5620eee482
**Branch**: feat/plan-S-02-manage-maintenance-tasks
**Repository**: banan1988/10x-home-maintenance

## Research Question

Review the codebase and decide whether `context/changes/manage-maintenance-tasks/external-research.md` is
compatible with it, in order to implement **S-02** (`manage-maintenance-tasks`) from
`context/foundation/roadmap.md` — view, edit (incl. mark-complete via last-done-date), and delete maintenance
tasks (FR-005, FR-006, FR-007).

## Summary

`external-research.md`'s per-library React-19/Astro-6 compatibility claims are **all technically correct** —
nothing it recommends would break the build or fail at runtime. But **library selection is only half of
"compatible"**: three of its five "add now" recommendations conflict with decisions the sibling slice **S-01**
(`first-task-on-dashboard`, same entity, same form fields, currently status `planning`) has already made in its
own `plan.md`. Adopting the external doc as-is would give the `maintenance_tasks` feature two incompatible form
philosophies (hand-rolled `useState` for add, `react-hook-form` for edit) for the same entity, edited by the same
user, side by side.

| Recommendation      | External doc says                                          | S-01 already decided                                                                                                                              | Verdict for S-02                                                                                    |
| ------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Form library        | Add `react-hook-form` + `@hookform/resolvers`              | **Rejected** — `plan.md:57-58` explicitly lists it under "What We're NOT Doing"; chose hand-rolled `useState` + shared zod schema instead         | **Do not add.** Follow S-01's pattern for consistency — see Open Question 1.                        |
| Validation          | Add `zod`                                                  | Already adopted by S-01 (`src/lib/task-schema.ts`), and already a project-wide convention (`CLAUDE.md`: "API routes ... validate input with zod") | Compatible, but it's not a *new* addition for S-02 to introduce — reuse/extend the existing schema. |
| Date input          | Add `react-day-picker` v9                                  | **Not evaluated at all** — S-01 uses "plain labeled inputs" (`plan.md:298-299`), implying native `<input type="date">`, never explicitly decided  | Open — see Open Question 2.                                                                         |
| Delete confirmation | Add shadcn `alert-dialog` (`@radix-ui/react-alert-dialog`) | Not touched by S-01, but S-01 *does* add shadcn `Select` (`plan.md:297`)                                                                          | Compatible in isolation, but carries a real sequencing risk — see Compatibility Risk below.         |
| Toast feedback      | Add `sonner`                                               | **Not evaluated at all** — S-01's feedback mechanism is redirect + query-param + inline dialog error, no toast anywhere in the codebase           | Open — see Open Question 3.                                                                         |
| List/table          | shadcn `Table` (no dep)                                    | Consistent with S-01: dashboard renders its list inline with no extracted component                                                               | Compatible, and correctly recommended over `@tanstack/react-table`.                                 |

One of the external doc's own open questions is now resolved: **the React Compiler does not run at build time** —
it is wired in purely as an ESLint rule (`eslint.config.js`), with no `babel-plugin-react-compiler` installed and
no babel options passed to the `@astrojs/react()` integration. This removes the stated blocker for
`@tanstack/react-table` (moot anyway, since both docs agree to skip it for S-02).

## Detailed Findings

### 1. Per-library compatibility claims — verified correct

- **React Compiler is lint-only, not build-time.** `astro.config.mjs` registers `react()` with zero options — no
  `babel: { plugins: [...] }` — and no `babel-plugin-react-compiler`/`react-compiler-runtime` package exists
  anywhere in `package.json`, `package-lock.json`, or `node_modules` (confirmed via full-tree grep). The only
  wiring is `eslint.config.js:7,52,58` (`import reactCompiler from "eslint-plugin-react-compiler"` and
  `"react-compiler/react-compiler": "error"`). This is a static-analysis rule, not a memoization transform.
  Resolves the external doc's own "Open questions carried into planning" item.
- **None of the five recommended libraries are currently installed.** `package.json` (dependencies +
  devDependencies) has zero entries for `react-hook-form`, `@hookform/resolvers`, `react-day-picker`, `sonner`, or
  `@radix-ui/react-alert-dialog`. `zod` exists only as a *transitive* dependency of Astro/`@astrojs/sitemap`
  (`package-lock.json:230,4343`), not as an app-level dependency — so it would need to be added as a direct
  dependency regardless of which slice does it first.
- **Only `src/components/ui/button.tsx` exists in `src/components/ui/`.** Everything else the external doc
  assumes as a base (`Table`, `Dialog`, `AlertDialog`, `Select`, `Sonner`) would need `npx shadcn add <name>`.
  `components.json` confirms `style: "new-york"`, `cssVariables: true`, `iconLibrary: "lucide"` — matching what
  the external doc assumed.
- **The `@radix-ui/react-select` type-collision risk the external doc flagged (shadcn-ui/ui#8300) is not
  hypothetical for S-02** — see Compatibility Risk below.

### 2. S-01 already decided the form-library question, and decided against react-hook-form

`context/changes/first-task-on-dashboard/plan.md:57-58` ("What We're NOT Doing"):

> `react-hook-form`, `@hookform/resolvers`, or any component-testing library ... — not needed given the chosen
> hand-rolled + zod approach and Vitest-only unit test scope.

Instead, S-01 built a **shared zod schema** at `src/lib/task-schema.ts` (`addTaskSchema`, field names matching
`MaintenanceTaskInsert` exactly, enums sourced from `Constants.public.Enums`), used both client-side
(`safeParse` on submit, manual `preventDefault()` + per-field error state mirroring
`src/components/auth/SignUpForm.tsx`'s existing `validate()` pattern) and server-side (authoritative check in the
API route). Submission is a native `<form method="POST">` full-page flow, not a client-side fetch/mutation hook —
there is no `useMutation`-style hook anywhere in the codebase to reuse either.

This is the same hand-rolled-`useState`-plus-zod convention already established by `src/components/auth/*` for
the sign-up/sign-in forms — S-01 extended an existing pattern rather than introducing a new one. `react-hook-form`
would be the first form library in the codebase, introduced for the edit flow only, while the add flow (same
entity, same fields, built moments earlier or later depending on scheduling) uses hand-rolled state. That
inconsistency — not React-19 compatibility — is the actual reason to reject this part of the external doc's
recommendation for S-02.

`src/lib/task-schema.ts`'s `addTaskSchema` is directly reusable/extendable for S-02's edit form (e.g. a
`.partial()` variant, or a sibling `editTaskSchema`) rather than duplicating validation logic.

### 3. Date-fns is already decided — for arithmetic, not for a UI date picker

A separate, already-completed research pass in `first-task-on-dashboard/research.md` and
`first-task-on-dashboard/date-fns-api-docs.md` selected **date-fns v4** for due-date arithmetic
(`parseISO`, `addDays/addWeeks/addMonths/addYears`, `differenceInCalendarDays`, `compareAsc`, `format`),
confirmed Cloudflare-Workers-runtime compatible. This is unrelated to, and does not require, a date-*picker* UI
component — `react-day-picker` v9 (external doc's recommendation) addresses a different concern entirely (a
calendar-popup input widget), which S-01 never evaluated.

**Load-bearing detail for S-02**: the shipped `MaintenanceFrequencyUnit` enum values are **singular**
(`"day" | "week" | "month" | "year"` — confirmed `src/types.ts:9`, `supabase/migrations/20260827194321_create_maintenance_tasks.sql`),
not plural. S-01's research caught and fixed a bug where a draft implementation used plural literals
(`"days"|"weeks"...`), which would silently return `undefined` at runtime for every task (TS didn't catch it —
`tsconfig.json` extends `strict`, not `strictest`). **S-02's edit form must use singular literals for the same
field** — this is the exact enum the edit form will render as a `<Select>` and must round-trip correctly.

### 4. Toast feedback (sonner) has no established precedent either way

No toast/notification library is used anywhere in the codebase today. S-01's mutation-feedback mechanism is
redirect + query-param + inline dialog error (mirroring `signin.astro`/`signup.astro`'s existing `serverError`
prop pattern) — not a toast. `sonner`'s React-19 compatibility claim in the external doc is correct
(`react: ^18.0.0 || ^19.0.0`), but adopting it for S-02 would introduce the first toast library in the codebase
for a feature (edit/delete) that could equally reuse the redirect+query-param pattern already proven by S-01.
This is a genuine open design choice, not a compatibility question — see Open Question 3.

### 5. Schema, types, and API surface — all still to be built

- `supabase/migrations/20260827194321_create_maintenance_tasks.sql` defines `maintenance_tasks` (id, user_id,
  name, category, importance, frequency_value, frequency_unit, last_done_date, created_at, updated_at) with
  per-operation RLS policies scoped to `auth.uid() = user_id`, granted to `authenticated` only. No `status` or
  `next_due_date` column exists — both are derived at read time (FR-008/FR-009), not stored.
- `src/types.ts` currently only re-exports Supabase-generated `MaintenanceTask`/`Insert`/`Update` row types and
  the three enums — no DTOs, no command types, no Zod schemas defined there yet (those live in S-01's new
  `src/lib/task-schema.ts`, not yet merged).
- **No API routes or service layer exist yet** for maintenance tasks (`src/pages/api/` currently has only
  `auth/{signin,signup,signout}.ts`; no `src/lib/services/` directory exists at all). S-01's plan adds
  `src/pages/api/tasks/index.ts` (`POST`); S-02 will need to add `PATCH`/`DELETE` to the same resource
  (e.g. `src/pages/api/tasks/[id].ts`), following the same self-checked-auth pattern (routes are not covered by
  `middleware.ts`'s `PROTECTED_ROUTES`, so each route must check `context.locals.user` itself).
- `src/middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard"]` only. S-02's list/manage page (e.g. `/tasks`) is
  **not currently protected** and must be added to this array; it is not covered by a `/dashboard` prefix match.
- **Adjacent bug, not in scope for S-02 to fix but worth carrying forward**: none of the existing auth API routes
  export `const prerender = false` despite `CLAUDE.md` mandating it for API routes; S-01 explicitly chose not to
  retrofit this. S-02's new routes should still apply `prerender = false` correctly even though the existing
  routes don't demonstrate the pattern correctly.
- **No reusable task-card/list component exists.** `src/pages/dashboard.astro` renders its task list inline in
  the `.astro` frontmatter/markup with no extracted component — S-02's list view (FR-006) will need its own
  rendering, not an import, and this is a duplication risk worth flagging to the planner (two independently
  hand-rolled task-row renderings for the same entity).

## Code References

- `astro.config.mjs:12` — bare `react()` integration, no babel/compiler options
- `eslint.config.js:7,52,58` — `react-compiler/react-compiler: "error"` is a lint rule only
- `package.json:18-38` — no react-hook-form/zod/react-day-picker/sonner/@radix-ui/react-alert-dialog in dependencies
- `components.json` — `style: "new-york"`, `cssVariables: true`, `iconLibrary: "lucide"`
- `src/components/ui/button.tsx` — the only shadcn component currently installed
- `src/components/auth/SignUpForm.tsx:15-55` — established hand-rolled `useState` + manual `validate()` form convention
- `src/components/auth/FormField.tsx:22-68` — generic controlled `<input>` wrapper, not RHF's `register`/`Controller`
- `src/lib/supabase.ts`, `src/middleware.ts:4,18` — auth/session plumbing; `PROTECTED_ROUTES` only covers `/dashboard`
- `src/types.ts:1-9` — current `MaintenanceTask`/enum re-exports, no Zod schemas yet
- `supabase/migrations/20260827194321_create_maintenance_tasks.sql` — full schema + RLS for `maintenance_tasks`
- `context/foundation/prd.md:97-106` — exact FR-005/FR-006/FR-007 text
- `context/changes/first-task-on-dashboard/plan.md:57-58,122-149,196-219,277-299` — form-library rejection, shared status/type/schema/API decisions
- `context/changes/first-task-on-dashboard/research.md:34-91,150-156,215-243` — date-fns findings, singular-enum bug fix, prerender gap
- `context/changes/first-task-on-dashboard/date-fns-api-docs.md:7-76` — date-fns v4 function reference and gotchas

## Architecture Insights

- The codebase's established convention for forms is **hand-rolled `useState` + manual validation**, now
  reinforced by a **shared zod schema used both client- and server-side** (`src/lib/task-schema.ts`, from S-01) —
  not a form library. This satisfies the project's `CLAUDE.md` mandate ("API routes ... validate input with
  zod") without needing `react-hook-form` at all: zod alone covers both the mandated server-side validation and
  the client-side UX, via `safeParse`.
- Mutation feedback across the codebase is **redirect + query-param + inline error prop**, not toast — matching
  Astro SSR's server-rendered-by-default architecture (`output: "server"`) rather than a client-heavy SPA pattern.
- shadcn components are added lazily, one at a time, exactly when a slice needs them — there is no "install the
  full kit upfront" precedent. S-01 already plans to add `Dialog` and `Select`; S-02 would be the first slice to
  add `Table` and (if the edit/delete flow needs it) `AlertDialog`.

## Historical Context (from prior changes)

- `context/changes/first-task-on-dashboard/change.md`, `research.md`, `plan.md`, `date-fns-api-docs.md`,
  `reviews/plan-review.md` — S-01 is the sibling slice for the *same* `maintenance_tasks` entity and is the
  single most relevant prior-decision source for S-02; see Detailed Findings §2-3 above.
- `context/foundation/lessons.md` — no entries about form libraries or date-fns; the two existing entries
  (feature-flag kill dates, Postgres `search_path` hardening) are unrelated to this research question.

## Related Research

- `context/changes/manage-maintenance-tasks/external-research.md` — the document under review
- `context/changes/first-task-on-dashboard/external-research.md` — S-01's own external research (date-fns
  comparison), a useful model for how external research got reconciled with an implementation plan there

## Open Questions

1. **Form library for the edit flow**: follow S-01's hand-rolled `useState` + shared zod schema convention (no
   new dependency, consistent UX/code style across add and edit), or introduce `react-hook-form` for S-02 only
   as the external doc recommends (less boilerplate for a second, more complex form, but a second form
   philosophy for the same entity)? **Recommendation for `/10x-plan`**: follow S-01's convention unless the edit
   form's complexity (e.g. inline mark-complete vs. full edit) clearly outgrows hand-rolled state — consistency
   with a sibling slice editing the same entity outweighs the marginal boilerplate savings.
1. **Date input for `last_done_date` in the edit form**: plain `<input type="date">` (native, zero dependencies,
   consistent with S-01's "plain labeled inputs" even though S-01 never explicitly named the input type) vs.
   `react-day-picker` v9 (nicer UX, but a new dependency with no precedent, and S-01's add form would remain on
   native input unless retrofitted). Whichever way S-02 decides, flag it back to S-01's plan if a native
   `<input type="date">` there wasn't yet explicit, so both forms stay visually consistent.
1. **Mutation feedback for edit/delete**: reuse the redirect+query-param+inline-error pattern (zero new
   dependencies, consistent with the whole auth flow and S-01), or introduce `sonner` for S-02 (nicer for
   delete-confirmation feedback specifically, since a full-page redirect after delete already navigates the user
   away from the list — a toast could confirm success without needing a return-trip query param). This is
   the one place a case for the external doc's recommendation is strongest, since delete doesn't have an
   existing "reopen the form with an error" pattern to reuse the way add/edit do.
1. **`AlertDialog` + `Select` sequencing risk**: `shadcn-ui/ui#8300` describes a type collision between
   `@radix-ui/react-alert-dialog` and `@radix-ui/react-select`. S-01's plan already adds `Select`
   (`plan.md:297`), and S-02 will need `AlertDialog` for delete confirmation (FR-007). Since S-01 and S-02 are
   explicitly parallel (`roadmap.md` Stream B/A), whichever slice's dependency additions land second should
   verify the shadcn CLI's generated component code against that issue before merging — confirm at
   implementation time, not as a blocker to planning.

## Follow-up Research 2026-09-04

User reviewed the four open questions above and made the following decisions. All four are now resolved; the
items above are kept verbatim as the historical record of the trade-offs considered.

### Decisions

1. **Form library (Open Question 1) — CONFIRMED as recommended.** Edit flow follows S-01's hand-rolled `useState`

   - shared zod schema convention. No `react-hook-form`. No further action needed on this question.

1. **Date input (Open Question 2) — `react-day-picker` v9 adopted in BOTH S-01 and S-02.** Rationale given by the
   user: consistent UX across add/edit outweighs the (real, and explicitly named as such — this is not "less
   code," it's a UX-consistency trade against a small added dependency) cost of introducing a new dependency.
   Each slice wires its own instance independently (no shared `<DateField>` abstraction attempted now) — this
   preserves the parallel-work property the roadmap explicitly relies on for Streams A/B, since the only shared
   artifact is the already-installed shadcn primitives (see Decision 4), not a shared component file.

1. **Mutation feedback (Open Question 3) — `sonner` adopted for ALL mutations (add, edit, delete) in BOTH
   S-01 and S-02.** The user chose full consistency over the narrower "delete-only" option. Concretely: the
   existing native `<form method="POST">` + full-page-redirect architecture is **not** replaced by client-side
   fetch/mutation hooks (out of scope, avoids an architecture rewrite under deadline pressure) — instead, the
   destination page reads a success/error query-param (as it already does for `serverError`) and fires
   `toast.success(...)` / `toast.error(...)` on mount. Field-level validation errors continue to reopen the
   add/edit dialog inline (unchanged) — toast is reserved for mutation *outcome* confirmation, not per-field
   validation feedback.

1. **`AlertDialog` + `Select` collision risk (Open Question 4) — mitigated via a shared upfront prep step**,
   done once, before either slice's plan is touched, rather than left to "whichever lands second":
   `npx shadcn add select alert-dialog calendar popover sonner` in one shot, plus mounting `<Toaster />` in
   `src/layouts/Layout.astro`, verified with `npm run build && npm run lint && npm run test`. This is treated as
   infrastructure (analogous to F-01, but far smaller) — logged in `context/foundation/lessons.md`, not folded
   into either slice's FR scope, so both plans stay minimal and can still be planned/implemented independently.

### Agreed execution sequence

1. This research.md update (current step, branch `feat/plan-S-02-manage-maintenance-tasks`).
1. New branch off `main` (`chore/shared-ui-primitives`): the Decision 4 prep step. Merge to `main`.
1. New branch off updated `main` (patch to `first-task-on-dashboard`): amend `plan.md` with the Decision 2/3
   deltas (react-day-picker for `last_done_date`, sonner for mutation feedback), re-run a delta `/10x-plan-review`.
   Merge to `main`.
1. Rebase `feat/plan-S-02-manage-maintenance-tasks` onto updated `main`, then run `/10x-plan manage-maintenance-tasks`
   — S-02's plan inherits all four decisions with zero remaining open questions on library choice.

No pushes to any remote occur without separate confirmation at each step.
