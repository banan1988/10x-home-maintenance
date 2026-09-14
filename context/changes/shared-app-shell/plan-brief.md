# Shared App Shell (Header, Nav, Footer) — Plan Brief

> Full plan: `context/changes/shared-app-shell/plan.md`
> Research: `context/changes/shared-app-shell/research.md`

## What & Why

Every page today builds its own header/nav/sign-out chrome ad hoc — three divergent patterns across 6 pages —
and no page has a footer. This plan consolidates them into one shared shell so every page renders the same
header (app name, Dashboard/Tasks nav, user email + sign-out) and footer, instead of each page improvising.

## Starting Point

`Topbar.astro` already has correct signed-in/signed-out logic (email, Dashboard link, POST-form sign-out) but is
only wired into the landing page. `dashboard.astro` hand-rolls its own header and a second, differently-styled
sign-out form. `tasks/index.astro` has only a bare "← Back to dashboard" link — no email, no sign-out at all.
`Layout.astro`, the one wrapper every page already uses, contributes zero header/nav/footer scaffolding today.

## Desired End State

All 6 pages (landing, dashboard, tasks, and the 3 auth pages) render the same header and footer, supplied once by
`Layout.astro`. The header shows app name + Dashboard/Tasks nav (current page highlighted) + email + sign-out
when signed in, or Sign in/Sign up when signed out. No page contains its own duplicate header, back-link, or
sign-out form.

## Key Decisions Made

| Decision                 | Choice                                                                       | Why (1 sentence)                                                                              | Source |
| ------------------------ | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------ |
| User menu style          | Plain inline links (reuse `Topbar.astro`'s pattern)                          | Zero new dependencies; roadmap wording doesn't require a dropdown widget                      | Plan   |
| Footer content           | Minimal — app name + current year, no links                                  | No legal/support pages exist yet; avoids shipping dead links                                  | Plan   |
| Page scope               | All 6 pages, not just the 2 protected routes                                 | Roadmap's own S-04 note expects the landing page to already sit under this shell              | Plan   |
| Active nav indication    | Yes — highlight current page (Dashboard vs Tasks)                            | Cheap, pure server-side comparison (`Astro.url.pathname`), no new dependency                  | Plan   |
| Mobile nav               | Inline, wraps via flexbox — no hamburger                                     | Only 2 nav links + email; a collapsible widget is disproportionate                            | Plan   |
| Testing bar              | Lint + typecheck + build + existing Vitest suite; manual browser walkthrough | No UI component-test tool exists yet — that choice belongs to test-plan.md's own Phase 2      | Plan   |
| Header/Footer background | Each carries its own `bg-cosmic` styling independently                       | Avoids restructuring `Layout.astro` into a flex/sticky-footer box model; keeps the diff small | Plan   |

## Scope

**In scope:**

- New `src/components/layout/Header.astro` and `Footer.astro`
- Wiring both into `src/layouts/Layout.astro`
- Deleting `src/components/Topbar.astro` and its only usage site (`Welcome.astro`)
- Removing duplicated chrome from `dashboard.astro` and `tasks/index.astro`

**Out of scope:**

- Landing page hero/copy rewrite (S-04)
- Dropdown user menu / new shadcn components
- Footer nav or legal links
- Mobile hamburger nav
- UI component tests / test-tool selection
- Account-deletion entry points (S-06)

## Architecture / Approach

`Layout.astro` is the single wrapper every page already uses, so it's the one place to add shared chrome. Two new
components (`Header.astro`, `Footer.astro`) read `Astro.locals.user` and `Astro.url.pathname` directly — no props
needed — and render around the existing `<slot />`. Each carries its own `bg-cosmic` background so it blends with
every page's existing dark content div, without touching that div or restructuring `Layout.astro`'s box model.

## Phases at a Glance

| Phase                                | What it delivers                                                                          | Key risk                                                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1. Build and wire the shared shell   | New `Header`/`Footer`, wired into `Layout.astro`; `Topbar.astro` retired                  | Header/footer look visually disjointed from per-page cosmic backgrounds if the shared-color approach isn't applied consistently |
| 2. Remove duplicated per-page chrome | `dashboard.astro` and `tasks/index.astro` cleaned of redundant header/nav/sign-out markup | Deleting the wrong lines could regress the still-functional `AddTaskDialog`/`TaskList` islands on those pages                   |

**Prerequisites:** None — no blockers, can proceed immediately.
**Estimated effort:** ~1 session across 2 phases (small, well-scoped consolidation, no new dependencies).

## Open Risks & Assumptions

- Assumes `bg-cosmic` applied independently to 3 stacked elements (header, page content, footer) reads as visually
  continuous enough for this MVP — not a perfectly seamless single gradient, but same color family at the seams.
- Assumes no automated regression coverage is needed for the new markup itself, per the testing-bar decision above
  (manual walkthrough is the primary gate until test-plan.md's own Phase 2 introduces component tests).

## Success Criteria (Summary)

- Every one of the 6 pages shows the same header and footer, in both signed-in and signed-out states.
- No page contains its own duplicate header, back-link, or sign-out form.
- `npm run lint`, `npx astro check`, `npm run build`, and `npm run test` all pass after both phases.
