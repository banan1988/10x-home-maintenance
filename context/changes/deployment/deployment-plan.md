# Cloudflare Workers Deployment Plan — home-maintenance

## Context

`context/foundation/infrastructure.md` already recommends Cloudflare Workers (5/5 on agent-friendly criteria, zero-cost free tier, already scaffolded via `@astrojs/cloudflare`). The project has never actually been deployed to Cloudflare yet — `wrangler.jsonc` still carries the stale starter name `10x-astro-starter`, and `.github/workflows/ci.yml` already contains a `deploy` job wired to `wrangler-action@v4` that would fail today (its required `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` secrets don't exist). Wrangler, the Supabase CLI, and `gh` are already authenticated on this machine (verified live, see Phase 1) and a hosted Supabase project (`10x-home-maintenance`, ref `kiuuewutycdwahmshpxm`) already exists and is linked — no migrations exist yet.

Research (three parallel Explore agents + two Plan agents + live GitHub-issue and Cloudflare/Supabase docs checks) surfaced two specific, non-generic risks: (1) `src/middleware.ts` runs `supabase.auth.getUser()` on **every request** under `wrangler.jsonc`'s `nodejs_compat` flag — the exact trigger shape of **astro#15434** ("Astro v6 + Cloudflare + middleware + `nodejs_compat` → `[object Object]` on SSR pages"). Confirmed by reading the closed issue directly: it's fixed by `compatibility_date >= 2026-02-24` (or the `disable_nodejs_process_v2` flag as a fallback), and this repo's `compatibility_date` is already `2026-05-08` — so the risk is very likely already moot, but cheap to verify with one smoke test. (2) `@supabase/ssr`'s `createServerClient()` pulls in the *full* `@supabase/supabase-js` SDK, transitively including `@supabase/realtime-js` → `ws` (a Node socket library) — untested against Workers' `nodejs_compat` polyfill in this app.

**Decision**: auto-deploy on merge to `main`, but via **Cloudflare Workers Builds** — Cloudflare's native Git integration (a GitHub App connected directly from the Cloudflare dashboard) — instead of GitHub Actions. This gets auto-deploy-on-merge *and* automatic preview builds for other branches with zero GitHub Actions minutes and no Cloudflare token stored as a GitHub secret (Cloudflare's own GitHub App handles auth). The first deploy is still done manually from your local machine (bootstraps the Worker under the right name and sets initial secrets) before Workers Builds is connected. The existing `wrangler-action`-based `deploy` job in `ci.yml` is parked (`if: false`, not deleted) and documented as a fallback alternative, since it's now fully superseded by Workers Builds.

**Decided config**: Worker renamed to `10x-home-maintenance` (matches repo/package.json).

**Artifact handling**: the approved plan persists at `context/changes/deployment/deployment-plan.md`. Phase 0 wrote this plan to that path as the first execution step immediately upon approval; each later phase appends its actual outcome (dates, verification results, decisions) to the same file as it completes.

______________________________________________________________________

## Phase 0 — Persist approved plan + pre-flight — ✅ done 2026-08-23

- [x] Created `context/changes/deployment/` and wrote this approved plan to `context/changes/deployment/deployment-plan.md` verbatim.

- [x] Committed as `dd8ce1c` (later rebased to `61bad20`): "docs: record approved Cloudflare Workers deploy plan"

- [x] `git status` confirmed clean; created branch `chore/cloudflare-deploy-setup`

## Phase 1 — Prerequisites: CLI & Supabase configuration

Both CLIs are already project devDependencies (`wrangler`, `supabase` in `package.json`) — always invoke via `npx`, never a global install, so the pinned version matches CI/teammates.

**Cloudflare / Wrangler** — confirmed done, verified live on 2026-08-23:

- [x] Cloudflare account exists and Wrangler is authenticated locally (OAuth). `npx wrangler whoami` → account `Kucharskilukasz88@gmail.com's Account`, Account ID `ea582f0e95f1886a2427e470496cc07f`.

- [x] Sanity check before the Phase 2 rename — confirmed **neither** name has a prior orphaned deployment (both return `This Worker does not exist on your account` [code: 10007], i.e. a clean slate):

  ```bash
  npx wrangler deployments list --name 10x-astro-starter     # confirmed: does not exist
  npx wrangler deployments list --name 10x-home-maintenance  # confirmed: does not exist
  ```

- [x] No `CLOUDFLARE_API_TOKEN` GitHub secret was created — confirmed not needed; Workers Builds authenticates via its own connected GitHub App, no token dropdown was ever prompted during setup.

**Supabase** — confirmed done, verified live on 2026-08-23:

- [x] Logged in (`npx supabase projects list` succeeds without prompting for auth).

- [x] Hosted project created: `10x-home-maintenance`, ref `kiuuewutycdwahmshpxm`, region `eu-central-1`, status `ACTIVE_HEALTHY`.
  Note: the same account also has an unrelated, unlinked `10x-smart-budget-ai` project (ref `lzjqsbemuzuneylwozeq`, `INACTIVE`) from a different exercise — not used by this app, ignore it.

- [x] Local project linked to the hosted one (`"linked": true` for `10x-home-maintenance` in `supabase projects list`).

- [x] `SUPABASE_URL`/`SUPABASE_KEY` retrieved and set as Worker secrets in Phase 4 (`SUPABASE_URL` = `https://kiuuewutycdwahmshpxm.supabase.co`; the anon key was retrieved from the dashboard and set directly by you via `wrangler secret put`, never typed into this conversation).

- [x] No local migrations exist yet (`supabase/migrations/` is absent), so there's nothing to `supabase db push` right now — note this so the first time a migration *is* created, pushing it to the hosted project becomes a required pre-deploy step, not implied.

**GitHub CLI** — confirmed done, verified live on 2026-08-23:

- [x] `gh auth status` → logged in as `banan1988` (active account).

- [x] `gh repo view` confirms the connected repo is `10x-home-maintenance` with default branch `main`, matching this plan's assumptions.

## Phase 2 — Config hygiene — ✅ done 2026-08-23

- [x] `wrangler.jsonc` renamed `"10x-astro-starter"` → `"10x-home-maintenance"`.

- [x] `package.json` gained `"deploy": "astro build && wrangler deploy"`.

- [x] `.github/workflows/ci.yml`'s `deploy` job parked with `if: false` and an explanatory comment. Kept, not deleted.

- [x] `.env.example` confirmed already correct, no change needed.

- [x] Confirmed no separate `.dev.vars.example` needed.

- [x] `README.md` "Deployment"/"CI" sections updated to describe Workers Builds as the auto-deploy mechanism and `npm run deploy` for manual deploys.

- [x] `CLAUDE.md` Commands/CI sections updated likewise.

- [x] An incidental but correct side-effect was also folded in here: `supabase/config.toml`'s `project_id` was still `10x-astro-starter` from before the hosted project was linked (Phase 1) — synced to `10x-home-maintenance` in the same change for consistency.

- [x] Committed as `18d299b` ("chore: rename Worker, add manual deploy script, park Actions deploy job") + `24e2cf1` (config.toml sync), later squash-merged to `main` as `3e34c46` via PR [#4](https://github.com/banan1988/10x-home-maintenance/pull/4).

## Phase 3 — Local dry-run validation — ✅ done 2026-08-23

- [x] `npm run build` and `npx wrangler deploy --dry-run` both succeeded. Bundle included the Supabase chunk (706 KiB) with no unresolved-module warnings — an early good sign against the `realtime-js`/`ws` risk, confirmed properly in Phase 5.

## Phase 4 — First real (manual) deploy + secrets — ✅ done 2026-08-23

- [x] `npx wrangler deploy` created the Worker under `10x-home-maintenance`. Live URL at the time: `https://10x-home-maintenance.10x-home-maintenance.workers.dev` (superseded 2026-08-23, see "Subdomain change" below — current live URL is `https://10x-home-maintenance.banan1988.workers.dev`). Cloudflare auto-provisioned a `SESSION` KV namespace the adapter needed (not pre-declared in `wrangler.jsonc`).

- [x] `SUPABASE_URL`/`SUPABASE_KEY` set via `npx wrangler secret put` — run directly by you in your own terminal (the sandbox blocks `wrangler secret put` invocations entirely, and the values were never typed into this conversation).

- [x] Verified via `wrangler secret list` (both present) and `wrangler deployments list` (version recorded).

- [x] `wrangler tail` + homepage load confirmed clean SSR, no exceptions.

## Phase 5 — Risk verification smoke tests — ✅ done 2026-08-23 (one item accepted as residual risk, one new finding)

- [x] **astro#15434 check** — **CONFIRMED CLEAN, live-verified 2026-08-23**. Initially blocked by this hosted Supabase project's email-confirmation requirement; re-verified after temporarily disabling "Confirm email" (Authentication → Providers → Email) to obtain a real authenticated session. Signed up a fresh test account, which returned a full session cookie (`email_confirmed_at` populated), then loaded `/dashboard` with that session against the live Worker: `HTTP 200`, body rendered `Welcome, <email>` as real text, zero occurrences of `[object Object]`. The astro#15434 SSR-corruption bug does **not** reproduce on this deploy, consistent with `compatibility_date` (`2026-05-08`) being well past the upstream fix threshold (`>= 2026-02-24`). Test session was signed out afterward; "Confirm email" should be re-enabled if that's the desired production auth posture.
- [x] **`@supabase/realtime-js`/`ws` check** — PASS. Exercised signup (invalid domain → real Supabase validation error; valid domain → redirected to `/auth/confirm-email`), signin pre-confirmation (real "Email not confirmed" error), and bad-login (real "Invalid login credentials" error). All four requests logged `Ok` in `wrangler tail` with zero exceptions referencing `ws`/`net`/`tls`/`Phoenix`. The realtime-js dependency is not causing runtime problems.
- [x] **Silent-misconfiguration check** — PASS. Bad login returned `error=Invalid%20login%20credentials`, never `error=Supabase%20is%20not%20configured` — secrets are correctly wired end-to-end.
- [x] **Cookie check** — done, with a **new finding**: the PKCE `code-verifier` cookie set during signup (`sb-kiuuewutycdwahmshpxm-auth-token-code-verifier`) has **no `Secure` or `HttpOnly` attribute**, even over this HTTPS `workers.dev` origin — only `Max-Age`, `Path=/`, `SameSite=Lax`. This is `@supabase/ssr`'s default cookie options passed straight through in `src/lib/supabase.ts`'s `setAll` callback with no override. Not a deploy blocker (functionally the flow works, and `workers.dev` enforces HTTPS site-wide), but it's a real gap worth a follow-up: missing `HttpOnly` means client-side JS could read the cookie (XSS-adjacent risk), and missing `Secure` means it would also be sent over any future non-HTTPS path. **Flagged for a follow-up code change to `src/lib/supabase.ts`'s cookie options — out of scope for this deployment-only change.**
- [x] **No-cookie negative control** — PASS. `/dashboard` without a session cookie redirects to `/auth/signin` (302). Re-confirmed again after the Phase 7 rollback drill.

## Phase 6 — Connect Cloudflare Workers Builds — ✅ done and verified live 2026-08-23

- [x] Connected via the Cloudflare dashboard (Workers & Pages → `10x-home-maintenance` → Settings → Builds → Connect), root directory, build command, deploy command, and `main` as the production branch all configured as planned. No stale-token dropdown was encountered.
- [x] Build-time and runtime environment variables both confirmed set.
- [x] **Preview build verified live**: pushing branch `chore/cloudflare-deploy-setup` and opening [PR #4](https://github.com/banan1988/10x-home-maintenance/pull/4) produced a new Worker version (`d00cac62-...`, `Source: Unknown (version_upload)`) within ~17 minutes of the push — matching an automatic `wrangler versions upload` preview build. (GitHub's own checks/status API wasn't visible via the `gh` token's scope, so this was confirmed directly via `wrangler versions list` instead.)
- [x] **Production auto-deploy verified live**: squash-merging PR #4 to `main` (commit `3e34c46`) produced a new deployment (`2ad989aa-...`, `Source: Unknown (deployment)`, 100% traffic) about 2 minutes after the merge — confirmed via `wrangler deployments list`, and the live site was re-checked (`HTTP 200`) immediately after.

## Phase 7 — Rollback drill — ✅ done 2026-08-23

- [x] Rolled back from `2ad989aa` (post-merge production version) to the prior version `502e27d2` via `npx wrangler rollback` — succeeded immediately, 100% traffic moved.
- [x] Re-ran the no-cookie (`/dashboard` → 302 to `/auth/signin`) and bad-login (`error=Invalid%20login%20credentials`) checks against the rolled-back version — both passed, confirming rollback restores a fully functional deployment, not just a code revert.
- [x] Rolled forward again to `2ad989aa` so production wasn't left pinned to the older drill version.
- [x] Confirmed for the record: `wrangler rollback` only reverts Worker code. No `supabase/migrations` exist yet, so the "rollback doesn't cover DB migrations" risk remains theoretical — revisit the first time a migration ships alongside a release.

## Phase 8 — One-time dashboard checks — ✅ done 2026-08-23

- [x] Observability confirmed via CLI: `wrangler tail` captured every request across all four deploy/rollback/roll-forward events with zero gaps, from the initial homepage load through the rollback drill.
- [x] "Auto Minify"/"Rocket Loader" — confirmed not applicable yet, since the Worker is served purely from `*.workers.dev` with no custom domain/zone attached. Re-check specifically the day a custom domain is added.

## Phase 9 — Finalize `context/changes/deployment/deployment-plan.md` with outcomes — ✅ done 2026-08-23

- **What's deployed**: Cloudflare Workers, name `10x-home-maintenance`, live at `https://10x-home-maintenance.banan1988.workers.dev`, default `workers.dev` domain (no custom domain). First deploy was manual (`wrangler deploy` from local machine); auto-deploy on merge to `main` is live thereafter via **Cloudflare Workers Builds** — verified end-to-end, not just configured.

- **Subdomain change (2026-08-23, post-deploy)**: the account-wide `*.workers.dev` subdomain was changed from the default `10x-home-maintenance` to `banan1988` via the Cloudflare dashboard (Workers & Pages → Overview → "Your subdomain" → Change — no `wrangler` CLI equivalent exists for this). This is an account-level setting shared by every Worker on the account, not a per-Worker rename. Verified live: the new URL `https://10x-home-maintenance.banan1988.workers.dev` serves the app correctly (`HTTP 200`); the old URL (`https://10x-home-maintenance.10x-home-maintenance.workers.dev`) no longer resolves at all (`Could not resolve host`), confirming this is a rename, not an alias. No Worker secrets, bindings, or Workers Builds configuration needed to change — the connection is keyed on the Worker name, not the subdomain.

- **Secrets/config map**: `.env` (Node local) / `.dev.vars` (Cloudflare local dev) / Worker runtime secrets (`wrangler secret put`, same store as Workers Builds' "Variables & Secrets") / Workers Builds' separate build-time-only "Environment variables" — four distinct locations, kept in sync manually. `SUPABASE_URL`/`SUPABASE_KEY` confirmed present in the runtime store via `wrangler secret list`.

- **Supabase**: hosted project `10x-home-maintenance` (ref `kiuuewutycdwahmshpxm`, region `eu-central-1`) created and linked prior to this session. No migrations exist yet — the first migration created must be `supabase db push`-ed before it takes effect on the hosted project.

- **Decisions recorded**: Worker renamed pre-first-deploy (`10x-astro-starter` → `10x-home-maintenance`, also synced into `supabase/config.toml`'s `project_id`); auto-deploy via Cloudflare Workers Builds chosen over GitHub Actions (no token stored in GitHub, free automatic preview builds per-branch); the pre-existing Actions `deploy` job parked via `if: false`, not deleted.

- **Risk register outcomes**:

  - astro#15434 — **confirmed clean, live-verified** on `/dashboard` on 2026-08-23 with a real authenticated session (see Phase 5). No `[object Object]` corruption; matches the upstream fix already present via `compatibility_date >= 2026-02-24` (this repo: `2026-05-08`).
  - `@supabase/realtime-js`/`ws` — **confirmed clean**, verified via live auth-flow smoke test (signup/signin error paths) on 2026-08-23, zero exceptions in `wrangler tail`.
  - Rollback drill — **completed and verified working** on 2026-08-23 (rolled back to `502e27d2`, confirmed functional, rolled forward to `2ad989aa`).
  - **New finding, not in the original register**: the Supabase PKCE `code-verifier` cookie ships without `Secure`/`HttpOnly` attributes (see Phase 5). Flagged as a follow-up code change to `src/lib/supabase.ts`, out of scope for this deployment-only change.

- **Fallback: GitHub Actions CD** (reference only, not active) — if Workers Builds is ever disconnected, the parked `deploy` job in `ci.yml` can be revived: create a scoped `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`, add as GitHub repo secrets, remove the job's `if: false` line. A `preview` job design (using `wrangler-action@v4`'s `command: versions upload`, output via its `command-output` variable — confirmed against the action's README) is available as a documented pattern if PR-preview-via-Actions is ever needed instead of Workers Builds' built-in equivalent.

______________________________________________________________________

## Verification Summary

All items confirmed live, 2026-08-23:

1. ✅ `https://10x-home-maintenance.banan1988.workers.dev` loads and serves SSR content (`HTTP 200`).
1. ✅ Sign-in/sign-up/sign-out all function against the real hosted Supabase project with zero console/tail exceptions, including a full authenticated session (signup → session cookie → signout).
1. ✅ `/dashboard` corruption check (astro#15434) — live-confirmed clean with a real authenticated session; no `[object Object]` corruption.
1. ✅ PR #4 triggered an automatic Workers Builds preview (`d00cac62`); merging it triggered an automatic production deploy (`2ad989aa`) — auto-deploy-on-merge works without GitHub Actions.
1. ✅ Rollback drill performed and confirmed working (rolled back to `502e27d2`, verified functional, rolled forward).
1. ✅ This document records all of the above plus the GitHub Actions fallback path and the new cookie-attributes finding.

## Critical Files

- `wrangler.jsonc` — rename
- `package.json` — add `deploy` script
- `.github/workflows/ci.yml` — park `deploy` job in place
- `README.md`, `CLAUDE.md` — documentation updates
- `context/changes/deployment/deployment-plan.md` — new, final artifact
- `src/middleware.ts`, `src/lib/supabase.ts`, `src/pages/dashboard.astro`, `src/pages/api/auth/{signin,signup,signout}.ts` — verification targets only, no code changes planned
