# Home Maintenance Landing Page Implementation Plan

## Overview

Replace the unmodified 10x-Astro-Starter landing page content with real Home Maintenance product content: a
problem-statement hero, a "how it works" section grounded in the PRD's MVP flow, a CTA to sign up/sign in (or
straight to the dashboard for a returning signed-in visitor), and a correct page `<title>` + meta description.

## Current State Analysis

- `src/pages/index.astro` renders `<Layout><Welcome /></Layout>` with no `title` prop, so the browser tab still
  reads the `Layout.astro` default, `"10x Astro Starter"`.
- `src/components/Welcome.astro` is the entire visible body of the landing page today: an H1 reading
  `"10x Astro Starter"`, a subhead about "a cosmic developer experience," and three feature cards about the
  starter's own auth/stack/DX tooling — nothing about home maintenance. It has no frontmatter script block at all
  (pure markup), and its two CTA links (`Sign In` → `/auth/signin`, `Sign Up` → `/auth/signup`) are hand-rolled
  `<a>` tags with inline Tailwind classes.
- `src/layouts/Layout.astro` already wraps every page's content in `<Header />` and `<Footer />` (both delivered,
  done, by the prerequisite `shared-app-shell` change) around `<slot />`, and only exposes a `title?: string` prop
  — no `description`/meta-tag prop exists yet, and no page in the app sets a meta description today.
- `src/middleware.ts`'s `PROTECTED_ROUTES` excludes `/`, and `context.locals.user` is populated on every request
  before that check runs — so `Astro.locals.user` is already available to any page, including this one.

## Desired End State

A first-time, signed-out visitor to `/` sees: a browser tab titled after the product (not the starter), a hero
headline + subhead stating the actual problem/value proposition, a three-step "how it works" section reflecting
the PRD's MVP flow, and a CTA to sign up (primary) or sign in (secondary). A signed-in visitor who lands on `/`
sees the same hero and "how it works" content, but the CTA is a single "Go to Dashboard" link instead. The shared
header/footer (already built) render unchanged around this content, exactly as they do on every other page.

**Verification**: visually confirmed via the manual walkthrough in each phase's Success Criteria, plus
`npm run lint`, `npx astro check`, `npm run build`, and `npm run test` all passing.

### Key Discoveries

- `Layout.astro:9-13` — `title` prop already exists and is trivially extendable with a sibling `description` prop
  following the same optional-prop pattern.
- `Header.astro:2,39-62` establishes the exact pattern for signed-in/signed-out frontmatter branching
  (`const { user } = Astro.locals;` then a ternary) — this plan's `Welcome.astro` change reuses that same pattern.
- `middleware.ts:4` confirms `/` is not in `PROTECTED_ROUTES`, and `locals.user` is set before the redirect check
  (`middleware.ts:9-16`), so no middleware change is needed to read `Astro.locals.user` on this page.
- No shadcn `Card` component exists in this repo (feature "cards" are hand-rolled `<div>`s) and the current CTAs
  don't use the shadcn `Button` component either — this plan keeps that same hand-rolled-anchor convention rather
  than introducing `Button` here (see Implementation Approach).

## What We're NOT Doing

- Not touching `src/layouts/Layout.astro`'s `<Header />`/`<Footer />`/`<Toaster />` wiring, or `Header.astro` /
  `Footer.astro` themselves — that shell is owned by `shared-app-shell` (done) and is out of scope here.
- Not adding Open Graph tags or a social preview image — only a plain `<meta name="description">` is added; OG
  tags would need a new image asset and are left for a future change if ever needed.
- Not introducing the shadcn `Button` component for the CTAs — kept as hand-rolled `<a>` tags matching the
  current visual treatment, since `Button`'s default/outline variants use light-mode-tuned tokens that don't yet
  match the dark `bg-cosmic` hero background (S-07 `unified-visual-theme` hasn't landed).
- Not treating the current `bg-cosmic` gradient/orb styling as final — it's left as-is (visual continuity), with
  the known expectation (same as `Header.astro`/`Footer.astro`) that S-07 may restyle it later.
- Not adding any new automated test type (e.g. Playwright/e2e) — this repo's e2e tooling doesn't exist yet and is
  explicitly scoped to a separate, not-started rollout phase (`context/foundation/test-plan.md` §3 Phase 5) that
  covers the login-onward task flow, not the landing page.
- Not renaming `Welcome.astro` — kept as-is to minimize diff; only its contents change.

## Implementation Approach

Single phase, three files: extend `Layout.astro` with an optional `description` prop, pass real `title`/
`description` values from `index.astro`, and rewrite `Welcome.astro`'s body (adding a frontmatter block reading
`Astro.locals.user`, since it currently has none). This is a pure content/markup change with no new dependencies,
API routes, or data model — matching the "UI-only, no new API/DB work" shape of the precedent change
(`shared-app-shell`), so it reuses that change's lightweight testing approach (see Testing Strategy) rather than
introducing new automated coverage.

## Phase 1: Rewrite landing page content, title, and meta description

### Overview

Replace the starter-template copy with real Home Maintenance product content across the three files that make up
the landing page's `<head>` metadata and body content.

### Changes Required

#### 1. Layout with an optional meta description

**File**: `src/layouts/Layout.astro`

**Intent**: Let a page opt into a meta description without forcing every page to set one (no other page in the
app needs this today).

**Contract**: Add `description?: string` to the `Props` interface and destructure alongside `title` (no default
value — stays `undefined` when unset). In `<head>`, after the existing `<title>{title}</title>` line, render
`{description && <meta name="description" content={description} />}` — a plain conditional tag, omitted entirely
on every page that doesn't pass one.

#### 2. Landing page passes real title/description

**File**: `src/pages/index.astro`

**Intent**: Fix the stale generic browser-tab title and give the landing page a real meta description, both
reflecting the product instead of the starter template.

**Contract**: Pass two props to `<Layout>`:

- `title="10x Home Maintenance — track your home's upkeep automatically"`
- `description="Track cyclical home maintenance — filter changes, inspections, battery swaps — and see at a glance what's OK, due soon, or overdue."`

#### 3. Landing page hero content

**File**: `src/components/Welcome.astro`

**Intent**: Replace every trace of the 10x-Astro-Starter placeholder copy with real Home Maintenance product
content: a problem-statement/value-proposition hero, a three-step "how it works" section grounded in the PRD's
MVP flow, and an auth-aware CTA. Keep the existing decorative background (cosmic orbs + star field) and overall
layout shell (centered hero over a 3-column section) unchanged — only the text, icons, and CTA logic change.

**Contract**:

- Add a frontmatter script block (the file currently has none): `const { user } = Astro.locals;` — same pattern
  as `Header.astro:2`.
- Hero H1 becomes: `What in your home needs attention right now?`
- Hero subhead becomes: `10x Home Maintenance tracks your cyclical upkeep — filter changes, inspections, battery swaps — and automatically shows what's OK, due soon, or overdue. No more relying on memory, notes, or a calendar.`
- CTA block: if `user` is truthy, render a single link — `Go to Dashboard` → `/dashboard` — styled with the
  existing solid/primary treatment (the current `Sign In` button's classes). If `user` is falsy, render two links
  using the existing two button styles in their current order — solid `Sign In` → `/auth/signin` first, outline
  `Sign Up` → `/auth/signup` second — unchanged from today's file, so the hero's CTA order matches
  `Header.astro:53-58`'s own signed-out CTA order (`Sign in` then `Sign up`), which renders directly above it on
  the same page.
- Replace the three feature cards with three "how it works" steps, keeping the existing card container styling
  (`rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl`) and each card's existing inline-SVG
  wrapper attributes verbatim (`width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mb-4 text-purple-300"`), swapping in one
  concrete icon concept per step: a plus-in-circle icon for step 1, a clockwise-arrows/refresh icon for step 2,
  and a checklist/list icon for step 3:
  1. **Add a task** — "Name it, pick a category, set how often it repeats, and when you last did it."
  1. **Status, computed for you** — "10x Home Maintenance works out whether each task is OK, due soon, or
     overdue — you don't have to."
  1. **See what needs attention** — "Your dashboard sorts everything by urgency, so the most pressing task is
     always at the top."

### Success Criteria

#### Automated Verification

- Linting passes: `npm run lint`
- Type checking passes: `npx astro check` (pre-existing failures unrelated to this change, if any, are not
  regressions — cross-check against a clean `main` run before attributing any failure to this change)
- Production build succeeds: `npm run build`
- Existing unit test suite passes (no regressions): `npm run test`

#### Manual Verification

- Signed out, visit `/`: browser tab reads the new title (not "10x Astro Starter"); page source has a
  `<meta name="description">` with the new copy; hero shows the new headline/subhead; "how it works" section
  shows the three new steps; CTA shows `Sign up` (primary/solid) and `Sign in` (secondary/outline) linking to
  `/auth/signup` and `/auth/signin` respectively.
- Signed in (e.g. after logging in via `/auth/signin`), visit `/`: hero and "how it works" content are unchanged;
  CTA instead shows a single `Go to Dashboard` link that navigates to `/dashboard`.
- Header and footer render exactly as before on `/` in both states (app name, nav only when signed in, "Not
  signed in"/email + sign-out as appropriate, footer copyright line) — confirming this change didn't disturb the
  shared shell.
- No console errors in the browser on page load, either auth state.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for
manual confirmation from the human that the manual testing was successful before proceeding to close out the
plan.

______________________________________________________________________

## Testing Strategy

### Unit Tests

- None added — this is pure Astro markup/composition (hero copy, a conditional CTA block, a meta tag) with no
  new pure functions, schemas, or business logic, matching the precedent set by `shared-app-shell`.

### Integration Tests

- None added — no API routes or data access change in this plan.

### Manual Testing Steps

1. Run `npm run dev`, visit `/` while signed out. Confirm title, meta description (view page source), hero copy,
   "how it works" steps, and `Sign up`/`Sign in` CTA hrefs.
1. Sign up or sign in via the existing auth pages, then revisit `/`. Confirm the CTA now reads `Go to Dashboard`
   and navigates to `/dashboard` on click.
1. Confirm the header/footer look identical to their current appearance on every other page (no regression from
   this change).
1. Resize to a narrow viewport and confirm the hero/CTA/how-it-works section remain readable (the existing
   responsive classes — `sm:`/`lg:` breakpoints — are preserved from the current file).

## Performance Considerations

None — no new dependencies, no new client-side JavaScript (the CTA branching happens server-side via
`Astro.locals.user`, same as `Header.astro`), no images added.

## Migration Notes

Not applicable — no data model or existing content to migrate; this is a full content replacement of a
placeholder page.

## References

- Related research: `context/changes/home-maintenance-landing-page/research.md`
- Prerequisite change (shell this content renders inside): `context/changes/shared-app-shell/plan.md`
- Signed-in/out branching pattern to reuse: `src/components/layout/Header.astro:2,39-62`
- PRD problem statement / value proposition source: `context/foundation/prd.md:20-30`
- PRD MVP flow source for "how it works" steps: `context/foundation/prd.md:57-58`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append `— <commit sha>` when a step lands. Do not rename step
> titles. See `references/progress-format.md`.

### Phase 1: Rewrite landing page content, title, and meta description

#### Automated

- [ ] 1.1 Linting passes: `npm run lint`
- [ ] 1.2 Type checking passes: `npx astro check`
- [ ] 1.3 Production build succeeds: `npm run build`
- [ ] 1.4 Existing unit test suite passes (no regressions): `npm run test`

#### Manual

- [ ] 1.5 Signed-out `/`: title, meta description, hero copy, how-it-works steps, and Sign up/Sign in CTA hrefs
  are correct
- [ ] 1.6 Signed-in `/`: hero/how-it-works unchanged, CTA shows Go to Dashboard → `/dashboard`
- [ ] 1.7 Header/footer render unchanged in both auth states
- [ ] 1.8 No console errors on page load in either auth state
