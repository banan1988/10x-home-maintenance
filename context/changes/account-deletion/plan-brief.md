# Account Deletion — Plan Brief

> Full plan: `context/changes/account-deletion/plan.md`
> Research: `context/changes/account-deletion/research.md`

## What & Why

Let an authenticated user permanently delete their own account and all of their data — RODO/GDPR right
to erasure (roadmap S-06/MS-03). This is a genuinely new capability: it entered scope via a 2026-09-14
audit, not the original PRD.

## Starting Point

Nothing for this feature exists yet. Two solid auth/API conventions already exist to extend (redirect-style
vs. JSON-style); no service-role Supabase client exists anywhere; no "type to confirm" UI pattern exists;
the only destructive-confirm precedent is `DeleteTaskAlertDialog.tsx`'s single click. The `maintenance_tasks`
table already has an `ON DELETE CASCADE` FK to `auth.users`, pre-built for exactly this feature — no new
migration is needed.

## Desired End State

A user visiting `/account/delete` (direct URL only) types their email to unlock a destructive button,
confirms a second "are you sure?" dialog, and their Supabase auth user plus all their `maintenance_tasks`
rows are permanently gone. They land on `/account-deleted` with cookies cleared; any protected page
afterward redirects them to sign in as a new visitor.

## Key Decisions Made

| Decision                         | Choice                                                    | Why (1 sentence)                                                                                          |
| -------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Re-authentication                | Not required — current session is enough                  | Matches the existing no-reauth precedent for per-task deletion; no evidence of session-hijack risk today. |
| Server-side confirmation check   | Required — API validates `confirmEmail` server-side too   | Cheap defense-in-depth against a bug or stray script hitting the endpoint with just a valid cookie.       |
| Data export/portability          | Out of scope for this change                              | Distinct GDPR right from erasure; not in the S-06/MS-03 scope anchor.                                     |
| Audit trail                      | A single `console.log` line before the delete call        | Near-zero cost, uses Cloudflare's already-enabled observability, no new infra.                            |
| Confirmation phrase              | Type your own email address                               | Per-user value can't be blindly copy-pasted from a screenshot, matches GitHub/GitLab's pattern.           |
| Second confirm step (user-added) | An "are you sure?" `AlertDialog` after the button unlocks | User-requested extra safety net for an irreversible, whole-account action.                                |
| Post-delete destination          | Dedicated `/account-deleted` static page                  | No message-survives-redirect plumbing; also dodges a `startsWith()` route-protection collision.           |
| Entry-point discoverability      | Unlinked — direct URL only, for now                       | Zero merge-conflict risk with S-05's in-flight shared-nav rework, per the roadmap's own risk callout.     |
| Failure UX                       | Inline error, keep typed value, allow immediate retry     | Matches the existing `jsonError` + inline-message convention used by every other API route.               |

## Scope

**In scope:**

- New service-role Supabase client + `SUPABASE_SERVICE_ROLE_KEY` env var (local/cloud/deploy docs)
- `DELETE /api/v1/account` route with server-side confirmation validation
- Type-to-confirm + "are you sure?" two-step UI on an unlinked `/account/delete` page
- `/account-deleted` goodbye page
- Unit tests for every response branch + a real-Supabase integration test proving the cascade

**Out of scope:**

- Data export/portability
- Re-authentication before deletion
- A dedicated audit table (only a log line)
- Wiring the new secret into CI or the parked `wrangler-action` deploy job
- Any edit to `Topbar.astro`, `dashboard.astro`, or `tasks/index.astro`
- Addressing "other devices stay logged in until JWT expiry" — an accepted Supabase platform limitation

## Architecture / Approach

A new `src/lib/supabase-admin.ts` factory (mirroring `src/lib/supabase.ts`'s null-check shape) plus a
`requireApiAdminClient` guard (mirroring `requireApiClient`) give the JSON API a service-role client
alongside the existing anon one. The route validates cheap things first, deletes last, and only signs out
the session after the delete actually succeeds. The UI reuses already-installed `AlertDialog`/`Button`
plus two newly-installed shadcn primitives (`input`, `label`).

## Phases at a Glance

| Phase                  | What it delivers                                               | Key risk                                                                         |
| ---------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1. Client + env wiring | Service-role client, new secret documented across environments | Secret must never leak into the client bundle or CI logs                         |
| 2. Delete route        | `DELETE /api/v1/account` with server-validated confirmation    | Getting the validate→delete→signOut order wrong leaves a confusing partial state |
| 3. Confirmation UI     | Type-to-confirm + are-you-sure dialog, two new pages           | `startsWith()` route-protection collision if the goodbye page is nested wrong    |
| 4. Integration test    | Real-Supabase proof the cascade fires                          | Must not touch the shared `seed.sql` fixtures another test suite depends on      |

**Prerequisites:** None — S-06 has no roadmap prerequisites and is explicitly parallel-safe with S-04/S-05.
**Estimated effort:** ~4 focused sessions, one per phase.

## Open Risks & Assumptions

- Other devices/tabs for the deleted user remain functionally signed in until their access token's `exp`
  passes — an inherent Supabase limitation, accepted as-is (see plan's "What We're NOT Doing").
- `.env.example` needs a new placeholder line; take care to add only a fake placeholder value, never a
  real key.

## Success Criteria (Summary)

- A signed-in user can delete their own account end to end through the two-step confirm UI and lands on
  the goodbye page with their session actually cleared.
- Their `maintenance_tasks` rows are provably gone (unit-mocked and real-Supabase integration coverage).
- No other page, route, or CI secret was touched outside what this plan lists.
