<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Unified Visual Theme Implementation Plan

- **Plan**: `context/changes/unified-visual-theme/plan.md`
- **Mode**: Deep
- **Date**: 2026-09-14
- **Verdict**: REVISE (fixes applied during triage — see Decisions below)
- **Findings**: 1 critical, 1 warning, 0 observations

## Verdicts

| Dimension             | Verdict      |
| --------------------- | ------------ |
| End-State Alignment   | FAIL (F1)    |
| Lean Execution        | PASS         |
| Architectural Fitness | PASS         |
| Blind Spots           | WARNING (F2) |
| Plan Completeness     | PASS         |

## Grounding

22/22 referenced paths verified (`card.tsx` correctly not-yet-existing — Phase 2 installs it); all quoted
line numbers and code snippets verified against actual file contents via direct reads; brief↔plan consistent;
Progress↔Phase mechanical contract verified — 37/37 Success Criteria bullets across all 5 phases have a
matching Progress checkbox, one `## Progress` heading, all Phase-block bullets are plain `-` (no stray
`- [ ]`/`- [x]`).

## Findings

### F1 — Card call sites drop the glass-panel classes everywhere except Welcome.astro

- **Severity**: ❌ CRITICAL
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: End-State Alignment
- **Location**: Phase 4 item 1 (dashboard.astro), Phase 5 items 1–3 (auth pages, account/delete.astro, account-deleted.astro)
- **Detail**: Every current glass-panel div in the app hardcodes `border-white/10` + `bg-white/{5,10}` + (in
  most cases) `backdrop-blur-xl` — confirmed by direct grep across Welcome.astro, dashboard.astro, all 3 auth
  pages, and both account pages. Only Phase 3's Welcome.astro `Card` contract carries these forward. Phase 4
  item 1 and Phase 5 items 1–3 specified `Card` `className` overrides with only padding/text/sizing classes,
  omitting the background/border/blur — Phase 5 item 2 explicitly (and incorrectly) stated this was safe
  because "Card's override" defaults to `bg-white/10`/`rounded-2xl`. Shadcn's stock generated `Card` actually
  defaults to `bg-card text-card-foreground rounded-xl border py-6 shadow-sm` — an opaque solid-token
  background with no transparency or blur. As originally written, 7 of 8 `Card` call sites (dashboard ×2,
  auth ×3, account ×2) would render as opaque solid boxes, directly contradicting Phase 5's own Manual
  Verification bullet ("auth pages render visually unchanged") and the plan's stated end state that `Card` is
  "used identically" everywhere.
- **Fix A ⭐ Recommended (Applied)**: Add the explicit glass-panel classes (`border-white/10 bg-white/10`,
  plus `backdrop-blur-xl` where the original had it, plus each site's original rounding) to every remaining
  `Card` call site's `className`, mirroring Welcome.astro's already-correct contract.
  - Strength: Minimal, mechanical fix — 5 className strings edited, no new design decision.
  - Tradeoff: Repeats the same class fragment at 7 call sites instead of centralizing it once.
  - Confidence: HIGH — directly mirrors the one call site the plan already got right.
  - Blind spot: None significant.
- **Fix B**: Bake the glass-panel look into `card.tsx`'s own default className in Phase 2.
  - Strength: True single source of truth; call sites only override padding/text/sizing.
  - Tradeoff: Contradicts Phase 2's explicit "className override per call site" design note; requires
    editing generated shadcn code beyond the prescribed cn-import diff check.
  - Confidence: MEDIUM — architecturally cleaner but a bigger deviation from Phase 2's committed design.
  - Blind spot: Whether a future non-glass `Card` usage will ever be needed (none exists today).
- **Decision**: FIXED (via Fix A). Edited Phase 4 item 1 (dashboard.astro empty-state/list-item `Card`
  classNames) and Phase 5 items 1–3 (auth pages, account/delete.astro, account-deleted.astro `Card`
  classNames) in `plan.md` to explicitly restate the glass-panel classes, with an inline note explaining why
  (shadcn's stock `Card` default has no transparency/blur).

### F2 — Dashboard's error banner shrinks unannounced when swapped to ErrorBanner

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4 item 1 (dashboard.astro)
- **Detail**: `ErrorBanner`'s spec (`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm` + icon) is
  copied verbatim from `ServerError.tsx`/`TaskList.tsx`/`AddTaskDialog.tsx`'s existing compact banners, not
  from `dashboard.astro`'s actual markup (`rounded-2xl border p-6 text-center`, no icon, no flex — a much
  larger centered box) despite Phase 2's prose crediting dashboard.astro as the reference implementation.
  Phase 4 item 1 swapped this block for `<ErrorBanner>` verbatim, so dashboard's task-load error state
  visibly shrinks — an unflagged, unverified visual change.
- **Fix**: Note in Phase 4 item 1 that this is an intentional size/layout change (matching the compact style
  already used elsewhere), and add a Manual Verification bullet confirming the smaller banner still reads
  clearly in that page position.
- **Decision**: FIXED. Added a clarifying note to Phase 4 item 1's contract and a new Manual Verification
  bullet confirming the smaller `ErrorBanner` reads clearly on `/dashboard`.
