<!-- PLAN-REVIEW-REPORT -->

# Plan Review: User adds a maintenance task and sees it correctly prioritized on the dashboard (S-01)

- **Plan**: `context/changes/first-task-on-dashboard/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-03
- **Verdict**: REVISE → SOUND (all findings fixed in triage)
- **Findings**: 1 critical, 2 warnings, 0 observations — all FIXED

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | FAIL    |

## Grounding

8/8 existing paths ✓, 4/4 new paths correctly absent ✓, 4/4 new symbols collision-free ✓, brief↔plan ✓
(dependency gap surfaced separately — see F1). `context.locals.user.id` confirmed non-optional
(`src/env.d.ts:3`, `@supabase/supabase-js` `User` type). No `docs/reference/contract-surfaces.md` in this
repo — that check was skipped.

## Findings

### F1 — date-fns and zod are never installed as direct dependencies

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 (`src/lib/status.ts`) and Phase 2 (`src/lib/task-schema.ts`)
- **Detail**: Confirmed against `package.json` and `node_modules`: `date-fns` is absent entirely (not in
  `package.json`, not in `node_modules`). `zod` is absent from `package.json` but happens to be physically
  present in `node_modules` v4.4.3 as a *transitive* dependency of something else (per `package-lock.json`) —
  importing it today would work by accident, but a future lockfile change could remove it silently. Neither
  Phase 1 nor Phase 2's "Changes Required" lists an install step. As written, `npm run test` on Phase 1 fails
  immediately with "Cannot find package 'date-fns'".
- **Fix**: Add an explicit install step to each phase's Changes Required: Phase 1 — `npm install date-fns`;
  Phase 2 — `npm install zod` (pin it as a direct dependency even though it's currently reachable transitively).
- **Decision**: FIXED — added "Install dependency" as item 1 in Phase 1 and Phase 2's Changes Required

### F2 — POST /api/tasks' auth-gate has no automated test

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 2 — API route
- **Detail**: The plan's own Critical Implementation Details section flags this route's self-checked auth as
  the phase's biggest risk (middleware's `PROTECTED_ROUTES` doesn't cover `/api/*`), yet Phase 2's Success
  Criteria cover it only with manual REST-client checks (2.5–2.6), not an automated test. A later refactor
  could silently drop the null-user check with nothing to catch it.
- **Fix A ⭐ Recommended**: Add a Vitest test for the route handler
  - Strength: Directly exercises the exact property the plan calls out as highest-risk; establishes a reusable
    pattern for testing Astro API routes (none exists yet).
  - Tradeoff: Requires hand-building a minimal mock `APIContext` (locals.user, request.formData(), a stubbed
    Supabase client) — no existing precedent in this repo to copy.
  - Confidence: MED — the mocking approach is standard for Astro but unverified against this repo's exact
    Supabase client shape.
  - Blind spot: Haven't confirmed how much boilerplate a minimal `APIContext` mock actually needs.
- **Fix B**: Keep manual-only coverage
  - Strength: Matches the existing precedent — `signin.ts`/`signup.ts`/`signout.ts` have zero automated tests
    today either.
  - Tradeoff: The one route in the repo explicitly flagged as carrying an auth-bypass risk stays
    regression-prone.
  - Confidence: HIGH — this is simply "do nothing," so it's guaranteed consistent with current repo state.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix A — added `src/pages/api/tasks/index.test.ts` as Phase 2 Changes Required item 4,
  with a matching Automated Verification bullet and Progress item 2.2

### F3 — The "fails to compile" exhaustiveness claim isn't actually enforced

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 Contract / Critical Implementation Details
- **Detail**: The plan says to add "a `default`-less exhaustive switch (or a `satisfies never` fallthrough
  guard) ... so a future enum addition fails to compile." Verified: `eslint.config.js` extends
  `strictTypeChecked`, which does NOT include `@typescript-eslint/switch-exhaustiveness-check`, and no explicit
  rule adds it. Combined with `noImplicitReturns` already confirmed off, a plain default-less switch catches
  nothing — neither TS nor ESLint will flag a future 5th enum value falling through to `undefined`, which is
  exactly the bug class this guard exists to prevent. Only the second, vaguer alternative ("satisfies never
  guard") actually works, and only if written as an explicit `default` branch assigning the narrowed value to a
  `never`-typed variable.
- **Fix**: Rewrite the Phase 1 Contract to specify the concrete pattern — a `default` case doing
  `const _exhaustive: never = frequencyUnit; throw new Error(...)` (or equivalent) — and drop "default-less" as
  an option, since this repo's config gives it no enforcement.
- **Decision**: FIXED — Phase 1 Contract now specifies the explicit `never`-assertion `default` branch and
  drops "default-less" as an option

## Follow-up Review 2026-09-04 — delta patch (date-picker + toast)

Scope: only the delta applied after this original review — `react-day-picker` adopted for `last_done_date`,
`sonner` toast-on-success via a new `?success=` query param, and updated dependency-install notes reflecting the
shared `chore(m2l4): install shared shadcn primitives for S-01/S-02` prep commit (see
`context/changes/manage-maintenance-tasks/research.md`, "Follow-up Research 2026-09-04"). The rest of the plan
(Phases 1–2, F1–F3 above) is unchanged and not re-reviewed here.

- **Verdict**: SOUND (delta only, all findings fixed in triage)
- **Findings**: 0 critical, 1 warning, 0 observations — all FIXED

### Verdicts (delta only)

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | WARNING |
| Architectural Fitness | PASS    |
| Blind Spots           | PASS    |
| Plan Completeness     | PASS    |

### Grounding

5/5 paths ✓ (`src/components/ui/{calendar,popover,sonner}.tsx`, `src/layouts/Layout.astro`'s
`<Toaster client:load/>` mount, `package.json`'s `react-day-picker`/`date-fns`/`sonner` entries), brief↔plan ✓
(`plan-brief.md` is silent on date-picker/toast, so the delta doesn't contradict it).

### F4 — New React island for a one-shot toast is heavier than needed

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Lean Execution
- **Location**: Phase 3, Item 1 (Dashboard page) + Critical Implementation Details (toast paragraph)
- **Detail**: The delta introduces a new hydrated React component, `TaskAddedToast.tsx` (`client:load`), whose
  only job is to call `sonner`'s `toast.success(...)` once on mount when a `success` query param is present.
  `sonner`'s `toast` is an imperative function, not a React hook — it writes to an external store that
  `<Toaster/>` (already globally mounted in `Layout.astro`) subscribes to. It does not need a React component or
  a hydration boundary to be called. Separately, the plan's own Manual Verification claims the toast "does not
  reappear on a plain page refresh once the `?success=` param is gone from the URL" — but no Contract text
  specifies *how* the param gets removed from the URL. As written, a refresh would re-send the same
  `?success=task-added` query string and the toast would refire every time, contradicting the plan's own stated
  behavior.
- **Fix**: Drop `TaskAddedToast.tsx`. In `dashboard.astro`, add a small inline `<script>` (module script,
  consistent with Astro's islands-only-when-needed philosophy — no other page in this repo hydrates a whole
  component for a side effect this small) that reads `new URLSearchParams(location.search)`, calls
  `toast.success("Task added")` from `"sonner"` when `success` is present, and immediately calls
  `history.replaceState(null, "", location.pathname)` to strip the param so a refresh doesn't refire it. This
  removes a file, a hydration boundary, and the server→client `success` prop-threading step, while actually
  satisfying (rather than just asserting) the "not on refresh" claim.
  - Strength: Fewer moving parts (no new component, no prop threading, no extra `client:load` bundle) and it's
    the only version that actually implements the "not on refresh" behavior the plan already promises in Manual
    Verification 3.8.
  - Tradeoff: A raw `<script>` block is slightly less unit-testable in isolation than a component would be — but
    no unit test was planned for the toast behavior either way (it's manual-only, per Testing Strategy), so this
    costs nothing here.
  - Confidence: HIGH — `sonner`'s imperative `toast()` API and the existing `<Toaster client:load/>` mount in
    `Layout.astro` (verified present) are exactly what this pattern relies on; no other React state is needed.
  - Blind spot: Not verified whether `sonner` buffers `toast()` calls made before `<Toaster/>`'s own
    `client:load` hydration completes (a race if the inline script runs first). This is a common, documented
    pattern in sonner/react-hot-toast-style libraries (calls write to an external store the Toaster subscribes to
    whenever it mounts), so the risk is low, but worth a quick manual check during Phase 3 implementation rather
    than assuming it away.
- **Decision**: FIXED — dropped `TaskAddedToast.tsx`; `plan.md` now specifies an inline module `<script>` in
  `dashboard.astro` that reads `location.search`, calls `toast.success(...)`, and calls `history.replaceState`
  to strip the `success` param
