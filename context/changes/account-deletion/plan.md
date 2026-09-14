# Account Deletion Implementation Plan

## Overview

Add a self-service, irreversible "delete my account" flow (RODO/GDPR right to erasure, roadmap S-06/MS-03).
An authenticated user reaches an unlinked `/account/delete` page, types their own email to unlock a
destructive button, confirms a second "are you sure?" dialog, and triggers a `DELETE /api/v1/account`
call. The route validates the confirmation server-side, deletes the Supabase auth user via a new
service-role client (`auth.admin.deleteUser`), clears the requester's session cookies, and lands them on
a goodbye page. `maintenance_tasks` rows cascade-delete automatically via an existing FK — no migration
needed.

## Current State Analysis

Nothing for this feature exists yet. Two parallel auth/API conventions already exist and are solid
(redirect-style `requireUser`/`createClient` vs. JSON-style `requireApiUser`/`requireApiClient`); this
change extends the JSON-style pair. No service-role/admin Supabase client exists anywhere in the app —
only the anon key is wired into `astro.config.mjs`'s env schema. No "type to confirm" UI pattern exists;
the only destructive-confirm precedent (`DeleteTaskAlertDialog.tsx`) is a single click with no client-side
state. `input.tsx`/`label.tsx` shadcn components are not installed.

## Desired End State

An authenticated user who navigates directly to `/account/delete` can type their email to unlock a
"Delete my account" button, confirm a second "are you sure?" dialog, and have their Supabase auth user and
every one of their `maintenance_tasks` rows permanently deleted. They land on `/account-deleted` with
their session cookies cleared; a subsequent visit to `/dashboard` or `/tasks` redirects them to
`/auth/signin` like a brand-new anonymous visitor. An unauthenticated visitor hitting `/account/delete`
directly is redirected to sign in first.

**Verification**: unit tests cover every response branch of the new route with a mocked Supabase client;
a real-Supabase integration test proves the `maintenance_tasks` cascade actually fires; a manual browser
walkthrough confirms the two-step confirm UX and the post-delete session-clearing behavior end to end.

### Key Discoveries

- `src/lib/supabase.ts:1-25` — only anon SSR client factory exists; no service-role client to reuse.
- `astro.config.mjs:17-22` — env schema declares only `SUPABASE_URL`/`SUPABASE_KEY`; a third secret entry
  is needed.
- `src/lib/api-auth.ts:1-19` — `requireApiUser`/`requireApiClient` JSON-style guard pair to extend with a
  matching `requireApiAdminClient`, not reinvent.
- `src/middleware.ts:4` — `PROTECTED_ROUTES` is a plain `.startsWith()` prefix match over the request
  path — a naively-named post-delete page nested under the protected path would immediately bounce itself
  back to sign-in.
- `supabase/migrations/20260827194321_create_maintenance_tasks.sql` — `maintenance_tasks.user_id` already
  has `ON DELETE CASCADE` to `auth.users`; no new migration needed.
- `src/components/tasks/DeleteTaskAlertDialog.tsx:1-41` — existing `AlertDialog` pattern to reuse verbatim
  for the second "are you sure?" confirm step.
- `src/pages/api/v1/tasks/[id].ts:71-92` — reference JSON-style `DELETE` handler shape (`204`/`jsonError`)
  this route follows.
- Confirmed via context7 (`/supabase/supabase` docs): `auth.admin.deleteUser(id)` (default
  `shouldSoftDelete: false`) hard-deletes the row and cascades to `auth.sessions`, invalidating refresh
  tokens — but does **not** retroactively invalidate an already-issued access-token JWT, which stays valid
  until its own `exp`. The recommended server-side admin client config is
  `{ auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }`.

## What We're NOT Doing

- No data export/"download my data" feature — this change covers erasure only (explicit product decision;
  data portability is a separate GDPR right, not in the S-06/MS-03 scope anchor).
- No re-authentication (password re-entry) before deletion — the current session plus the two-step
  type-to-confirm/are-you-sure UI is the accepted bar, matching the existing no-reauth precedent for
  per-task deletion.
- No dedicated audit table — only a single `console.log` line before the delete call, relying on
  Cloudflare Workers' existing observability (already enabled in `wrangler.jsonc`).
- No new Supabase migration — the `ON DELETE CASCADE` FK already handles `maintenance_tasks` cleanup.
- No wiring of `SUPABASE_SERVICE_ROLE_KEY` into GitHub Actions CI secrets or `wrangler-action`'s deploy
  job — CI's `npm run test` step only runs unit tests (which mock the admin client entirely) and never
  runs the integration tier, so CI never needs a real key. Cloudflare's own runtime secret (set manually
  via `wrangler secret put`) is the only production credential this change requires.
- No edits to `Topbar.astro`, `dashboard.astro`, or `tasks/index.astro` — the delete-account page ships
  unlinked (direct URL only) to stay parallel-safe with S-05's in-flight shared-nav rework, per the
  roadmap's explicit risk callout.
- No handling of "other devices/tabs stay functionally signed in until their JWT expires" — this is an
  inherent Supabase platform limitation (stateless access tokens), not something addressable at this
  app's layer without adding `session_id`-claim validation infrastructure the app doesn't have anywhere
  else. Accepted as-is.
- No Supabase Storage ownership handling — this app has no Storage usage today, so the "cannot delete a
  user who owns Storage objects" GoTrue safety block never applies here.

## Implementation Approach

Extend the existing JSON-style API convention (`requireApiUser`/`requireApiClient`) with a parallel
service-role client and its own guard (`requireApiAdminClient`), following the exact null-check factory
pattern `src/lib/supabase.ts` already uses. The new `DELETE /api/v1/account` route validates the typed
confirmation server-side before touching anything destructive, calls the admin client, then reuses the
request-scoped anon client's `auth.signOut()` (the same call `signout.ts` already makes) to clear cookies.
The UI is a small React island reusing already-installed `AlertDialog`/`Button` plus two newly-installed
shadcn primitives (`input`, `label`) for the type-to-confirm field. Two new pages give the flow its own,
currently-unlinked entry point and a post-delete landing page, chosen to avoid a subtle `startsWith()`
prefix collision in route protection (see Phase 3).

## Critical Implementation Details

### State sequencing

The route must validate the confirmation value **before** doing anything destructive, and must only sign
out the request-scoped session **after** `auth.admin.deleteUser` has actually succeeded: 1) auth check,
2\) parse + validate `confirmEmail` against the authenticated user's own email, 3) log the audit line,
4\) call `auth.admin.deleteUser(user.id)`, 5) only on success, call `supabase.auth.signOut()` on the
request-scoped anon client to clear cookies, 6) return `204`. If step 4 fails, return an error and leave
the session intact — signing out before confirming the delete succeeded would leave the user logged out
with their account (and data) still fully present, which is a confusing partial-failure state.

### User experience spec

The confirm flow is two steps, not one: (1) an `input` gated by a `label`-described instruction ("Type
your email to confirm") — the "Delete my account" button stays `disabled` until the trimmed,
lowercased typed value equals the trimmed, lowercased signed-in email; (2) clicking the now-enabled button
opens an `AlertDialog` ("Are you absolutely sure? This permanently deletes your account and all your data.
This cannot be undone.") with `AlertDialogCancel` and a destructive confirm action — only confirming that
dialog fires the actual `DELETE` request. Cancelling the dialog must not clear the typed email value. A
failed request keeps the typed value and shows an inline error, allowing immediate retry without retyping.

## Phase 1: Service-role Supabase client + env wiring

### Overview

Introduce the new secret and the server-only client factory everything else depends on, following the
existing anon-client factory's exact shape.

### Changes Required

#### 1. Env schema

**File**: `astro.config.mjs`

**Intent**: Declare the new server-only secret so `astro:env/server` exposes it with the same
optional/secret contract as the existing two vars.

**Contract**: Add `SUPABASE_SERVICE_ROLE_KEY: envField.string({ context: "server", access: "secret", optional: true })` alongside the existing two entries. Run `npx astro sync` afterward so generated types pick it up (CI already does this in its own "Sync Astro types" step).

#### 2. Service-role client factory

**File**: `src/lib/supabase-admin.ts` (new)

**Intent**: A server-only Supabase client authenticated with the service-role key, for the one action
that must bypass RLS: deleting a user's own `auth.users` row via the GoTrue admin API. Never touches
cookies — this client is session-independent by design.

**Contract**: `export function createAdminClient(): SupabaseClient<Database> | null` — returns `null` when
either `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` is unset, matching `src/lib/supabase.ts`'s null-check
convention. Uses `createClient` from `@supabase/supabase-js` directly (not `createServerClient` — no
cookie-bridging needed), with the auth options confirmed via context7 as the recommended server-side admin
config:

```ts
createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
```

#### 3. API guard

**File**: `src/lib/api-auth.ts`

**Intent**: Give routes the same one-line guard idiom (`if (x instanceof Response) return x;`) for the
admin client that `requireApiClient` already gives for the anon client.

**Contract**: Add `export function requireApiAdminClient(context: APIContext): ReturnType<typeof createAdminClient> | Response`, returning `jsonError(503, "Supabase is not configured")` when `createAdminClient()` returns `null`, otherwise the client — identical shape to the existing `requireApiClient`.

#### 4. Local env template + README

**File**: `.env.example`, `README.md`

**Intent**: Document the new var so a developer setting up local Supabase (or a cloud project) knows to
add it, and document the production deployment secret.

**Contract**: `.env.example` gains a `SUPABASE_SERVICE_ROLE_KEY=` placeholder line (no real value —
use a clearly fake placeholder, never an actual key). `README.md`'s "Using a cloud Supabase project"
table and local-setup steps gain a `SUPABASE_SERVICE_ROLE_KEY` row/line (Project Settings → API →
`service_role` secret — never expose client-side), and the "Deployment" section's `wrangler secret put`
list gains `SUPABASE_SERVICE_ROLE_KEY` alongside the existing two.

### Success Criteria

#### Automated Verification

- Unit tests pass: `npm run test` (new `src/lib/supabase-admin.test.ts` mirroring `src/lib/supabase.test.ts`'s
  env-mocking pattern; extended `src/lib/api-auth.test.ts` covering `requireApiAdminClient`'s 503/pass-through
  branches, mirroring the existing `requireApiClient` tests)
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- After adding a real local Supabase `service_role` key to `.env`/`.dev.vars` and running
  `npx astro sync`, `npm run dev` starts cleanly with no new "missing config" banner regression.

______________________________________________________________________

## Phase 2: `DELETE /api/v1/account` route

### Overview

The action itself: validate the confirmation, delete the auth user, clear the session.

### Changes Required

#### 1. Account deletion route

**File**: `src/pages/api/v1/account.ts` (new)

**Intent**: Let the authenticated caller permanently delete their own account after server-side confirming
they typed their own email, per the State Sequencing details above.

**Contract**: `export const prerender = false; export const DELETE: APIRoute = async (context) => { ... }`.
Order: `requireApiUser` → `requireApiClient` (kept for the later `signOut`) → `parseJsonBody` →
an inline zod schema `z.object({ confirmEmail: z.string().trim().min(1).max(255) })` → compare
`parsed.data.confirmEmail.trim().toLowerCase()` against `user.email.trim().toLowerCase()`, returning
`jsonError(400, "Email confirmation does not match")` on mismatch → `console.log` the audit line
(`user.id`, `user.email`, an ISO timestamp) → `requireApiAdminClient` → `adminClient.auth.admin.deleteUser(user.id)`,
returning `jsonError(502, "Failed to delete account")` on error → on success, `await supabase.auth.signOut()`
(the anon client from step 2) → `return new Response(null, { status: 204 })`.

### Success Criteria

#### Automated Verification

- Unit tests pass: `npm run test` (new `src/pages/api/v1/account.test.ts` using `assertRequiresApiAuth`
  for the 401 case, plus cases for: 400 on missing/invalid body, 400 on email mismatch, 503 when the admin
  client is unconfigured, 502 when `deleteUser` errors, and 204 + `signOut` called on success)
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- Against local Supabase, a `curl` `DELETE /api/v1/account` with a mismatched `confirmEmail` returns 400;
  with the correct email it returns 204, and Supabase Studio confirms both the `auth.users` row and that
  user's `maintenance_tasks` rows are gone.

______________________________________________________________________

## Phase 3: Confirmation UI

### Overview

The two-step confirm flow and its two pages.

### Changes Required

#### 1. Missing shadcn primitives

**Command**: `npx shadcn@latest add input label -y -o`

**Intent**: Install the two missing primitives the type-to-confirm field needs.

**Contract**: Per the standing lesson on `npx shadcn add`, after running the command diff every touched
file (not just the two new ones) for: literal `"cn"` imports that must become `@/lib/utils`, unrequested
`next-themes` imports, missing `React`-namespace type imports, and any unintended overwrite of an
already-installed component (`button.tsx` is a likely shared dependency). Run `npm run build && npm run lint && npm run test` after, not just before.

#### 2. Delete-account form

**File**: `src/components/account/DeleteAccountForm.tsx` (new)

**Intent**: The client-side two-step confirm flow described in "User experience spec" above.

**Contract**: `export function DeleteAccountForm({ email }: { email: string })`. Local state: typed
confirmation value, dialog-open flag, submitting flag, error message. Renders `Input`/`Label` (new) +
a `Button` that's `disabled` until the trimmed/lowercased comparison matches, which opens an
`AlertDialog` (reusing the exact structure of `DeleteTaskAlertDialog.tsx`) whose destructive confirm
action performs `fetch("/api/v1/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmEmail: value }) })`.
On `204`, `window.location.href = "/account-deleted"`. On failure, parse the JSON error body and show it
inline, keeping the typed value and closing the dialog so the user can retry without retyping.

#### 3. Delete-account page

**File**: `src/pages/account/delete.astro` (new)

**Intent**: The (currently unlinked) entry point, composed the same way `dashboard.astro`/`tasks/index.astro`
compose `Layout`.

**Contract**: `<Layout title="Delete account"><Topbar /><DeleteAccountForm client:load email={Astro.locals.user.email} /></Layout>`.
Relies on the middleware redirect below rather than a page-level check, matching `dashboard.astro`'s pattern.

#### 4. Post-delete page

**File**: `src/pages/account-deleted.astro` (new)

**Intent**: A static goodbye page reached immediately after a successful deletion, once the session cookie
is already cleared.

**Contract**: Deliberately named `/account-deleted` — a flat, top-level path, **not** nested as
`/account/deleted` — because `PROTECTED_ROUTES` matching in `src/middleware.ts` is a plain
`path.startsWith(route)` check: `"/account/deleted".startsWith("/account/delete")` is `true`, so a nested
name would make this page immediately bounce itself to `/auth/signin` the moment the user's session is
gone. `<Layout title="Account deleted">` with static copy and a link back to `/`; no auth dependency.

#### 5. Route protection

**File**: `src/middleware.ts`

**Intent**: Gate the delete-account form page behind authentication, exactly like `/dashboard`/`/tasks`.

**Contract**: Add `"/account/delete"` (and only that literal string — not a bare `"/account"` prefix) to
the `PROTECTED_ROUTES` array.

### Success Criteria

#### Automated Verification

- Linting passes: `npm run lint`
- Build succeeds: `npm run build`
- Unit tests pass: `npm run test` (no regressions in existing suites)

#### Manual Verification

- Unauthenticated visit to `/account/delete` redirects to `/auth/signin`; `/account-deleted` is reachable
  with no session.
- Signed in, typing a non-matching email keeps the button disabled; typing the correct email (any
  case/whitespace) enables it.
- Clicking the enabled button opens the "are you sure?" dialog; Cancel closes it with no request sent and
  the typed value intact.
- Confirming the dialog deletes the account, redirects to `/account-deleted`, and a subsequent visit to
  `/dashboard` redirects to `/auth/signin` as an anonymous visitor.

______________________________________________________________________

## Phase 4: Real-Supabase integration test

### Overview

Prove the `maintenance_tasks` cascade actually fires against a real database, without touching the shared
`seed.sql` fixtures.

### Changes Required

#### 1. Cascade-delete integration test

**File**: `src/pages/api/v1/account.integration.test.ts` (new)

**Intent**: Prove end-to-end that deleting a user via the admin client removes their `maintenance_tasks`
rows, using a self-contained disposable user rather than the shared `isolation.integration.test.ts`
fixtures — deleting a fixed seed user would break that other suite's assumptions if either runs first.

**Contract**: Mirrors `isolation.integration.test.ts`'s loud-fail-on-non-local-URL guard. Requires
`SUPABASE_SERVICE_ROLE_KEY` from the environment (from `npx supabase status`); throws a clear setup error
if unset, rather than hardcoding a guessed key. Flow: use the admin client to `auth.admin.createUser` a
throwaway user; sign in as them with the anon client and insert one `maintenance_tasks` row (through RLS,
for realism); call `auth.admin.deleteUser` on that user via the admin client; then, using the admin client
(the anon session is now gone), assert a `maintenance_tasks` select filtered by that `user_id` returns
zero rows and `auth.admin.getUserById` errors/returns no user. Clean up the disposable user in a `finally`/
`afterAll` in case an assertion throws before the delete step runs, so a failed run doesn't leave a
straggler in the local database.

### Success Criteria

#### Automated Verification

- Integration tests pass: `npm run test:integration` (requires `npx supabase start && npx supabase db reset` first)

#### Manual Verification

- Supabase Studio shows no leftover disposable users/tasks after a full local `test:integration` run,
  including after an intentionally-failed run (to confirm cleanup logic actually runs).

______________________________________________________________________

## Testing Strategy

### Unit Tests

- `src/lib/supabase-admin.test.ts` — null-check behavior when either env var is unset.
- `src/lib/api-auth.test.ts` (extended) — `requireApiAdminClient`'s 503/pass-through branches.
- `src/pages/api/v1/account.test.ts` — 401 (via `assertRequiresApiAuth`), 400 invalid body, 400 email
  mismatch, 503 unconfigured admin client, 502 on `deleteUser` error, 204 + `signOut` called on success.

### Integration Tests

- `src/pages/api/v1/account.integration.test.ts` — real cascade-delete proof against local Supabase,
  using a disposable admin-created user.

### Manual Testing Steps

1. Unauthenticated visit to `/account/delete` → redirected to `/auth/signin`.
1. Signed in, mistyped email → button stays disabled.
1. Correct email (mixed case/whitespace) → button enables.
1. Click → "are you sure?" dialog appears; Cancel → no request, value intact.
1. Confirm → account deleted, redirected to `/account-deleted`.
1. Visit `/dashboard` afterward → redirected to `/auth/signin` as an anonymous visitor.
1. `curl` the route directly with a mismatched `confirmEmail` → 400, account untouched.

## Performance Considerations

None beyond the existing per-request Supabase client construction pattern already used everywhere else in
this app — a single admin API call with no loops or batching.

## Migration Notes

None. The `ON DELETE CASCADE` FK on `maintenance_tasks.user_id` (already present in
`supabase/migrations/20260827194321_create_maintenance_tasks.sql`) is sufficient; deleting the `auth.users`
row is the only database action this feature performs directly.

## References

- Research: `context/changes/account-deletion/research.md`
- Roadmap: `context/foundation/roadmap.md:224-246` (S-06)
- Reference JSON-style delete route: `src/pages/api/v1/tasks/[id].ts:71-92`
- Reference destructive-confirm UI: `src/components/tasks/DeleteTaskAlertDialog.tsx:1-41`
- Reference real-RLS integration test: `src/pages/api/tasks/isolation.integration.test.ts`, `supabase/seed.sql`
- Supabase docs (via context7, `/supabase/supabase`): `auth.admin.deleteUser` cascade/JWT behavior;
  recommended service-role client options

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append `— <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Service-role Supabase client + env wiring

#### Automated

- [x] 1.1 Unit tests pass: `npm run test` — 3d6a688
- [x] 1.2 Linting passes: `npm run lint` — 3d6a688
- [x] 1.3 Build succeeds: `npm run build` — 3d6a688

#### Manual

- [x] 1.4 Local `.env`/`.dev.vars` service_role key added; `npm run dev` starts cleanly after `npx astro sync` — 3d6a688

### Phase 2: `DELETE /api/v1/account` route

#### Automated

- [x] 2.1 Unit tests pass: `npm run test` — fe72395
- [x] 2.2 Linting passes: `npm run lint` — fe72395
- [x] 2.3 Build succeeds: `npm run build` — fe72395

#### Manual

- [x] 2.4 Manual curl walkthrough (400 on mismatch, 204 + row/user gone on success) against local Supabase — fe72395

### Phase 3: Confirmation UI

#### Automated

- [x] 3.1 Linting passes: `npm run lint`
- [x] 3.2 Build succeeds: `npm run build`
- [x] 3.3 Unit tests pass: `npm run test`

#### Manual

- [x] 3.4 Unauthenticated `/account/delete` redirects; `/account-deleted` reachable without a session
- [x] 3.5 Disabled-until-match button behavior verified in browser
- [x] 3.6 "Are you sure?" dialog Cancel/Confirm behavior verified in browser
- [x] 3.7 Full delete → redirect → subsequent `/dashboard` redirect-to-signin verified in browser

### Phase 4: Real-Supabase integration test

#### Automated

- [ ] 4.1 Integration tests pass: `npm run test:integration`

#### Manual

- [ ] 4.2 No leftover disposable users/tasks in Supabase Studio after a full run, including after a failed run
