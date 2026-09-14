---
date: 2026-09-14T13:45:00+02:00
researcher: Łukasz Kucharski
git_commit: 771cff8a1b76bab8825fa2a732d76a88392d3421
branch: main
repository: banan1988/10x-home-maintenance
topic: "Replace the 10x-Astro-Starter landing page with real Home Maintenance product content (roadmap S-04)"
tags: [research, codebase, landing-page, index-astro, layout, header, footer, auth-cta]
status: complete
last_updated: 2026-09-14
last_updated_by: Łukasz Kucharski
---

# Research: Replace the 10x-Astro-Starter landing page with real Home Maintenance product content

**Date**: 2026-09-14T13:45:00+02:00
**Researcher**: Łukasz Kucharski
**Git Commit**: `771cff8a1b76bab8825fa2a732d76a88392d3421`
**Branch**: main
**Repository**: banan1988/10x-home-maintenance

## Research Question

Roadmap slice **S-04** (`home-maintenance-landing-page`, PRD ref `MS-01`): "Replace the untouched 10x-Astro-Starter
landing page with real product content — a demoable MVP should not greet a first-time visitor with generic starter
copy about a 'cosmic developer experience.'" Outcome: "a first-time visitor sees actual product content (problem
statement, value proposition, CTA to sign up/sign in) instead of the untouched 10x-Astro-Starter template."

What does the current landing page look like, what does it need to stop saying, what shell/conventions must the new
content sit inside, and what is this repo's established precedent for planning/testing a page-content-only change?

## Summary

The landing page (`src/pages/index.astro`) is currently just `<Layout><Welcome /></Layout>` — all content lives in
`src/components/Welcome.astro`, a 120-line, frontmatter-less block of pure starter-template markup: H1 **"10x Astro
Starter"**, subhead about a "cosmic developer experience," and three feature cards about auth/stack/DX tooling —
nothing about home maintenance. The page `<title>` is also still the generic default from `Layout.astro`
(`"10x Astro Starter"`), since `index.astro` never passes a `title` prop.

The prerequisite slice **S-05 (`shared-app-shell`, status `done`)** already solved the chrome problem this change
would otherwise have to solve itself: `Layout.astro` unconditionally wraps every page's `<slot />` in `<Header />`
and `<Footer />`, both of which already read `Astro.locals.user` to branch between a signed-in and signed-out view
(nav links + email + sign-out vs. "Not signed in" + Sign in/Sign up links). **This means the new landing page must
not build its own header/nav/CTA-in-chrome** — `shared-app-shell`'s own plan explicitly deferred "rewriting the
landing page hero/copy" to this change and pinned the contract: `/` signed-out should show header "app name + 'Not
signed in' + Sign in/Sign up links," footer "app name + current year," and "no double header renders." So this
change's job is scoped tightly to what replaces `<Welcome />` inside the `<slot />`: hero copy (problem statement +
value proposition, sourced from PRD `Vision & Problem Statement`), and a CTA to `/auth/signup` / `/auth/signin`
(routes already exist and are already used as the CTA hrefs in the current placeholder).

`middleware.ts`'s `PROTECTED_ROUTES` does **not** include `/`, and `Astro.locals.user` is already populated before
that check runs — so the new page content can itself branch CTA copy for a returning signed-in visitor (e.g. "Go to
Dashboard") the same way `Header.astro` already does, if desired; that's a design choice for `/10x-plan`, not
something blocked technically.

No shadcn `Card` component exists in this repo (the current feature cards are hand-rolled divs); `Button` (`src/ components/ui/button.tsx`) exists but isn't used by the current CTAs (`<a>` tags with inline Tailwind classes)
— establishing `Button` usage here would be a new, but reasonable, convention shift, not a violation.

**Sequencing risk to flag for planning**: S-07 (`unified-visual-theme`, status `ready`, not yet `done`) has not
landed. The current `bg-cosmic` gradient / OKLCH neutral-grayscale token palette is what exists today, and per
`shared-app-shell`'s own risk note, `Header.astro`/`Footer.astro` are already expected to need a restyle pass once
S-07 ships. Any new hero styling this change builds should not be treated as final-palette-locked — it's
plausible to need a follow-up restyle once S-07 lands, same as the header/footer.

**No test-plan or codebase precedent exists for testing page content.** `context/foundation/test-plan.md` never
mentions landing/marketing/presentational pages; the only e2e-relevant risk (`#5`) and rollout phase (`Phase 5`,
`not started`) scope a *login → add task → dashboard → edit/complete/delete* flow, not the landing page, and no
Playwright/e2e tooling is installed at all yet. The closest and most relevant precedent is the sibling change
`shared-app-shell` (same render path, no new API/DB work): its plan required **no new automated tests** — only
lint, `astro check` (with a documented pre-existing-failure carve-out), `npm run build`, and the existing Vitest
suite as automated gates, plus a scripted **manual browser walkthrough checklist** per phase with a human-confirm
pause between phases. That is the pattern `/10x-plan` should reuse here rather than inventing e2e coverage this
repo isn't ready for yet.

## Detailed Findings

### Current landing page content (to be replaced)

- [`src/pages/index.astro`](https://github.com/banan1988/10x-home-maintenance/blob/771cff8a1b76bab8825fa2a732d76a88392d3421/src/pages/index.astro) — 8 lines, no frontmatter logic: imports `Welcome` and `Layout`, renders `<Layout><Welcome /></Layout>` with **no `title` prop passed** (so the page `<title>` falls back to `Layout.astro`'s default). No `export const prerender` — served via full SSR like every other page.
- [`src/components/Welcome.astro`](https://github.com/banan1988/10x-home-maintenance/blob/771cff8a1b76bab8825fa2a732d76a88392d3421/src/components/Welcome.astro) — the entire visible content of the landing page today, confirmed to still be the unmodified 10x-Astro-Starter placeholder:
  - Line 29 — H1 `10x Astro Starter`
  - Lines 31-33 — subhead `"A production-ready starter with authentication, modern tooling, and a cosmic developer experience."`
  - Lines 35-40 / 41-46 — CTA `<a>` links: `Sign In` → `/auth/signin`, `Sign Up` → `/auth/signup` (hand-rolled anchors with inline Tailwind classes, not the shadcn `Button` component)
  - Lines 68-71, 91-94, 113-116 — three feature cards about "Authentication Ready," "Modern Stack," "Developer Experience" (all about the starter template itself, not the product)
  - Confirmed: no longer imports `Topbar` (that removal, planned and executed by `shared-app-shell`, already landed) — the only remaining problem with this file is its copy, not stray chrome.

### The shell this content must render inside (already built, done)

- [`src/layouts/Layout.astro`](https://github.com/banan1988/10x-home-maintenance/blob/771cff8a1b76bab8825fa2a732d76a88392d3421/src/layouts/Layout.astro) — every page's only wiring point. Structure: `missingConfigs` banners → `<Header />` → `<slot />` → `<Footer />` → `<Toaster client:load />`. `Props.title` defaults to `"10x Astro Starter"` (line 13) when the page doesn't pass one — `index.astro` currently doesn't, so the browser tab title is still wrong today, independent of `Welcome.astro`'s body copy. `<head>` has only charset/viewport/favicon/title — **no meta description or Open Graph tags exist anywhere in the app**, landing page included.
- [`src/components/layout/Header.astro`](https://github.com/banan1988/10x-home-maintenance/blob/771cff8a1b76bab8825fa2a732d76a88392d3421/src/components/layout/Header.astro) — reads `Astro.locals.user` directly (no props). Nav (Dashboard/Tasks) only renders `{user && (...)}`. Right-hand block branches: signed in → email + sign-out `<form>` posting to `/api/auth/signout`; signed out → "Not signed in" + `Sign in` (`/auth/signin`) + `Sign up` (`/auth/signup`) links. No landing-page-specific special-casing — purely driven by `user` presence, identical behavior on every route including `/`.
- [`src/components/layout/Footer.astro`](https://github.com/banan1988/10x-home-maintenance/blob/771cff8a1b76bab8825fa2a732d76a88392d3421/src/components/layout/Footer.astro) — static, 8 lines: `© {currentYear} 10x Home Maintenance`.
- All 8 pages in the app (`index.astro`, `dashboard.astro`, `tasks/index.astro`, `account-deleted.astro`, `auth/signup.astro`, `auth/signin.astro`, `auth/confirm-email.astro`, `account/delete.astro`) follow the identical convention: wrap content in `<Layout title="...">...</Layout>` and let `Layout.astro` own Header/Footer. **No page imports `Header`/`Footer` directly** — the new landing page content should not either.

### Auth/session context available to the landing page

- [`src/middleware.ts`](https://github.com/banan1988/10x-home-maintenance/blob/771cff8a1b76bab8825fa2a732d76a88392d3421/src/middleware.ts) — `PROTECTED_ROUTES = ["/dashboard", "/tasks", "/account/delete"]` (line 4) — **`/` is not protected**, confirming the landing page must stay reachable by anonymous visitors. `context.locals.user` is set unconditionally before the protected-route redirect check (lines 9-16), so it's already available to `index.astro`/its content for optional signed-in-visitor branching (e.g., a "Go to Dashboard" CTA instead of "Sign up"), mirroring what `Header.astro` already does.
- CTA route convention confirmed twice (current `Welcome.astro` and `Header.astro`): sign-up is `/auth/signup`, sign-in is `/auth/signin` — these are the correct hrefs to reuse.

### Styling building blocks available

- [`src/styles/global.css`](https://github.com/banan1988/10x-home-maintenance/blob/771cff8a1b76bab8825fa2a732d76a88392d3421/src/styles/global.css) — shadcn-generated OKLCH neutral-grayscale token set (`--background`, `--foreground`, `--primary`, etc., lines 6-73) mapped into Tailwind theme colors via `@theme inline` (lines 75-111), plus a standalone `bg-cosmic` gradient utility (lines 113-115) used directly by `Welcome.astro` and the auth pages — independent of the token system. **This palette is not final**: S-07 (`unified-visual-theme`, PRD ref `MS-04`, status `ready`) is scoped to apply one consistent palette everywhere and explicitly already expects to need a restyle pass on `Header.astro`/`Footer.astro` once it ships, since those shipped before S-07 existed. Any new hero should be built with the same expectation — it's reasonable to land now, likely revisited once S-07 completes.
- [`src/components/ui/`](https://github.com/banan1988/10x-home-maintenance/tree/771cff8a1b76bab8825fa2a732d76a88392d3421/src/components/ui) — installed shadcn primitives: `alert-dialog`, `popover`, `label`, `sonner`, `calendar`, `dialog`, `table`, `button`, `select`, `input`, plus `LibBadge.astro`. **No `card.tsx`** — current feature cards are hand-rolled `<div class="rounded-xl border ...">`. `button.tsx` exports `Button`/`buttonVariants` (CVA-based) and is the natural candidate for CTA buttons, though it isn't used by the current landing page's CTAs today (plain `<a>` tags) — adopting `Button` here would be a small, reasonable convention improvement, not a requirement.

### Product content to draw the new copy from (PRD)

- [`context/foundation/prd.md`](https://github.com/banan1988/10x-home-maintenance/blob/771cff8a1b76bab8825fa2a732d76a88392d3421/context/foundation/prd.md) `## Vision & Problem Statement` (lines 20-30) — the problem statement and value proposition the roadmap outcome asks for: cyclical home-maintenance tasks scattered across memory/notes/calendars; no single place answers "what needs attention now"; the product's bet is that OK/DUE SOON/OVERDUE status should be computed automatically from frequency + last-done date, not worked out by hand.
- `## User & Persona` (lines 32-36) — single homeowner/renter, one property, MVP has no sharing/multi-property — useful for keeping hero copy scoped and honest (don't imply team/multi-property features).
- `## Success Criteria` → MVP flow (lines 57-58) — register/log in → add task(s) → auto-computed status → dashboard by urgency — a good shape for a "how it works" section if the plan wants one, though not required by the roadmap outcome itself (which only asks for problem statement + value prop + CTA).

## Code References

- `src/pages/index.astro:1-8` — current landing page composition, no `title` prop passed to `Layout`
- `src/components/Welcome.astro:29` — placeholder H1 "10x Astro Starter"
- `src/components/Welcome.astro:31-33` — placeholder subhead ("cosmic developer experience")
- `src/components/Welcome.astro:35-46` — existing Sign In / Sign Up CTA anchors (hrefs to reuse)
- `src/components/Welcome.astro:68-116` — three starter-template feature cards to remove/replace
- `src/layouts/Layout.astro:9-13` — `title` prop, default `"10x Astro Starter"`
- `src/layouts/Layout.astro:18-23` — `<head>`: no meta description/OG tags exist yet anywhere
- `src/layouts/Layout.astro:41-44` — Header → slot → Footer → Toaster wiring, shared by every page
- `src/components/layout/Header.astro:2,12-37,39-62` — `Astro.locals.user`-driven nav/CTA branching
- `src/components/layout/Footer.astro:1-8` — static footer content
- `src/middleware.ts:4,9-22` — `PROTECTED_ROUTES` (excludes `/`) and `locals.user` population order
- `src/components/ui/button.tsx:3,7,42,50` — `Button`/`buttonVariants`, unused by current CTAs
- `src/styles/global.css:113-115` — `bg-cosmic` gradient utility used by the current hero
- `context/foundation/prd.md:20-36` — problem statement, value proposition, persona scope for hero copy

## Architecture Insights

- **Layout ownership is total**: individual pages never touch Header/Footer; they only set `<Layout title="...">`. Any plan for this change should scope itself strictly to page-body content (and the `title` prop / meta description, if added) — touching `Layout.astro`, `Header.astro`, or `Footer.astro` would duplicate work already owned by `shared-app-shell` (done) and risk conflicting with `unified-visual-theme` (in flight, `ready`).
- **`Astro.locals.user` is the established pattern** for signed-in/signed-out branching directly inside `.astro` frontmatter (see `Header.astro`) — no separate hook or context provider exists or is needed for this.
- **No content-authoring layer exists** beyond plain `.astro` markup (no content collections, no CMS, no i18n) — confirmed via `tech-stack.md`; the new landing page is just another hand-written `.astro`/component, consistent with how every other page in this repo is built.
- **This repo's test bar for UI-only, no-new-API/DB changes is deliberately light**: no new automated test type is expected; lint + `astro check` (documented pre-existing failures excluded) + `npm run build` + existing Vitest suite, plus a manual scripted browser walkthrough with a human-confirmation pause per phase. Do not propose introducing Playwright/e2e for this change — that's explicitly scoped to `test-plan.md` Phase 5 (`not started`), a distinct, not-yet-authorized rollout phase covering only the login-onward task flow, not the landing page.

## Historical Context (from prior changes)

- [`context/changes/shared-app-shell/plan.md`](https://github.com/banan1988/10x-home-maintenance/blob/771cff8a1b76bab8825fa2a732d76a88392d3421/context/changes/shared-app-shell/plan.md) — the direct precedent change. Line ~64: *"Not rewriting the landing page hero/copy (still the unreplaced '10x Astro Starter' template content) — that's S-04 (`home-maintenance-landing-page`), sequenced after this change specifically to land under the new shell."* This is the explicit hand-off this research change acts on.
  - Lines ~137-146: explicitly left `Welcome.astro`'s hero/feature-cards/`bg-cosmic` wrapper untouched as out of scope for that change.
  - Lines ~170-178 (Manual Verification): pins the exact expected shell behavior on `/` that the new content must not break — "header shows app name + 'Not signed in' + Sign in/Sign up links; footer shows app name + current year; no double header renders."
  - Lines ~244-266 (Testing Strategy): "No new unit tests... no integration tests... " + a numbered manual-testing-steps list — the pattern to reuse for this change's own plan.
  - Two-phase structure with a required "leave the app in a working, buildable state" constraint per phase, and an explicit human-confirmation pause between phases (lines ~180-181, 239-240).
  - Epilogue commit (`01da75d`, "close out plan (epilogue)") touched only `plan.md`/`change.md` — **not** `roadmap.md`; the roadmap's S-05 status sync happened as a separate, manually-run update. Per [`context/foundation/lessons.md`](https://github.com/banan1988/10x-home-maintenance/blob/771cff8a1b76bab8825fa2a732d76a88392d3421/context/foundation/lessons.md) ("Closing out a plan must also update roadmap.md" and "`roadmap.md` status must only be synced by the epilogue step, not a mid-phase commit"), this change's own epilogue **should** fold the `roadmap.md` S-04 status flip into the same close-out step — don't repeat the drift the lessons file already flagged twice.
- `context/foundation/roadmap.md:191-208` (S-04 detail) and `:72` (at-a-glance row) — outcome, PRD ref (`MS-01`), prerequisite (`S-05`, done — so this change is fully unblocked), "Parallel with: S-06" (also done, no conflict expected), and the audit finding that justified this slice (literal "10x Astro Starter" title/copy still live).
- `context/foundation/roadmap.md:257-282` (S-07 detail) — confirms `unified-visual-theme` is `ready` (not started), not `done`, and already documents an expected future restyle of `Header.astro`/`Footer.astro`. Flag this as a known follow-up risk for whatever hero styling this change picks, rather than a blocker.
- `context/foundation/test-plan.md` §3 Phase 5 / §5 / §6.3 — confirms no e2e tooling exists yet and the only authorized e2e scope (once Phase 5 starts) is the login-onward task flow, not the landing page.
- `context/foundation/lessons.md` — "String fields must always have a maximum length" and the `shadcn add` gotchas are not directly applicable here (no new form/schema, and no new shadcn components are strictly required — `Button` is already installed), but worth keeping in mind only if the plan decides to add a new shadcn component.

## Related Research

- `context/changes/shared-app-shell/research.md` and `context/changes/shared-app-shell/plan.md` — prerequisite change's own research/plan, source of the shell contract this change must respect.
- `context/changes/account-deletion/*` — sibling parallel change (`S-06`), no shared files with this one; consulted only for roadmap cross-referencing, no direct dependency.

## Open Questions

- Should the hero branch its CTA for a returning signed-in visitor (e.g., "Go to Dashboard" instead of "Sign up")? Technically trivial (`Astro.locals.user` is already available), but the roadmap outcome text only asks for a first-time-visitor CTA to sign up/sign in — this is a scope decision for `/10x-plan`, not something this research resolves.
- Should this change also add a meta description / Open Graph tags (currently absent app-wide) while touching `<head>`/`title`, or is that out of scope and better left as its own follow-up? No existing page sets these, so doing it here would be a new pattern, not a fix to an established one.
- Whether to introduce shadcn `Button` for the CTA (replacing the current hand-rolled `<a>` styling) is a design choice, not a technical blocker — flag for `/10x-plan` rather than deciding here.
