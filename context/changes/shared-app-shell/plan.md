# Shared App Shell (Header, Nav, Footer) Implementation Plan

## Overview

Every page today builds its own header/nav/sign-out chrome ad hoc, and no page has a footer. This plan
consolidates that into one shared shell: a new `Header.astro` (app name, Dashboard/Tasks nav with active-state
highlighting, email + sign-out, or Sign in/Sign up when signed out) and a new `Footer.astro`, both rendered by
`Layout.astro` so all 6 pages inherit them automatically. The signed-in/out logic itself already exists and works
correctly in `Topbar.astro` — this is a consolidation of existing, correct logic into one place, not a rewrite.

## Current State Analysis

- `src/layouts/Layout.astro:1-52` is the single wrapper every page already uses. It accepts only a `title` prop,
  renders one unnamed `<slot />`, the `missingConfigs` `Banner`, and a global `Toaster`. It contributes zero
  header/nav/footer scaffolding — the root cause of the divergence below.
- `src/components/Topbar.astro:1-38` already has correct signed-in/signed-out logic (email, `/dashboard` link,
  POST-form sign-out to `/api/auth/signout`, or Sign in/Sign up links) but is only rendered by
  `src/components/Welcome.astro:2,28`, which only `index.astro` uses.
- `src/pages/dashboard.astro:9,40-53,81-88` hand-rolls its own header ("Welcome, {email}" + a "Manage tasks" link)
  and a second, independently-styled copy of the sign-out form.
- `src/pages/tasks/index.astro:30-33` has only a bare "← Back to dashboard" link — no email, no sign-out control.
- The 3 auth pages (`src/pages/auth/{signin,signup,confirm-email}.astro`) render no header/nav/footer at all.
- No footer exists anywhere in the repo.
- `Astro.locals.user` (typed in `src/env.d.ts:1-5`) is populated by `src/middleware.ts:6-16` on every request and
  is directly readable from any `.astro` component with no prop plumbing — `Topbar.astro` and `dashboard.astro`
  already both do this independently. `Astro.url` is likewise available in any `.astro` component during SSR, not
  just pages.
- `src/pages/api/auth/signout.ts` is POST-only and always redirects to `/`; both existing sign-out forms already
  POST to it directly (no fetch/JS) — this convention is preserved, not changed.
- `bg-cosmic` (`src/styles/global.css:113-115`) is a global Tailwind `@utility` (a dark navy→indigo→navy vertical
  gradient), applied today as an ad-hoc class on each page's own outer `<div>`. `body` itself (`global.css:121-123`)
  uses the light `--background`/`--foreground` tokens and this app never toggles a `.dark` class — so anything
  rendered directly in `<body>` without its own dark styling would look like a bright/white bar against each
  page's dark cosmic content.
- No UI component-test tooling exists yet. `context/foundation/test-plan.md` explicitly defers that choice (React
  Testing Library, etc.) to its own Phase 2, not yet started — this change must not preempt that decision.

### Key Discoveries

- `Layout.astro` is the correct single integration point — extending it reaches all 6 pages at once, with no risk
  of a 7th page forgetting to opt in.
- The signed-in/out logic and the sign-out form-POST convention are already correct in `Topbar.astro`; the work is
  moving that into the new shared `Header.astro` (with nav + app name added) and deleting the two duplicate
  copies, not re-deriving the logic.
- `bg-cosmic`'s gradient starts and ends on the same dark navy (`#0a0e1a`), so applying it independently to
  `Header`, each page's own content div, and `Footer` blends visually without needing to restructure `Layout.astro`
  into a flex/sticky-footer box model.

## Desired End State

Every one of the 6 pages (`index`, `dashboard`, `tasks/index`, `auth/signin`, `auth/signup`,
`auth/confirm-email`) renders the same `Header` (app name, Dashboard/Tasks nav with the current page highlighted
when signed in, email + sign-out when signed in, or Sign in/Sign up when signed out) and the same `Footer` (app
name + current year), supplied once by `Layout.astro`. No page contains its own hand-rolled header, nav-back-link,
or sign-out form. `Topbar.astro` no longer exists.

**Verification**: `npm run lint`, `npx astro check`, `npm run build`, and `npm run test` all pass; a manual
walkthrough (Phase 2's Manual Verification) confirms the shared header/footer render correctly, with correct
active-nav state, on all 6 pages in both signed-in and signed-out states, and that no duplicate chrome remains.

## What We're NOT Doing

- Not rewriting the landing page hero/copy (still the unreplaced "10x Astro Starter" template content) — that's
  S-04 (`home-maintenance-landing-page`), sequenced after this change specifically to land under the new shell.
- Not building a dropdown user menu or installing any new shadcn component (`dropdown-menu`, `avatar`, etc.) —
  the shared header reuses `Topbar.astro`'s existing plain-inline-links style.
- Not adding footer nav links or legal/placeholder pages (Privacy, Terms) — footer is app name + year only.
- Not adding a mobile hamburger/collapsible nav — the header stays plain inline markup that wraps via flexbox on
  narrow viewports, consistent with `Topbar.astro`'s existing (unchanged) approach.
- Not adding UI component tests or picking a component-test tool — that decision belongs to
  `context/foundation/test-plan.md`'s own Phase 2, not yet started.
- Not touching `src/pages/api/auth/signout.ts`, S-06's account-deletion work, or any data/schema.

## Implementation Approach

Two phases, each leaving the app in a working, buildable state:

1. Build the new shared components and wire them into `Layout.astro` — every page immediately gets the shared
   header/footer (old per-page duplicates still render alongside them, harmlessly, until Phase 2).
1. Delete the now-fully-redundant per-page chrome from `dashboard.astro` and `tasks/index.astro`.

## Critical Implementation Details

**Visual integration without restructuring `Layout.astro`'s box model**: `Header.astro` and `Footer.astro` each
apply `bg-cosmic` (or the equivalent flat dark navy) directly to their own root element, rather than moving
`bg-cosmic`/`min-h-screen` up onto a new wrapper in `Layout.astro`. This means **no changes are needed to any
page's existing outer `bg-cosmic`/`min-h-screen` div** — the shared header/footer simply sit above and below it
as their own independently-styled bars. Do not attempt a flex/sticky-footer restructuring of `Layout.astro`; it
is unnecessary for this change's scope and adds height-calculation risk across pages with very different content
heights (short auth cards vs. the long dashboard/tasks lists).

## Phase 1: Build and wire the shared shell

### Overview

Create the two new shell components, retire `Topbar.astro`, and have `Layout.astro` render the shell around every
page's content.

### Changes Required

#### 1. New shared header component

**File**: `src/components/layout/Header.astro`

**Intent**: Adapt `Topbar.astro`'s existing signed-in/signed-out logic (read `Astro.locals.user` directly, no
props) into the new shared header, adding the two elements the roadmap outcome requires that `Topbar.astro`
doesn't yet have: an app-name element (link to `/`) and a Dashboard/Tasks nav with active-page highlighting, shown
only in the signed-in branch (nav links point at protected routes, so they're meaningless signed out).

**Contract**: No props — reads `Astro.locals.user` and `Astro.url.pathname` directly, same access pattern
`Topbar.astro` and `dashboard.astro` already use independently. Active-state rule: the Dashboard link is active
when `Astro.url.pathname === "/dashboard"`; the Tasks link is active when `Astro.url.pathname.startsWith("/tasks")`
(covers future `/tasks/*` sub-routes). Sign-out stays a plain `<form method="POST" action="/api/auth/signout">`
per the existing convention — do not switch to a fetch call. Root element carries `bg-cosmic` (or the equivalent
flat dark color) per the Critical Implementation Details note above.

#### 2. New footer component

**File**: `src/components/layout/Footer.astro`

**Intent**: A minimal static footer — app name + current year, no links. No precedent exists in the codebase for
this; this is genuinely new, not an extraction.

**Contract**: No props. Content: `© {current year} 10x Home Maintenance` (or equivalent), current year computed
at render time (`new Date().getFullYear()`). Root element carries `bg-cosmic` (or the equivalent flat dark color)
per the Critical Implementation Details note above.

#### 3. Retire the old landing-page-only header

**File**: `src/components/Topbar.astro` (delete)

**Intent**: Fully superseded by `Header.astro`, which `Layout.astro` now renders for every page — keeping both
would double-render a header on `index.astro`.

**Contract**: Delete the file once `Welcome.astro` (below) no longer imports it.

#### 4. Stop rendering the old header from the landing page

**File**: `src/components/Welcome.astro`

**Intent**: Remove the now-redundant `<Topbar />` import and render — `Layout.astro` supplies the header globally.
Leave every other part of `Welcome.astro` (decorative orbs, hero, feature cards, its own `bg-cosmic` content div)
untouched; that content and its background are out of this change's scope.

**Contract**: Remove the `import Topbar from "@/components/Topbar.astro"` line and the `<Topbar />` usage
(`Welcome.astro:2,28`). No other changes to this file.

#### 5. Wire the shell into the shared layout

**File**: `src/layouts/Layout.astro`

**Intent**: Render the new `Header` before the slot and the new `Footer` after it, for every page, unconditionally
— no new prop needed since `Header`/`Footer` read `Astro.locals`/`Astro.url` themselves. Leave the existing
`missingConfigs` `Banner` rendering and the `Toaster` mount exactly where they are today.

**Contract**: Import and render `<Header />` immediately before `<slot />` and `<Footer />` immediately after it,
inside the existing `<body>`, without altering the Banner-then-slot-then-Toaster structure otherwise.

### Success Criteria

#### Automated Verification

- [ ] Linting passes: `npm run lint`
- [ ] Type checking passes: `npx astro check`
- [ ] Production build succeeds: `npm run build`
- [ ] Existing unit test suite passes (no regressions): `npm run test`

#### Manual Verification

- [ ] Signed out, visit `/`: header shows app name + "Not signed in" + Sign in/Sign up links; footer shows app
  name + current year; no double header renders (old `Topbar` content is gone from the hero).
- [ ] Signed out, visit each of `/auth/signin`, `/auth/signup`, `/auth/confirm-email`: header and footer render
  consistently; existing page-specific content (forms, sign-in/sign-up switch links) is unchanged.
- [ ] Sign in, visit `/dashboard`: header shows app name, the signed-in user's email, Dashboard nav link styled
  as active, Tasks nav link styled as inactive, and a working sign-out button; footer renders.
- [ ] Visit `/tasks`: header shows Tasks nav link styled as active and Dashboard as inactive.
- [ ] Click sign-out from the shared header on any signed-in page: session ends and the existing
  `/api/auth/signout` redirect behavior is unchanged.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual
confirmation from the human that the manual testing was successful before proceeding to Phase 2.

______________________________________________________________________

## Phase 2: Remove duplicated per-page chrome

### Overview

Delete the now-fully-redundant hand-rolled header/nav/sign-out markup from `dashboard.astro` and
`tasks/index.astro`, since Phase 1's shared header already covers everything they were doing.

### Changes Required

#### 1. Dashboard page

**File**: `src/pages/dashboard.astro`

**Intent**: Remove the "Welcome, {email}" paragraph, the "Manage tasks" link, and the entire duplicate sign-out
`<form>` at the bottom — all now redundant with the shared header's email display, Tasks nav link, and sign-out
control. Keep the page's own "Dashboard" `h1` title and the `AddTaskDialog` island exactly as they are; those are
page-specific content, not shell chrome.

**Contract**: Remove `dashboard.astro:45-50` (the "Welcome, {email}" paragraph and "Manage tasks" link) and
`dashboard.astro:81-88` (the duplicate sign-out form). No other markup, script, or data-fetching logic in this
file changes.

#### 2. Tasks page

**File**: `src/pages/tasks/index.astro`

**Intent**: Remove the "← Back to dashboard" link — redundant with the shared header's Dashboard nav link. Keep
the "Manage tasks" `h1` title and the `TaskList` island unchanged.

**Contract**: Remove the back-link anchor at `tasks/index.astro:32`, keeping the surrounding `h1` and flex
container structure (or simplify it if the link was the only other element in that row — implementer's call
based on what reads cleanly).

### Success Criteria

#### Automated Verification

- [ ] Linting passes: `npm run lint`
- [ ] Type checking passes: `npx astro check`
- [ ] Production build succeeds: `npm run build`
- [ ] Existing unit test suite passes (no regressions): `npm run test`

#### Manual Verification

- [ ] Dashboard page shows no duplicate "Welcome, {email}" text, no "Manage tasks" link, and no second sign-out
  form — only the shared header's copies of these remain.
- [ ] Tasks page shows no "← Back to dashboard" link — only the shared header's Dashboard nav link remains.
- [ ] Existing dashboard flows still work: adding a task via `AddTaskDialog` still succeeds and shows the
  success toast.
- [ ] Existing tasks-page flows still work: the task list still renders, and edit/complete/delete actions on an
  existing task still succeed.
- [ ] Full walkthrough: starting from `/dashboard`, use only the shared header's nav to reach `/tasks` and back —
  no other navigation control is needed.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual
confirmation from the human that the manual testing was successful.

______________________________________________________________________

## Testing Strategy

### Unit Tests

- No new unit tests are added by this change — it is pure Astro markup/composition with no new pure functions,
  schemas, or business logic. The existing Vitest suite (`npm run test`) must stay green throughout, since it's
  the only automated signal this change could regress (e.g. if a shared-layout change accidentally broke an API
  route or a `src/lib/*` helper it doesn't touch).

### Integration Tests

- None added — no API routes change in this plan.

### Manual Testing Steps

1. Sign out (or use a fresh session) and visit `/`, each `/auth/*` page — confirm header/footer render, signed-out
   state is correct.
1. Sign in, visit `/dashboard` and `/tasks` — confirm header/footer render, signed-in state is correct, active-nav
   highlighting matches the current page.
1. Confirm sign-out from the shared header works and returns to `/` signed out.
1. After Phase 2: confirm no duplicate chrome remains on `dashboard.astro`/`tasks/index.astro`, and that adding a
   task, completing a task, and deleting a task all still work end-to-end through the UI.

## Performance Considerations

None — this is static Astro markup with no new data fetching, client-side JS, or islands. `Header`/`Footer` add no
`client:*` directives (no interactivity needed for plain links/forms).

## Migration Notes

Not applicable — no data model or schema changes.

## References

- Related research: `context/changes/shared-app-shell/research.md`
- Roadmap item: `context/foundation/roadmap.md` (S-05, `shared-app-shell`)
- Existing correct logic being consolidated: `src/components/Topbar.astro:1-38`
- Single integration point: `src/layouts/Layout.astro:1-52`
- Duplicate chrome being removed: `src/pages/dashboard.astro:40-53,81-88`, `src/pages/tasks/index.astro:30-33`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append `— <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Build and wire the shared shell

#### Automated

- [x] 1.1 Linting passes: `npm run lint` — 1a6eb56
- [x] 1.2 Type checking passes: `npx astro check` — 1a6eb56
- [x] 1.3 Production build succeeds: `npm run build` — 1a6eb56
- [x] 1.4 Existing unit test suite passes: `npm run test` — 1a6eb56

#### Manual

- [x] 1.5 Signed-out `/` shows app name, "Not signed in", Sign in/Sign up, footer; no double header — 1a6eb56
- [x] 1.6 Signed-out auth pages (`/auth/signin`, `/auth/signup`, `/auth/confirm-email`) show header/footer — 1a6eb56
- [x] 1.7 Signed-in `/dashboard` shows app name, email, active Dashboard nav, inactive Tasks nav, sign-out, footer — 1a6eb56
- [x] 1.8 `/tasks` shows active Tasks nav, inactive Dashboard nav — 1a6eb56
- [x] 1.9 Sign-out from shared header works, redirect unchanged — 1a6eb56

### Phase 2: Remove duplicated per-page chrome

#### Automated

- [x] 2.1 Linting passes: `npm run lint` — ae903fd
- [x] 2.2 Type checking passes: `npx astro check` — ae903fd
- [x] 2.3 Production build succeeds: `npm run build` — ae903fd
- [x] 2.4 Existing unit test suite passes: `npm run test` — ae903fd

#### Manual

- [x] 2.5 Dashboard page has no duplicate welcome text, "Manage tasks" link, or second sign-out form — ae903fd
- [x] 2.6 Tasks page has no "← Back to dashboard" link — ae903fd
- [x] 2.7 Adding a task via `AddTaskDialog` still succeeds with success toast — ae903fd
- [x] 2.8 Existing task edit/complete/delete actions still succeed — ae903fd
- [x] 2.9 Full nav walkthrough between `/dashboard` and `/tasks` using only the shared header — ae903fd
