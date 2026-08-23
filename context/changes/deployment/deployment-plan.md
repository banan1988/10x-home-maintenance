# Cloudflare Workers Deployment Plan — home-maintenance

## Context

`context/foundation/infrastructure.md` already recommends Cloudflare Workers (5/5 on agent-friendly criteria, zero-cost free tier, already scaffolded via `@astrojs/cloudflare`). The project has never actually been deployed to Cloudflare yet — `wrangler.jsonc` still carries the stale starter name `10x-astro-starter`, and `.github/workflows/ci.yml` already contains a `deploy` job wired to `wrangler-action@v4` that would fail today (its required `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` secrets don't exist). Wrangler, the Supabase CLI, and `gh` are already authenticated on this machine (verified live, see Phase 1) and a hosted Supabase project (`10x-home-maintenance`, ref `kiuuewutycdwahmshpxm`) already exists and is linked — no migrations exist yet.

Research (three parallel Explore agents + two Plan agents + live GitHub-issue and Cloudflare/Supabase docs checks) surfaced two specific, non-generic risks: (1) `src/middleware.ts` runs `supabase.auth.getUser()` on **every request** under `wrangler.jsonc`'s `nodejs_compat` flag — the exact trigger shape of **astro#15434** ("Astro v6 + Cloudflare + middleware + `nodejs_compat` → `[object Object]` on SSR pages"). Confirmed by reading the closed issue directly: it's fixed by `compatibility_date >= 2026-02-24` (or the `disable_nodejs_process_v2` flag as a fallback), and this repo's `compatibility_date` is already `2026-05-08` — so the risk is very likely already moot, but cheap to verify with one smoke test. (2) `@supabase/ssr`'s `createServerClient()` pulls in the *full* `@supabase/supabase-js` SDK, transitively including `@supabase/realtime-js` → `ws` (a Node socket library) — untested against Workers' `nodejs_compat` polyfill in this app.

**Decision**: auto-deploy on merge to `main`, but via **Cloudflare Workers Builds** — Cloudflare's native Git integration (a GitHub App connected directly from the Cloudflare dashboard) — instead of GitHub Actions. This gets auto-deploy-on-merge *and* automatic preview builds for other branches with zero GitHub Actions minutes and no Cloudflare token stored as a GitHub secret (Cloudflare's own GitHub App handles auth). The first deploy is still done manually from your local machine (bootstraps the Worker under the right name and sets initial secrets) before Workers Builds is connected. The existing `wrangler-action`-based `deploy` job in `ci.yml` is parked (`if: false`, not deleted) and documented as a fallback alternative, since it's now fully superseded by Workers Builds.

**Decided config**: Worker renamed to `10x-home-maintenance` (matches repo/package.json).

**Artifact handling**: the approved plan persists at `context/changes/deployment/deployment-plan.md`. Phase 0 wrote this plan to that path as the first execution step immediately upon approval; each later phase appends its actual outcome (dates, verification results, decisions) to the same file as it completes.

______________________________________________________________________

## Phase 0 — Persist approved plan + pre-flight

- [ ] Create `context/changes/deployment/` (doesn't exist yet) and write this approved plan to `context/changes/deployment/deployment-plan.md` verbatim, as the audit-trail artifact for this change.

- [ ] Commit immediately, separate from later config-change commits:

  ```bash
  git add context/changes/deployment/deployment-plan.md
  git commit -m "docs: record approved Cloudflare Workers deploy plan"
  ```

- [ ] `git status` — confirm clean working tree; create branch `chore/cloudflare-deploy-setup`

## Phase 1 — Prerequisites: CLI & Supabase configuration

Both CLIs are already project devDependencies (`wrangler`, `supabase` in `package.json`) — always invoke via `npx`, never a global install, so the pinned version matches CI/teammates.

**Cloudflare / Wrangler** — confirmed done, verified live on 2026-08-23:

- [x] Cloudflare account exists and Wrangler is authenticated locally (OAuth). `npx wrangler whoami` → account `Kucharskilukasz88@gmail.com's Account`, Account ID `ea582f0e95f1886a2427e470496cc07f`.

- [x] Sanity check before the Phase 2 rename — confirmed **neither** name has a prior orphaned deployment (both return `This Worker does not exist on your account` [code: 10007], i.e. a clean slate):

  ```bash
  npx wrangler deployments list --name 10x-astro-starter     # confirmed: does not exist
  npx wrangler deployments list --name 10x-home-maintenance  # confirmed: does not exist
  ```

- [ ] Do **not** create a scoped `CLOUDFLARE_API_TOKEN` GitHub secret — Workers Builds (Phase 6) doesn't need one stored in GitHub at all. If Workers Builds' own setup UI prompts you to select/create an API token for its internal use, create a **fresh** scoped token then (Account Resources → this account only, `Account.Workers Scripts:Edit` + `Account.Workers Tail:Read`, Zone Resources → None) — Cloudflare's own docs flag that a stale/deleted token left selected in that dropdown fails silently at build time, so always pick a freshly created one.

**Supabase** — confirmed done, verified live on 2026-08-23:

- [x] Logged in (`npx supabase projects list` succeeds without prompting for auth).

- [x] Hosted project created: `10x-home-maintenance`, ref `kiuuewutycdwahmshpxm`, region `eu-central-1`, status `ACTIVE_HEALTHY`.
  Note: the same account also has an unrelated, unlinked `10x-smart-budget-ai` project (ref `lzjqsbemuzuneylwozeq`, `INACTIVE`) from a different exercise — not used by this app, ignore it.

- [x] Local project linked to the hosted one (`"linked": true` for `10x-home-maintenance` in `supabase projects list`).

- [ ] Retrieve/confirm the two values this app needs as `SUPABASE_URL`/`SUPABASE_KEY` before Phase 4: `SUPABASE_URL` is derivable as `https://kiuuewutycdwahmshpxm.supabase.co`; the **anon/public** key still needs to come from dashboard → Project Settings → API (not fetched here to avoid printing a key into this conversation). Do not use the `service_role` key — it bypasses RLS and must never be used in this client-facing context.

- [x] No local migrations exist yet (`supabase/migrations/` is absent), so there's nothing to `supabase db push` right now — note this so the first time a migration *is* created, pushing it to the hosted project becomes a required pre-deploy step, not implied.

**GitHub CLI** — confirmed done, verified live on 2026-08-23:

- [x] `gh auth status` → logged in as `banan1988` (active account).

- [x] `gh repo view` confirms the connected repo is `10x-home-maintenance` with default branch `main`, matching this plan's assumptions.

## Phase 2 — Config hygiene

- [ ] `wrangler.jsonc`: rename `"name": "10x-astro-starter"` → `"name": "10x-home-maintenance"`. This is permanent once deployed (changing it later means redeploying under a new name and re-provisioning secrets) — locking it in now while there's no live traffic is the cheap time to do it. This name must also match what's entered in Workers Builds' dashboard setup (Phase 6) or the build fails.

- [ ] `package.json`: add a `deploy` script so manual publishing is a one-liner:

  ```json
  "deploy": "astro build && wrangler deploy"
  ```

- [ ] `.github/workflows/ci.yml`: park the existing `deploy` job in place (do not delete — preserves a working fallback) by adding `if: false` and a comment pointing at the real auto-deploy mechanism:

  ```yaml
  deploy:
    name: "Deploy to Cloudflare Workers"
    needs: ci
    # Disabled: auto-deploy on push to main is handled by Cloudflare Workers Builds (native Git
    # integration, see context/changes/deployment/deployment-plan.md "Cloudflare Workers Builds"
    # section), not GitHub Actions. This job is kept as a documented fallback alternative.
    if: false
    ...
  ```

  Leave everything else in the job untouched so it's a working reference, not dead code to rewrite later.

- [ ] `.env.example` — already correct (verified directly: contains both `SUPABASE_URL=` and `SUPABASE_KEY=`). No change needed.

- [ ] No separate `.dev.vars.example` — README's existing `cp .env.example .dev.vars` instruction is sufficient since both files' placeholder content is identical today.

- [ ] `README.md` — update "Deployment": auto-deploy on merge to `main` via Cloudflare Workers Builds (not GitHub Actions), `npm run deploy` for manual/local deploys, Worker name `10x-home-maintenance`, and that any deploy promotes to 100% production traffic immediately (no gradual rollout). Update "CI": note the Actions `deploy` job is parked/disabled, kept only as a fallback reference.

- [ ] `CLAUDE.md` — same updates: add `npm run deploy` to Commands, note in the CI section that production auto-deploy is Cloudflare Workers Builds, not the (parked) Actions job.

- [ ] Commit:

  ```bash
  git add wrangler.jsonc package.json .github/workflows/ci.yml README.md CLAUDE.md
  git commit -m "chore: rename Worker, add manual deploy script, park Actions deploy job"
  ```

## Phase 3 — Local dry-run validation (no network deploy)

- [ ] `npm run build && npx wrangler deploy --dry-run` — validates the renamed config and adapter bundling without touching production. Fix and re-run if it fails before proceeding.

## Phase 4 — First real (manual) deploy + secrets

Bootstraps the Worker under the correct name before Workers Builds ever touches it.

- [ ] `npx wrangler deploy` — creates the Worker under `10x-home-maintenance`.

- [ ] Set production runtime secrets, using the real values retrieved in Phase 1:

  ```bash
  npx wrangler secret put SUPABASE_URL
  npx wrangler secret put SUPABASE_KEY
  ```

- [ ] Verify: `npx wrangler secret list` (both keys present), `npx wrangler deployments list` (shows the version just deployed).

- [ ] In a separate terminal, `npx wrangler tail` while manually loading the homepage at `https://10x-home-maintenance.<account-subdomain>.workers.dev` — confirm SSR renders, zero exceptions streamed.

## Phase 5 — Risk verification smoke tests (against the live URL from Phase 4)

Do these before trusting the deploy beyond a homepage check, and before connecting auto-deploy in Phase 6.

- [ ] **astro#15434 check** (low risk, `compatibility_date` already post-fix, but cheap to confirm): sign in via `/auth/signin` with a real test account, then load `/dashboard`. Pass = page renders normally with the user's email visible as text. Fail signal = literal `[object Object]` string anywhere in the response. **If it fails** (unexpected given the compat date): add `"disable_nodejs_process_v2"` to `wrangler.jsonc`'s `compatibility_flags` and redeploy — the confirmed community workaround from the issue thread.
- [ ] **`@supabase/realtime-js`/`ws` check**: while running Phase 4's `wrangler tail`, exercise all three auth routes — `POST /api/auth/signup` (fresh test email), `POST /api/auth/signin`, `POST /api/auth/signout` — confirm expected redirects and zero exceptions referencing `ws`, `net`, `tls`, or `Phoenix` in the tail output.
- [ ] **Silent-misconfiguration check** (`createClient()` returns `null` on missing secrets rather than throwing): `curl -i -X POST https://<worker-url>/api/auth/signin -F "email=bad@test.invalid" -F "password=wrong"` — confirm the redirect error is a real Supabase auth error, **not** `error=Supabase%20is%20not%20configured`.
- [ ] **Cookie check**: after a successful signin, inspect the `Set-Cookie` header — confirm `Secure` is present (HTTPS `workers.dev` origin) and `SameSite=Lax` (safe here, all auth flows are same-origin form posts).
- [ ] **No-cookie negative control**: `curl -s https://<worker-url>/dashboard` (no session cookie) → must redirect to `/auth/signin`.

## Phase 6 — Connect Cloudflare Workers Builds (auto-deploy on merge, no GitHub Actions)

Cloudflare's native Git integration — verified against current Cloudflare docs.

- [ ] Cloudflare dashboard → Workers & Pages → `10x-home-maintenance` → Settings → Builds → **Connect** → authorize the Cloudflare GitHub App for this repo (grants Cloudflare read access to the repo, not the other way around — no token goes into GitHub).
- [ ] **Root directory**: repo root (default) — `wrangler.jsonc` lives at the repo root, so no monorepo path configuration is needed.
- [ ] **Build command**: `npm run build`. **Deploy command**: leave default (`npx wrangler deploy` for the production branch). Confirm the Worker name shown in this dashboard matches `wrangler.jsonc`'s `name` (`10x-home-maintenance`) exactly — a mismatch is the #1 documented failure mode.
- [ ] **Git branch (production branch)**: `main`. Every other branch automatically gets the **preview deploy command** instead (`npx wrangler versions upload` by default) — a 0%-traffic preview build, not a production deploy. This gives PR-style previews for free, no custom CI job needed.
- [ ] **Environment variables — two separate sections, don't confuse them**:
  - Settings → **Environment variables** (build-time only, not accessible at runtime): add `SUPABASE_URL`/`SUPABASE_KEY` so the build step has them, mirroring what the existing (now-parked) Actions build step did.
  - Settings → **Variables & Secrets** (runtime — this is the same store `wrangler secret put` writes to): `SUPABASE_URL`/`SUPABASE_KEY` should already show up here from Phase 4's `wrangler secret put`; if not, add them here directly.
- [ ] Known gotchas to watch for (from Cloudflare's own troubleshooting docs): a Worker-name mismatch between dashboard and `wrangler.jsonc` → "Missing entry-point" error; builds have a 20-minute timeout (unlikely to hit for this app); a stale/deleted API token left selected in any token dropdown during setup fails silently — always pick/create a fresh one (see Phase 1).
- [ ] Commit and push the branch from Phase 0/2 as a PR, confirm Workers Builds fires an automatic **preview** build for it (check the dashboard's Builds tab, or the PR itself if Cloudflare posts a check/comment) — this is the live proof the branch-based preview rule works before trusting `main`.
- [ ] Merge the PR — confirm Workers Builds fires an automatic **production** deploy (dashboard Builds tab shows a new production deployment tied to the merge commit). This is the live proof of "auto-deploy on merge to main."

## Phase 7 — Rollback drill (one-time, before it's ever needed for real)

- [ ] Make a trivial no-op change, merge to `main` (triggers Workers Builds again) to create a second version — or `npx wrangler deploy` locally if you'd rather not wait on a merge.
- [ ] `npx wrangler deployments list`, then `npx wrangler rollback <prior-version-id>` — confirm traffic reverts, re-run Phase 5's no-cookie/signin checks against the rolled-back version to confirm it still works.
- [ ] Roll forward again to the latest version so production isn't left pinned to the drill's older version.
- [ ] Note for the record (goes in Phase 9's artifact): `wrangler rollback` only reverts Worker code — a future Supabase migration shipped alongside a release is not covered and must be reverted separately. No `supabase/migrations` exist yet (Phase 1), so this is currently theoretical.

## Phase 8 — One-time dashboard checks

- [ ] Confirm `observability.enabled: true` is actually surfacing logs in the Cloudflare dashboard (Workers & Pages → your Worker → Logs) using traffic from Phases 4–7.
- [ ] "Auto Minify"/"Rocket Loader" zone-level settings (can break React 19 island hydration) don't apply yet since there's no custom domain/zone attached — re-check specifically if/when a custom domain is added later.

## Phase 9 — Finalize `context/changes/deployment/deployment-plan.md` with outcomes

Append/update the plan persisted in Phase 0 with what actually happened:

- **What's deployed**: Cloudflare Workers, name `10x-home-maintenance`, default `workers.dev` domain, first deploy manual (`npm run deploy`), auto-deploy on merge to `main` thereafter via **Cloudflare Workers Builds** (Git integration) — not GitHub Actions.

- **Secrets/config map**: `.env` (Node local) / `.dev.vars` (Cloudflare local dev) / Worker runtime secrets (`wrangler secret put`, also visible/editable under Workers Builds' "Variables & Secrets") / Workers Builds' separate build-time-only "Environment variables" — four distinct locations kept in sync manually.

- **Supabase**: hosted project created and linked (`supabase link`), project ref recorded, no migrations yet — first migration must be `supabase db push`-ed before it takes effect on the hosted project.

- **Decisions recorded**: Worker renamed pre-first-deploy; auto-deploy via Cloudflare Workers Builds chosen over GitHub Actions (no token stored in GitHub, free preview builds per-branch); existing Actions `deploy` job parked via `if: false` as a documented fallback, not deleted.

- **Risk register outcomes**: astro#15434 — confirmed fixed upstream for `compatibility_date >= 2026-02-24`, this repo uses `2026-05-08`, verified clean via Phase 5 smoke test on `<date>`. `@supabase/realtime-js`/`ws` — verified no exceptions during live auth-flow smoke test on `<date>`. Rollback drill completed on `<date>`.

- **Fallback: GitHub Actions CD** (reference only, not active) — if Workers Builds is ever disconnected, the parked `deploy` job in `ci.yml` can be revived: create a scoped `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`, add as GitHub repo secrets, remove the job's `if: false` line. A `preview` job design (using `wrangler-action@v4`'s `command: versions upload`, output via its `command-output` variable — confirmed against the action's README) is available as a documented pattern if PR-preview-via-Actions is ever needed instead of Workers Builds' built-in equivalent.

- Commit the finalized outcomes:

  ```bash
  git add context/changes/deployment/deployment-plan.md
  git commit -m "docs: record Cloudflare Workers deploy outcomes"
  ```

______________________________________________________________________

## Verification Summary

End-to-end proof this plan worked: (1) `https://10x-home-maintenance.<subdomain>.workers.dev` loads and serves SSR content, (2) sign-in/sign-up/sign-out all function against the real hosted Supabase project with no console/tail exceptions, (3) `/dashboard` renders the authenticated user's email with no `[object Object]` corruption, (4) a PR triggered an automatic Workers Builds preview and merging it triggered an automatic production deploy — proving auto-deploy-on-merge works without GitHub Actions, (5) a rollback drill has been performed at least once and confirmed working, (6) `context/changes/deployment/deployment-plan.md` documents all of the above plus the GitHub Actions fallback path.

## Critical Files

- `wrangler.jsonc` — rename
- `package.json` — add `deploy` script
- `.github/workflows/ci.yml` — park `deploy` job in place
- `README.md`, `CLAUDE.md` — documentation updates
- `context/changes/deployment/deployment-plan.md` — new, final artifact
- `src/middleware.ts`, `src/lib/supabase.ts`, `src/pages/dashboard.astro`, `src/pages/api/auth/{signin,signup,signout}.ts` — verification targets only, no code changes planned
