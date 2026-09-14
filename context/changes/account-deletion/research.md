---
date: 2026-09-14T10:34:02+02:00
researcher: Claude Code
git_commit: f249f32a23e5a7e324f4b3d4e31dd3f2214d6873
branch: feat/account-deletion
repository: banan1988/10x-home-maintenance
topic: "Account deletion (S-06 / MS-03) — implementation groundwork"
tags: [research, codebase, auth, supabase-admin, rls, api-routes, destructive-ui, gdpr]
status: complete
last_updated: 2026-09-14
last_updated_by: Claude Code
---

# Research: Account deletion (S-06 / MS-03) — implementation groundwork

**Date**: 2026-09-14T10:34:02+02:00
**Researcher**: Claude Code
**Git Commit**: f249f32a23e5a7e324f4b3d4e31dd3f2214d6873
**Branch**: feat/account-deletion
**Repository**: banan1988/10x-home-maintenance

## Research Question

What exists today in the codebase (client setup, auth/API conventions, UI patterns, testing conventions,
prior decisions) that an implementation plan for S-06 — "an authenticated user can, from a
strongly-confirmed UI action, trigger immediate deletion of their Supabase auth account; all of their
`maintenance_tasks` rows are removed as a consequence" (`context/foundation/roadmap.md:224-246`) — needs
to build on?

## Summary

Nothing needed for account deletion exists yet — this is a from-scratch build on top of solid existing
conventions:

- **No service-role/admin Supabase client exists anywhere.** Only the anon key (`SUPABASE_URL`/
  `SUPABASE_KEY`, both `context: "server"` / `access: "secret"`) is declared in `astro.config.mjs`. A new
  server-only service-role client (for `auth.admin.deleteUser`) must be added from scratch — new env var,
  new client factory, never touching the client bundle.
- **Two parallel, already-solid auth/API conventions exist to reuse, not reinvent**: a redirect-based pair
  (`requireUser` + `createClient`, form-post routes) and a JSON-API pair (`requireApiUser` +
  `requireApiClient`, `v1` routes). Account deletion is a JSON API action, so the `requireApiUser`/
  `requireApiClient`/`assertRequiresApiAuth` trio is the closer-matching precedent.
- **No "type to confirm" UI pattern exists anywhere**, and the shadcn `input`/`label` primitives aren't
  installed yet. The only existing destructive-confirm pattern (`DeleteTaskAlertDialog.tsx`) is a
  single-click form post with no client-side state — explicitly called out by the roadmap as too weak for
  whole-account deletion.
- **No migration is needed.** `maintenance_tasks.user_id` already has `ON DELETE CASCADE` to `auth.users`
  (confirmed in `maintenance-task-data-model/plan.md:69-70`, which explicitly deferred account deletion as
  "a fast-follow, not in this change's scope" — i.e., this cascade was pre-built for exactly this feature).
- **A proven real-RLS integration-test harness exists** (`isolation.integration.test.ts` +
  `supabase/seed.sql`, two seeded real users against local Supabase) that can be extended/mirrored to prove
  a deleted user's `maintenance_tasks` rows are actually gone.
- **Two standing lessons directly govern this change**: every `/api/*` route must use the shared auth-check
  contract (`lessons.md:105-122`), and any RLS-only ownership filter needs an inline comment
  (`lessons.md:124-136`) — though account deletion's own row (`auth.users`) will be acted on via the
  service-role client, not RLS, so this lesson mainly still applies to any read of `maintenance_tasks` the
  new flow might need before deleting.

## Detailed Findings

### 1. Supabase client setup — no service-role client exists

- `src/lib/supabase.ts:1-25` — the only Supabase client factory in the app. Uses `createServerClient` from
  `@supabase/ssr` (`@supabase/ssr@^0.10.3`, `@supabase/supabase-js@^2.99.1` per `package.json:26-27`),
  built per-request from `SUPABASE_URL`/`SUPABASE_KEY` (`astro:env/server`), bound to the incoming request's
  cookies. Returns `null` if either env var is unset — every caller must null-check.
- `astro.config.mjs:17-22` — env schema declares only:

  ```js
  SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
  SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
  ```

  No third service-role entry exists. `README.md:120-123` documents `SUPABASE_KEY` explicitly as the
  **anon public key** — reinforcing that a service-role key has never been wired into this app.
- Grepping the whole repo for `service_role`, `SUPABASE_SERVICE`, `admin.deleteUser`, `serviceRole` returns
  **zero matches** — confirmed independently by two separate research agents (client-setup agent and
  historical-context agent, the latter citing `context/changes/testing-auth-isolation-contract/research.md:112-115`
  as prior confirmation of the same fact).
- `src/middleware.ts:1-25` — `context.locals.user` is populated every request via the anon/cookie-scoped
  client's `supabase.auth.getUser()`. This is entirely session-dependent; a service-role client acting on
  `auth.admin.deleteUser(user.id)` would be a deliberately separate, session-independent client.
- `.env.example` exists (33 bytes) but its contents could not be read (blocked — never read `.env*` files;
  see project CLAUDE.md/global instructions). `.dev.vars` doesn't exist yet in this repo; per
  `README.md:81-84,99,118` the developer copies `SUPABASE_URL`/`SUPABASE_KEY` into both `.env` and
  `.dev.vars` manually. CI (`​.github/workflows/ci.yml:35-37,63-65,71-76`) injects the same two vars from
  GitHub Actions secrets into the build and as Cloudflare Workers secrets via `wrangler-action`.
  `wrangler.jsonc` has no `vars`/`secrets` block today.

**Implication for the plan**: adding a service-role client requires (a) a new `SUPABASE_SERVICE_ROLE_KEY`
entry in `astro.config.mjs`'s env schema (`context: "server"`, `access: "secret"`), (b) a new factory
function (e.g. alongside or in `src/lib/supabase.ts`) using `createClient` from `@supabase/supabase-js`
directly (not `createServerClient` — no cookie-bridging needed for a service-role client), (c) documenting
the new env var in `.env.example`/README's config table, and (d) wiring it into CI secrets and Cloudflare
Workers secrets the same way the existing two vars are.

### 2. Auth & API route conventions — two parallel contracts

Two auth-check styles coexist, matched to two response styles:

|                  | Redirect-style (form routes)                             | JSON-style (`v1` API routes)                                                         |
| ---------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Auth guard       | `requireUser(context)` — `src/lib/auth.ts:1-9`           | `requireApiUser(context)` — `src/lib/api-auth.ts`                                    |
| Client factory   | `createClient` (`src/lib/supabase.ts`) directly          | `requireApiClient(context)` — wraps `createClient`, returns 503 JSON if unconfigured |
| Success shape    | `context.redirect(...)`                                  | JSON body / `204 No Content`                                                         |
| Failure (unauth) | 302 to `/auth/signin`                                    | `401` JSON via `jsonError`                                                           |
| Test contract    | `assertRequiresAuth` (`src/test-utils/auth-contract.ts`) | `assertRequiresApiAuth` (`src/test-utils/api-auth-contract.ts`)                      |

Both follow the same `if (x instanceof Response) return x;` narrowing idiom. Reference implementations:
`src/pages/api/tasks/[id]/delete.ts:1-31` (redirect-style delete) and `src/pages/api/v1/tasks/[id].ts:71-92`
(JSON-style `DELETE` handler, returns bare `204` on success, `jsonError(404, ...)` on failure).

- `src/middleware.ts:4` — `PROTECTED_ROUTES = ["/dashboard", "/tasks"]` does **not** include `/api/...`;
  every API route must do its own auth check via one of the two guards above — there is no middleware-level
  protection to lean on for a new `/api/account/*` route.
- None of the three legacy auth routes (`signin.ts`, `signup.ts`, `signout.ts`) declare
  `export const prerender = false` or use zod — only the newer JSON (`v1`) and per-task mutation routes do.
  A new account-deletion route should follow the newer convention: `export const prerender = false;`, zod
  validation if any request body is needed (e.g. a confirmation phrase), JSON response shape.
- `src/pages/api/auth/signout.ts:1-10` shows how session/cookie clearing works: `supabase.auth.signOut()`
  triggers the `setAll` callback wired in `src/lib/supabase.ts:18-22`, which clears cookies on the response
  automatically — relevant because after `auth.admin.deleteUser(user.id)` runs (via the service-role
  client), the user's *existing* session cookie is still technically present client-side until an explicit
  sign-out/redirect clears it.

**Implication for the plan**: model the new route as `src/pages/api/account/delete.ts` (or similar),
JSON-style: `requireApiUser` for the auth check (the user must be proven authenticated before their own
account can be deleted), then a **separate service-role client** (not `requireApiClient`, which returns the
anon/cookie client) to actually call `auth.admin.deleteUser(user.id)`. After a successful admin delete, the
route should also sign out / clear the now-orphaned session cookie and redirect (or let the client-side
handle a hard redirect to `/`), since the deleted user's session cookie won't self-invalidate.

### 3. UI confirmation & page/nav patterns

- `src/components/tasks/DeleteTaskAlertDialog.tsx:1-41` — the only existing destructive-confirm component.
  Pure shadcn `AlertDialog` + `Button variant="destructive"`, single click via a native
  `<form method="POST" action="/api/tasks/{id}/delete">` — no client-side JS state, no loading/disabled
  state, no in-dialog error handling. Roadmap.md explicitly requires something **stronger** than this for
  account deletion (`roadmap.md:243-245`): e.g. type-your-email or a confirmation phrase before the delete
  button activates.
- `src/components/ui/` currently has: `alert-dialog.tsx`, `button.tsx`, `calendar.tsx`, `dialog.tsx`,
  `popover.tsx`, `select.tsx`, `sonner.tsx`, `table.tsx`, `LibBadge.astro`. **`input.tsx` and `label.tsx`
  are not installed** — a typed-confirmation field needs these added first (`npx shadcn@latest add input label`, per the `lessons.md` shadcn-add lesson: pass `-y -o`, then diff every touched file for `"cn"`
  literal imports / `next-themes` / missing `React` type imports before committing).
- No "type to confirm" pattern (disabled-until-value-matches input) exists anywhere in the codebase —
  confirmed by grep across all `.ts`/`.tsx` files. This must be built from scratch as a small React island
  (state: typed value; button `disabled` until it matches the required phrase/email).
- `src/components/Topbar.astro:1-37` — the shared header/nav component from S-05 (`shared-app-shell`). Only
  imported today by `src/components/Welcome.astro:2,28` (the landing page) — **not** wired into
  `dashboard.astro` or `tasks/index.astro` yet (that's S-05's own in-flight work). Renders user email +
  Dashboard link + inline sign-out form when a user is present.
- `src/layouts/Layout.astro:1-52` — minimal shell (`<slot />` + global `Toaster` + config-missing banner).
  Does not render `Topbar` itself; each page opts in individually. A new `src/pages/account/delete.astro` (or
  similar dedicated route) slots in the same way `dashboard.astro`/`tasks/index.astro` do:
  `<Layout title="..."><Topbar /> ...content... </Layout>`.
- `src/pages/dashboard.astro:49,81-88` and `src/pages/tasks/index.astro:30-33` hand-roll their own nav
  (inline sign-out form, "← Back to dashboard" link) — **must not be touched** by this change, per
  roadmap.md's explicit parallel-safety requirement with S-05 (both slices are "Parallel with" each other and
  S-05 also touches these two files). Account deletion needs its **own** page/entry point.
- `cn()` helper confirmed at `src/lib/utils.ts:1-7`: `cn(...inputs: ClassValue[]): string` (clsx + tailwind-merge).

**Implication for the plan**: build a new page (e.g. `src/pages/account/delete.astro`) wrapped in `Layout`

- `Topbar`, containing a new React island (e.g. `DeleteAccountForm.tsx`) with a type-to-confirm input
  (requires installing `input`/`label` shadcn components first) gating a destructive submit button that calls
  the new JSON API route. Do not link this page from `dashboard.astro`/`tasks/index.astro` in this change —
  that wiring, if desired, should either wait for S-05 to land or be added as a minimal, isolated addition
  that doesn't conflict with S-05's in-flight nav rework (confirm approach in the plan).

### 4. Testing conventions

- Two-tier Vitest setup: default `vitest.config.ts` excludes `**/*.integration.test.ts` (never touches
  Supabase — pure unit tests with mocked `createClient`); `vitest.integration.config.ts` includes only
  `*.integration.test.ts` files (`package.json` script: `test:integration`, requires local `npx supabase start` + `npx supabase db reset`).
- Unit-test pattern: `vi.hoisted()` to build a `createClientMock`, `vi.mock("@/lib/supabase", ...)`, then
  dynamic `await import("./route-file")` so the mock is active first. See
  `src/pages/api/tasks/[id]/delete.test.ts` (redirect-style reference) and
  `src/pages/api/v1/tasks/[id].test.ts` (JSON-style reference, also covers `GET`/`PATCH` in the same file).
  Both call the shared `assertRequiresAuth`/`assertRequiresApiAuth` helper as their first test case.
- Real-RLS integration tier: `src/pages/api/tasks/isolation.integration.test.ts` (154 lines) + `supabase/ seed.sql` (95 lines) seed two real `auth.users` + matching `auth.identities` rows (identities required
  alongside `auth.users` or `signInWithPassword` silently fails) plus one `maintenance_tasks` row each, then
  sign in as each and assert cross-user operations return zero rows/no error (anti-oracle pattern identical
  to a nonexistent-id case).
- `lessons.md:138-148` — every `it(...)` description must start with `"should "`.

**Implication for the plan**: a new unit test for the account-delete route should mock a **new**
service-role client factory (separately from `createClient`) plus `requireApiUser`, following the `v1`
JSON-style reference. The integration tier is the natural place to prove the end-to-end claim that matters
most for this feature — after calling `auth.admin.deleteUser` for a seeded user, their `maintenance_tasks`
rows are actually gone (extend `supabase/seed.sql`'s pattern, or add a small dedicated integration test file
following `isolation.integration.test.ts`'s structure, using the service-role client to perform the delete
and the anon/RLS client or a direct row count to verify cascade).

### 5. Historical context — no prior art exists, but explicit groundwork does

- **PRD has no RODO/GDPR/erasure language.** `context/foundation/prd.md` only covers per-task deletion
  (FR-007, permanent with no recovery, explicitly accepted for MVP) and generic CRUD-via-API (FR-011).
  Account-level deletion entered scope only via the roadmap's 2026-09-14 audit-sourced MS-03 anchor
  (`roadmap.md:39-41,285-286`) — this is a genuinely new capability, not a PRD-derived one.
- **The `ON DELETE CASCADE` FK was deliberately pre-built for this feature.**
  `context/changes/maintenance-task-data-model/plan.md:69-70`: "No account-deletion feature — only its `ON DELETE CASCADE` FK behavior is put in place now... account deletion is a fast-follow, not in this change's
  scope." Confirms no new migration is needed — deleting the `auth.users` row is sufficient for
  `maintenance_tasks` cleanup.
- **No service-role client, `auth.admin` usage, or destructive multi-step confirmation UI exists in any
  implemented change.** `context/changes/testing-auth-isolation-contract/research.md:112-115` and
  `plan.md:23,45,79` explicitly confirm the isolation-contract work deliberately built **no**
  admin/service-role tooling — every integration test signs in as an ordinary user via the anon key. The
  only place `auth.admin.deleteUser` is mentioned anywhere in the repo is the roadmap's own prescriptive
  S-06 write-up (`roadmap.md:236`) — planned, not implemented.
- **Standing lessons that directly apply**: `lessons.md:105-122` (every `/api/*` route must call
  `requireApiUser`/`requireUser`, never an inline check) and `lessons.md:124-136` (RLS-only ownership
  filters need an inline comment pointing at the migration). The second lesson is less central here since
  the account-delete action itself operates via the service-role client (bypasses RLS by design, that's the
  point of a service-role key) rather than relying on RLS — but if the plan reads any `maintenance_tasks`
  data as part of the flow (e.g., to show a summary before deletion), that read must still go through the
  normal per-user anon client and follow the RLS-comment convention.
- `context/changes/account-deletion/change.md` is currently just the identity stub created by `/10x-new`
  (now `status: preparing` as of this research pass) — no plan.md exists yet.

## Code References

- `src/lib/supabase.ts:1-25` — the only existing Supabase client factory (anon/cookie-scoped SSR client)
- `astro.config.mjs:17-22` — env schema; only `SUPABASE_URL`/`SUPABASE_KEY` declared today
- `src/middleware.ts:1-25` — request-scoped user resolution; `PROTECTED_ROUTES` excludes `/api/*`
- `src/lib/auth.ts:1-9` — `requireUser(context)` (redirect-style auth guard)
- `src/lib/api-auth.ts` — `requireApiUser(context)` / `requireApiClient(context)` (JSON-style)
- `src/pages/api/tasks/[id]/delete.ts:1-31` — redirect-style delete route reference, RLS-comment convention
- `src/pages/api/v1/tasks/[id].ts:71-92` — JSON-style `DELETE` handler reference (204/`jsonError`)
- `src/pages/api/auth/signout.ts:1-10` — session/cookie clearing via `supabase.auth.signOut()`
- `src/test-utils/auth-contract.ts` / `src/test-utils/api-auth-contract.ts` — shared unauth test assertions
- `src/pages/api/tasks/[id]/delete.test.ts` / `src/pages/api/v1/tasks/[id].test.ts` — reference test files
- `src/pages/api/tasks/isolation.integration.test.ts` + `supabase/seed.sql` — real-RLS two-user harness
- `src/components/tasks/DeleteTaskAlertDialog.tsx:1-41` — existing (too-weak) single-click confirm pattern
- `src/components/ui/` — installed shadcn components (`input`/`label` missing, needed for type-to-confirm)
- `src/components/Topbar.astro:1-37` — shared header (only wired into the landing page today)
- `src/layouts/Layout.astro:1-52` — page shell every new page composes with
- `src/lib/utils.ts:1-7` — `cn()` helper
- `supabase/migrations/20260827194321_create_maintenance_tasks.sql` — has the `ON DELETE CASCADE` FK already

## Architecture Insights

- The codebase deliberately keeps **auth-check** (app layer) and **ownership-check** (DB/RLS layer)
  separate for `maintenance_tasks` mutations — never a redundant `user_id` filter, always an inline comment
  when a query relies on RLS alone. Account deletion breaks this pattern by design: the delete itself must
  happen via a service-role client that intentionally *bypasses* RLS (RLS only applies to a user acting on
  their own `auth.uid()`; `auth.admin.deleteUser` is an out-of-band GoTrue admin operation, not a table
  query at all), so this isn't a lesson violation — it's a genuinely different mechanism that the existing
  lessons don't cover and the plan should state explicitly.
- Two full parallel conventions (redirect-style vs. JSON-style) coexist for historical reasons (form routes
  came first, `v1` JSON API came later for FR-011). The JSON-style pair is the more actively-maintained
  convention and the one this new route should follow, since account deletion is naturally a JSON API action
  invoked from a React island, not a plain HTML form post.
- Destructive-action UI in this app has so far only reached "single click + native form post" maturity
  (`DeleteTaskAlertDialog.tsx`). A type-to-confirm React island is a new UI pattern for this codebase, not
  an established one to copy — the plan should treat this as new client-side state to design carefully
  (loading/disabled/error states the existing dialog doesn't have either).

## Historical Context (from prior changes)

- `context/changes/maintenance-task-data-model/plan.md:69-70` — cascade FK pre-built for this feature
- `context/changes/testing-auth-isolation-contract/research.md:112-115`, `plan.md:23,45,79` — confirms no
  service-role/admin tooling exists yet; the isolation contract's cross-user tests all use the anon key
- `context/changes/manage-maintenance-tasks/plan.md:374-439` — original design of `DeleteTaskAlertDialog.tsx`
  and the single-task delete route, including its manual (later automated) cross-user verification step
- `context/foundation/roadmap.md:224-246` — S-06's own risk section; the only existing design-level thinking
  on this feature (rejects 30-day soft-delete, specifies `auth.admin.deleteUser`, flags the need for a
  service-role client and a stronger confirmation UI, and requires a separate entry point from the dashboard)
- `context/foundation/lessons.md:105-122,124-136,138-148` — shared auth-check contract, RLS-comment
  convention, and `it("should ...")` naming, all applicable to any new route/test this change adds

## Related Research

- `context/changes/testing-auth-isolation-contract/research.md` — origin of the `requireUser`/
  `assertRequiresAuth` contract and the anti-oracle (identical response for cross-user vs. nonexistent)
  design this change should preserve for any `maintenance_tasks` reads it performs
- `context/changes/manage-maintenance-tasks/plan.md` — origin of the single-click delete pattern this
  change must exceed

## Open Questions

- **Session invalidation for the requester's own browser tab.** After `auth.admin.deleteUser` runs, does
  the current request's session cookie need explicit clearing (e.g. call `supabase.auth.signOut()` on the
  request-scoped client too, or just redirect and let the next `getUser()` call naturally fail), or is a
  hard redirect to `/` with cookie-clearing sufficient? Needs a decision in the plan.
- **What happens to other active sessions/devices for the deleted user?** `auth.admin.deleteUser` deletes
  the user record in GoTrue; whether existing JWTs for other sessions are immediately rejected or continue
  to validate until expiry is a Supabase/GoTrue behavior question worth confirming against current Supabase
  docs (per this project's global instruction to verify library behavior via context7 rather than assume).
- **Exact confirmation UX**: type-your-email vs. a fixed phrase (e.g. "DELETE") — roadmap.md offers both as
  examples without picking one; the plan should decide and justify.
- **Whether/how a link to the new delete-account entry point gets added anywhere** (e.g. a "Danger zone"
  section somewhere), given the explicit constraint not to touch `dashboard.astro`/`tasks/index.astro` while
  S-05 is in flight. The roadmap says "give the delete action its own page/entry point" but doesn't specify
  whether that page needs to be discoverable yet or can land un-linked pending S-05.
