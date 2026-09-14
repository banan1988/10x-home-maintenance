<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Home Maintenance Landing Page Implementation Plan

- **Plan**: `context/changes/home-maintenance-landing-page/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-14
- **Verdict**: REVISE
- **Findings**: 0 critical, 2 warnings, 0 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

7/7 paths ✓ (`src/pages/index.astro`, `src/components/Welcome.astro`, `src/layouts/Layout.astro`,
`src/components/layout/Header.astro`, `src/components/layout/Footer.astro`, `src/middleware.ts`,
`context/foundation/test-plan.md`), 4/4 symbols ✓ (`Astro.locals.user`, `Props.title` in `Layout.astro`,
`PROTECTED_ROUTES` in `middleware.ts`, `bg-cosmic` utility in `global.css`), brief↔plan ✓ (scope, decisions, and
single-phase structure match exactly). No test references "Welcome" or starter copy (no regression risk there).
`Welcome.astro` confirmed imported only by `src/pages/index.astro` (no hidden blast radius). The plan's
"pre-existing `astro check` failures" claim is corroborated by `shared-app-shell/plan.md:293` ("blocked by 9
pre-existing errors").

## Findings

### F1 — Hero CTA order/emphasis will contradict Header's CTA order on the same page

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Changes Required #3 (Welcome.astro CTA block)
- **Detail**: The plan deliberately reorders the hero's CTA to lead with a primary/solid "Sign up" then a
  secondary/outline "Sign in" (`plan.md:120-125`), reasoning that the PRD and roadmap outcome text both list
  sign-up first. But `Header.astro:53-58` — visible in the same page load, directly above the hero — already
  renders its own signed-out CTA as plain, equally-weighted links in the opposite order: "Sign in" then
  "Sign up". The plan doesn't mention this existing header CTA order at all, so a signed-out visitor will see two
  different orderings/visual treatments of the same two links stacked on one page. No Success Criteria bullet
  catches this, since both only assert the hero's own internal correctness, not consistency with the header
  above it.
- **Fix A ⭐ Recommended**: Match Header's existing order in the hero too (Sign in first, then Sign up)
  - Strength: Keeps the one page where both CTAs are visible internally consistent; zero blast radius (only
    touches the file this plan already owns); no extra decision to defend later.
  - Tradeoff: Loses the "lead with sign-up" acquisition-emphasis framing the plan argued for; that framing
    doesn't exist anywhere else in the app to be consistent with anyway.
  - Confidence: HIGH — the contradiction is directly visible in the two files' current line ranges.
  - Blind spot: None significant.
- **Fix B**: Keep the hero's new order and also flip `Header.astro`'s signed-out block to lead with "Sign up"
  - Strength: Establishes one consistent, conversion-oriented CTA ordering across the whole app, not just this
    page.
  - Tradeoff: Directly contradicts the plan's own "What We're NOT Doing" item ("Not touching ... Header.astro ...
    is out of scope here") — expands this change's blast radius into a file explicitly declared off-limits.
  - Confidence: MEDIUM — the change itself is trivial, but it breaks the plan's own scope boundary.
  - Blind spot: Whether `shared-app-shell`'s owner would want a follow-up change instead of a same-plan edit is
    unverified.
- **Decision**: FIXED (Fix A) — plan.md's CTA block now keeps the original Sign in/Sign up order, matching
  `Header.astro`.

### F2 — Icon selection left as "pick any clear, simple icon" with no concrete spec

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Changes Required #3 (Welcome.astro how-it-works icons)
- **Detail**: Every other piece of content in Phase 1 is fully specified verbatim (exact H1, exact subhead, exact
  three step titles/bodies) — but the icon guidance is "pick any clear, simple icon per step, e.g. add/plus,
  refresh/auto, and list/dashboard shapes" (`plan.md:127-129`), with no actual SVG/path data given. This is the
  same underspecification pattern the skill itself flags ("refactor as needed") — the implementer has to invent
  markup the plan could have pinned down, for the one piece of the page most likely to look inconsistent if left
  to guesswork.
- **Fix**: Name three concrete icon concepts precisely (e.g. "a plus-in-circle icon for Add a task," "a
  clockwise-arrows/refresh icon for Status, computed for you," "a checklist/list icon for See what needs
  attention") and note they should copy the existing SVGs' exact attribute shape (`width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ...`) so the implementer swaps in
  matching lucide-style path data without guessing the wrapper attributes too.
- **Decision**: FIXED — plan.md now names the three icon concepts (plus-in-circle, refresh-arrows, checklist) and
  pins the exact existing SVG wrapper attributes to reuse.
