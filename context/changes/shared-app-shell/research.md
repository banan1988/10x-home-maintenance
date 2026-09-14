---
date: 2026-09-14T08:33:22+0000
researcher: banan1988
git_commit: 5ad23ed9c24690de5fdb1e6f0087ecf2b739971f
branch: feat/shared-app-shell
repository: banan1988/10x-home-maintenance
topic: "One consistent header, nav, and footer across every authenticated page (S-05)"
tags: [research, codebase, astro, layout, navigation, ui-shell, auth]
status: complete
last_updated: 2026-09-14
last_updated_by: banan1988
---

# Research: One consistent header, nav, and footer across every authenticated page (S-05)

**Date**: 2026-09-14T08:33:22+0000
**Researcher**: banan1988
**Git Commit**: 5ad23ed9c24690de5fdb1e6f0087ecf2b739971f
**Branch**: feat/shared-app-shell
**Repository**: banan1988/10x-home-maintenance

## Research Question

Per `context/foundation/roadmap.md` slice S-05 (`shared-app-shell`): how is page chrome (header/nav/footer)
currently composed across the app, what building blocks already exist, and what must a shared app-shell
consolidate or add so every authenticated page renders one consistent header (app name, nav: Dashboard/Tasks,
user menu with sign-out) and footer, instead of three divergent ad-hoc patterns?

## Summary

The app currently has **three divergent, duplicated navigation patterns** across its 6 pages, and **no footer
anywhere**:

1. **`src/components/Topbar.astro`** — a fully-working signed-in/signed-out header (email + Dashboard link +
   sign-out form, or Sign in/Sign up links) that reads `Astro.locals.user` directly. It already implements the
   correct logic end-to-end, but is wired into only one page: `index.astro` (via `Welcome.astro`).
1. **`src/pages/dashboard.astro`** hand-rolls its own header div (`h1` + "Welcome, {email}" + a "Manage tasks"
   link) and, separately, its own inline sign-out `<form>` at the bottom of the page — a second, differently
   styled copy of the same sign-out markup `Topbar.astro` already has.
1. **`src/pages/tasks/index.astro`** has only a bare "← Back to dashboard" link — no user email, no sign-out
   control at all.

`src/layouts/Layout.astro`, the one shared wrapper every page already uses, contributes **zero** header/nav/
footer scaffolding today — it only accepts a `title` prop, renders a `<slot />`, a config-missing `Banner`, and
a global `Toaster`. This is the root cause: nothing forces pages to share chrome, so each one improvised.

The good news: this is largely a **consolidation task, not a from-scratch build**. `Topbar.astro`'s
logged-in/logged-out logic, the `/api/auth/signout` POST-form pattern, and the `Astro.locals.user` access
pattern are all already correct and tested-by-existing-use — they just need to move into (or be invoked from)
`Layout.astro` so every page inherits them, and the two duplicate/partial header patterns in `dashboard.astro`
and `tasks/index.astro` need to be deleted in favor of the shared component. A footer needs to be built new —
none exists. A user-menu dropdown (if the roadmap's "user menu" outcome is read as a dropdown rather than
inline links) would need a new shadcn component (`dropdown-menu`, not yet installed).

## Detailed Findings

### Current page-chrome inventory (3 divergent patterns, 6 pages total)

- **`src/components/Topbar.astro`** (38 lines, plain Astro component, no React island) — reads
  `Astro.locals.user` directly (line 2, no props). Signed-in: shows `user.email`, a `/dashboard` link, and an
  inline `<form method="POST" action="/api/auth/signout">` (lines 16–20). Signed-out: shows "Not signed in" +
  Sign in/Sign up links. **Only usage site**: imported and rendered by `src/components/Welcome.astro:2,28`,
  which is only rendered by `src/pages/index.astro`. No other page uses it.
- **`src/layouts/Layout.astro`** (52 lines) — accepts only `title?: string` (default `"10x Astro Starter"`,
  still the unreplaced starter default). Exposes one unnamed `<slot />`. Renders `missingConfigs` `Banner`
  warnings and a global `<Toaster client:load />`. **No header/nav/footer prop or slot exists at all** — this
  is the single wrapper every page uses, and the gap this change must close.
- **`src/pages/dashboard.astro`** (102 lines) — its own header block (lines 40–53: `h1`, "Welcome, {email}",
  a `/tasks` "Manage tasks" link, plus the `AddTaskDialog` island) and, separately, a duplicated inline
  sign-out `<form method="POST" action="/api/auth/signout">` at lines 81–88 with different button styling than
  `Topbar.astro`'s copy. Reads `Astro.locals.user` itself (line 9), duplicating `Topbar.astro`'s access
  pattern instead of reusing it.
- **`src/pages/tasks/index.astro`** (38 lines, the only file under `src/pages/tasks/`) — header block (lines
  30–33) is just `h1` + a single "← Back to dashboard" link. No email shown, no sign-out control present on
  this page at all.
- **`src/pages/index.astro`** (8 lines) — delegates to `Welcome.astro`, which renders `Topbar.astro` inside its
  hero. No footer.
- **Auth pages** (`src/pages/auth/{signin,signup,confirm-email}.astro`, 23/23/37 lines) — none render any
  header/nav/footer; each is a bare centered card with only a plain link back to the sibling auth page.
- **No footer component exists anywhere in the repo** (`find ... -iname "*footer*"` → empty). No user-menu
  component exists either (`find ... -iname "*usermenu*"` → empty) — the email+sign-out block is inlined
  wherever it appears, never factored out.
- Full page list is exactly 6 `.astro` files: `index.astro`, `dashboard.astro`, `tasks/index.astro`,
  `auth/signin.astro`, `auth/signup.astro`, `auth/confirm-email.astro`. (API routes under `src/pages/api/**`
  render no markup and are out of scope.)

### Auth/middleware data available to a shared shell

- **`src/middleware.ts:4`** — `PROTECTED_ROUTES = ["/dashboard", "/tasks"]`, matched via `startsWith`, so
  `/tasks/*` sub-paths are covered too. Unauthenticated access to a protected route redirects to
  `/auth/signin` (line 20). `index.astro` and the auth pages are **not** protected routes.
- **`context.locals.user`** is populated on every request by `src/middleware.ts:6–16` via
  `createClient(...).auth.getUser()`, typed in `src/env.d.ts:1–5` as the full Supabase
  `User | null` (never `undefined`). Any `.astro` file (page, layout, or Astro component) can read
  `Astro.locals.user` directly with zero prop plumbing — `Topbar.astro` and `dashboard.astro` already both do
  this independently. `Layout.astro` itself does not currently read or forward it.
- **React islands cannot read `Astro.locals`** — none of the existing islands (`AddTaskDialog`, `TaskList`,
  etc.) receive a `user` prop today. A React-based part of a shell (e.g. an interactive dropdown menu) would
  need `user`/`email` passed in explicitly from the enclosing `.astro` file, e.g.
  `<UserMenu client:load user={Astro.locals.user} />`.
- **`src/lib/supabase.ts`** exports only `createClient(requestHeaders, cookies)` — no "get current user"
  convenience helper. **`src/lib/auth.ts`** exposes `requireUser(context)` (page-level guard, redirects to
  `/auth/signin`); **`src/lib/api-auth.ts`** exposes `requireApiUser`/`requireApiClient` for API routes
  (JSON 401/503 instead of redirect). Neither is a "fetch the current user for display" helper — that's just
  `Astro.locals.user`.
- **`src/pages/api/auth/signout.ts`** — `POST`-only, calls `supabase.auth.signOut()`, always redirects to `/`.
  Both existing call sites (`Topbar.astro:16–20`, `dashboard.astro:81–88`) POST to it via a plain HTML
  `<form>`, no fetch/JS. `signin.ts`/`signup.ts` follow the same form-POST + full-page-redirect +
  `?error=` query-param convention — the whole auth flow has no client-side session state. A shared shell's
  sign-out control should stay a form-POST, not switch to a fetch call.
- **`src/types.ts`** has no auth/user types — the canonical type is `App.Locals["user"]`
  (`import("@supabase/supabase-js").User | null`, from `src/env.d.ts`). New shell code should reuse that
  rather than adding a duplicate type.

### UI component + styling conventions available

- **shadcn "new-york" style**, base color `neutral`, CSS variables enabled, no Tailwind prefix, icon library
  `lucide` (`components.json`). Aliases: `@/components`, `@/components/ui`, `@/lib/utils`, `@/lib`, `@/hooks`.
- **Installed today**: `alert-dialog`, `button`, `calendar`, `dialog`, `popover`, `select`, `sonner`, `table`
  (`src/components/ui/*.tsx`) plus the custom (non-shadcn) `src/components/ui/LibBadge.astro`.
- **Not installed**: `dropdown-menu`, `navigation-menu`, `avatar`, `separator` — any of these needed for a
  user-menu dropdown or a styled nav bar would require `npx shadcn@latest add <name> -y -o` (both flags — see
  Historical Context lesson below).
- **`cn()` helper** (`src/lib/utils.ts:1–6`) is the standard `clsx` → `twMerge` composition; existing usage
  examples: `src/components/auth/FormField.tsx:51–54` (base class constant + conditional variant via `cn()`)
  and the shadcn primitives themselves.
- **React + Tailwind wiring**: `@astrojs/react` integration (`astro.config.mjs:4,12`), Tailwind 4 via
  `@tailwindcss/vite` (`astro.config.mjs:6,14`, no separate `tailwind.config.js`), global stylesheet
  `src/styles/global.css` (OKLCH design tokens under `:root`, referenced by `components.json`'s `tailwind.css`
  field) — any new shared-shell markup must resolve against this file's existing tokens rather than
  introducing new ad-hoc colors.
- **`src/components/tasks/DeleteTaskAlertDialog.tsx`** shows this codebase's pattern for composing a shadcn
  primitive (`AlertDialog`) with a plain `<form method="POST" action=...>` for a destructive server action —
  a useful precedent if the shell's sign-out ever needs a confirm step (the roadmap doesn't ask for one here,
  unlike S-06's account deletion).

## Code References

- `src/components/Topbar.astro:1-38` — existing, correct signed-in/signed-out header logic; only wired into
  `index.astro` today.
- `src/layouts/Layout.astro:1-52` — the single shared page wrapper; no header/nav/footer scaffolding, `title`
  prop only, one unnamed `<slot />`.
- `src/pages/dashboard.astro:9,40-53,81-88` — duplicated `Astro.locals.user` read, ad-hoc header block, and a
  second independent copy of the sign-out form.
- `src/pages/tasks/index.astro:30-33` — bare back-link pattern, no email/sign-out.
- `src/pages/index.astro:1-8`, `src/components/Welcome.astro:2,28` — the only current `Topbar.astro` call
  site.
- `src/pages/auth/signin.astro:8`, `src/pages/auth/signup.astro:8`, `src/pages/auth/confirm-email.astro:21` —
  no chrome, each just passes a `title` to `Layout`.
- `src/middleware.ts:4,6-24` — `PROTECTED_ROUTES`, `Astro.locals.user` population, signin redirect.
- `src/env.d.ts:1-5` — `App.Locals.user` type.
- `src/pages/api/auth/signout.ts:1-10` — the shared sign-out endpoint both existing forms POST to.
- `src/lib/supabase.ts:1-10`, `src/lib/auth.ts`, `src/lib/api-auth.ts` — client/guard helpers; no
  "current user" convenience export beyond `Astro.locals.user`.
- `components.json`, `src/lib/utils.ts:1-6`, `src/styles/global.css:1-40` — shadcn config, `cn()` helper,
  design-token stylesheet a new shell must stay consistent with.
- `src/components/ui/*.tsx` — installed shadcn primitives; `dropdown-menu`/`navigation-menu`/`avatar`/
  `separator` are absent and would need installing for a dropdown-style user menu.

## Architecture Insights

- **`Layout.astro` is the correct integration point.** Every one of the 6 pages already wraps its content in
  `<Layout title="...">`, so extending `Layout.astro` (new props and/or rendering a shared header/footer
  component around `<slot />`) automatically reaches every page in one place, rather than editing 6 files
  individually. The alternative — a separate wrapping component pages opt into — would leave room for a 7th
  page to forget to adopt it; `Layout.astro` itself does not have that gap since it's already universal.
- **This is consolidation, not new design.** `Topbar.astro` already has correct, working signed-in/signed-out
  logic against `Astro.locals.user` and the real `/api/auth/signout` endpoint. The main implementation work is
  moving/adapting that logic into `Layout.astro`'s render path, deleting the two duplicate copies in
  `dashboard.astro` and `tasks/index.astro`, and adding a footer (which has no precedent to reuse — net new).
- **Auth pages and the landing page are unprotected but still in scope.** `PROTECTED_ROUTES` only covers
  `/dashboard` and `/tasks`; `index.astro` and `/auth/*` render regardless of auth state. The roadmap's Risk
  note and cross-references (S-04's Prerequisites, S-06's parallel-safety note) confirm `index.astro` is
  expected to end up wrapped in the same persistent chrome, so the shell's signed-out state (Sign in/Sign up
  links, as `Topbar.astro` already renders) matters, not just the signed-in nav.
- **No React island currently needs `user` as a prop.** If the "user menu" in the roadmap outcome is built as
  an interactive dropdown (shadcn `dropdown-menu`, a React component), it would be the first island in this
  codebase to receive `user`/`email` via a prop from an `.astro` parent — everything else today is either pure
  Astro reading `Astro.locals` directly, or an island with no user-dependent rendering. Simpler alternative:
  keep the user menu as plain Astro markup (like `Topbar.astro` already does) with no new shadcn install
  needed, if a dropdown isn't actually required by the roadmap's plain-language outcome ("user menu with
  sign-out" doesn't necessarily mean a `<DropdownMenu>` widget).
- **The auth flow is fully form-POST + redirect based**, with no client-side session state and no fetch/JSON
  calls anywhere in the existing auth code path. A shared shell's sign-out control should preserve that
  convention rather than introducing a fetch-based sign-out.

## Historical Context (from prior changes)

- `context/foundation/roadmap.md:206-221` (S-05 section) — the roadmap's own scoping already names the exact
  three ad-hoc patterns (`Topbar.astro` landing-only, `dashboard.astro`'s inline sign-out form,
  `tasks/index.astro`'s back-link) as the audit finding driving this change; the outcome statement is "same
  header (app name, nav: Dashboard/Tasks, user menu with sign-out) and footer on every authenticated page."
- `context/foundation/roadmap.md:87,193-196` (Streams table + S-04 Prerequisites) — confirms `Layout.astro` and
  `index.astro` are the composition points this change touches, and that S-04 (landing-page rewrite) is
  deliberately sequenced *after* this change specifically to avoid redesigning the hero twice once shared
  chrome exists.
- `context/foundation/roadmap.md:241-243` (S-06's note) — S-06 (account deletion, parallel with this change)
  already designs around `dashboard.astro` being touched by S-05, and deliberately avoids adding its own entry
  point to `dashboard.astro` to stay parallel-safe.
- `context/changes/first-task-on-dashboard/plan.md:26`, `context/changes/manage-maintenance-tasks/plan.md:17`
  — both confirm `Layout.astro` already mounts a global `<Toaster client:load />`; this change must not
  disturb that existing mount when adding shell markup.
- `context/changes/manage-maintenance-tasks/plan.md:245` — this is the plan that actually *built* the
  "Manage tasks" link in `dashboard.astro` and the "Back to dashboard" link in `tasks/index.astro`, confirming
  those ad-hoc per-page links were an intentional (if minimal) choice at the time, now superseded by this
  change's consolidation goal.
- **No prior change or archived slice has ever decided anything about header/nav/footer composition,
  extracting a shared layout component, or a user-menu widget** — this is genuinely new ground, not a
  re-decision. `context/archive/` is empty (no archived changes yet).
- **Relevant lesson**: *"`npx shadcn add` needs `-y` AND `-o`, and its generated imports need manual
  remapping"* (`context/foundation/lessons.md`) — directly applicable the moment this change installs
  `dropdown-menu` (or any other new shadcn primitive) for a user menu: pass both flags, then diff every
  touched file for stray `"cn"` imports, unwanted `next-themes` imports, and missing `React` type imports;
  run `npm run build && npm run lint && npm run test` afterward, not just `shadcn diff` beforehand.
  Non-UI lessons (Postgres `search_path`, roadmap-sync timing, RLS-ownership comments, date-validation grace
  window, string `.max()`, `it("should ...")` test titles) are not relevant to this change's scope.

## Related Research

- `context/changes/maintenance-tasks-api/research.md` — establishes this repo's research-doc conventions
  (frontmatter fields, researcher/repository naming) followed here.
- `context/changes/manage-maintenance-tasks/research.md` (Decision 4) — prior shadcn multi-component install
  batch, source of the `-y -o` lesson above.

## Open Questions

- **Is "user menu" a dropdown, or is `Topbar.astro`'s existing plain-link style sufficient?** The roadmap's
  wording ("user menu with sign-out") is plain language, not a UI-widget spec. Building it as a dropdown adds
  a new shadcn install (`dropdown-menu`, possibly `avatar`); reusing `Topbar.astro`'s existing inline-links
  approach needs zero new dependencies. This is a design decision for `/10x-plan`, not something research can
  resolve — flagging it as the main open choice.
- **Footer content**: the roadmap only says "footer on every authenticated page" with no content spec (no
  copyright text, links, or structure implied anywhere in the PRD/roadmap). `/10x-plan` will need to decide
  minimal footer content since there's no precedent anywhere in the codebase to draw from.
- **Does the shell wrap `index.astro` and the auth pages, or only the two `PROTECTED_ROUTES` pages?** The
  roadmap outcome says "every authenticated page," but cross-references (S-04's Prerequisites, S-06's note)
  imply `index.astro` will also end up under the same chrome eventually. Whether *this* change should already
  wrap `index.astro`/auth pages (signed-out header state) or defer that to S-04 is a scoping call for
  `/10x-plan`.
