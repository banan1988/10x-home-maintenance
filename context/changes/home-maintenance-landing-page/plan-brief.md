# Home Maintenance Landing Page — Plan Brief

> Full plan: `context/changes/home-maintenance-landing-page/plan.md`
> Research: `context/changes/home-maintenance-landing-page/research.md`

## What & Why

Replace the untouched 10x-Astro-Starter landing page with real Home Maintenance product content: a problem
statement, a value proposition, and a CTA to sign up/sign in — so a demoable MVP doesn't greet a first-time
visitor with generic starter copy about a "cosmic developer experience." (Roadmap S-04 / PRD ref `MS-01`.)

## Starting Point

`src/pages/index.astro` renders `<Layout><Welcome /></Layout>` with no `title` prop. `Welcome.astro` is still the
unmodified starter template: H1 "10x Astro Starter," a subhead about the starter's tooling, and three feature
cards about auth/stack/DX — nothing about home maintenance. The shared header/footer shell (`shared-app-shell`,
done) already wraps every page and already branches its own nav/CTA on `Astro.locals.user` — this change only
touches page-body content, not the shell.

## Desired End State

A first-time visitor sees an accurate browser tab title, a hero stating the real problem ("what in my home needs
attention right now?") and value proposition (automatic OK/DUE SOON/OVERDUE status), a three-step "how it works"
section, and a CTA to sign up (or sign in). A returning signed-in visitor sees the same content but with a single
"Go to Dashboard" CTA instead.

## Key Decisions Made

| Decision               | Choice                                                                           | Why (1 sentence)                                                                                                              | Source   |
| ---------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------- |
| Content below the hero | Three-step "how it works" (add task → auto status → dashboard)                   | Explains the product's actual mechanism instead of generic marketing fluff, using the PRD's MVP flow.                         | Plan     |
| Signed-in visitor CTA  | Branch to a single "Go to Dashboard" link                                        | Avoids pitching sign-up to someone already signed in; trivial since `Astro.locals.user` is already set.                       | Plan     |
| Meta tags              | Add `<meta name="description">` only, via a new optional `Layout.astro` prop     | Cheap, real value for a "demoable MVP"; Open Graph would need a new image asset — out of scope.                               | Plan     |
| CTA button styling     | Keep hand-rolled `<a>` tags (not shadcn `Button`)                                | `Button`'s light-mode-tuned tokens don't match the dark `bg-cosmic` hero until S-07 restyles it.                              | Plan     |
| Shared header/footer   | Untouched                                                                        | Already built and owned by `shared-app-shell` (done); out of scope here.                                                      | Research |
| Testing approach       | No new automated tests; lint/typecheck/build/existing suite + manual walkthrough | Matches the `shared-app-shell` precedent for UI-only changes; e2e tooling doesn't exist yet (test-plan Phase 5, not started). | Research |

## Scope

**In scope:**

- `src/layouts/Layout.astro` — new optional `description` prop + conditional meta tag
- `src/pages/index.astro` — real `title`/`description` values
- `src/components/Welcome.astro` — full hero/CTA/how-it-works content rewrite, with signed-in/out branching

**Out of scope:**

- Any change to `Header.astro`, `Footer.astro`, or the `Layout.astro` Header/Footer/Toaster wiring
- Open Graph tags / social preview image
- Introducing the shadcn `Button` component
- Any new automated test type (e.g. Playwright/e2e)
- Renaming `Welcome.astro`

## Architecture / Approach

Single Astro page, single component. `Welcome.astro` gains a frontmatter block (`const { user } = Astro.locals;`)
— the same pattern `Header.astro` already uses — to branch its CTA server-side, with no new client-side
JavaScript. No new dependencies, API routes, or data model.

## Phases at a Glance

| Phase                                                        | What it delivers                                                              | Key risk                                                                                                                                      |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Rewrite landing page content, title, and meta description | New hero/how-it-works/CTA copy, real title + meta description, auth-aware CTA | Hero styling isn't final — S-07 (`unified-visual-theme`, in flight) may restyle the `bg-cosmic` look later, same as it will for Header/Footer |

**Prerequisites:** `shared-app-shell` (done) — this change relies on its Header/Footer shell being in place.
**Estimated effort:** ~1 session, single phase, 3 files.

## Open Risks & Assumptions

- S-07 (`unified-visual-theme`) hasn't landed yet; this change's hero styling is not final-palette-locked and may
  need a follow-up restyle once S-07 ships, same as `Header.astro`/`Footer.astro` already expect.
- `npx astro check` has documented pre-existing failures unrelated to prior changes — don't attribute a failure
  here to this change without first confirming it against a clean `main` run.

## Success Criteria (Summary)

- A first-time, signed-out visitor to `/` sees real Home Maintenance content (title, hero, how-it-works, CTA) —
  no trace of "10x Astro Starter" or "cosmic developer experience" remains.
- A signed-in visitor to `/` sees a "Go to Dashboard" CTA instead of sign-up/sign-in links.
- The shared header/footer render unchanged in both states.
