---
project: home-maintenance
researched_at: 2026-08-15
recommended_platform: Cloudflare Workers
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript/JavaScript
  framework: Astro 6 SSR + React 19 islands
  runtime: Cloudflare Workers (@astrojs/cloudflare adapter)
---

## Recommendation

**Deploy on Cloudflare Workers.**

The project is already scaffolded for it — `@astrojs/cloudflare` with `output: "server"`, `wrangler deploy` documented in
`CLAUDE.md`, and a GitHub Actions `deploy` job wired to `wrangler-action` on push to `main`. It swept all five
agent-friendly criteria (CLI-first, managed/serverless, agent-readable docs, stable deploy API, MCP integration — all
Pass), the free tier comfortably covers the PRD's low-traffic MVP scale (100k requests/day), and it matches every
interview answer: no persistent-connection requirement, cost-sensitive (free tier suffices), no strong platform
familiarity to break a tie toward, single-region is fine (edge is a bonus, not a requirement), and Supabase stays
external without friction. Switching to any alternative would mean discarding a working, zero-cost deployment path
to chase marginal gains elsewhere.

## Platform Comparison

| Platform               | CLI-first                            | Managed/Serverless | Agent-readable docs                   | Stable deploy API | MCP/Integration                           | Score |
| ---------------------- | ------------------------------------ | ------------------ | ------------------------------------- | ----------------- | ----------------------------------------- | ----- |
| **Cloudflare Workers** | Pass                                 | Pass               | Pass                                  | Pass              | Pass                                      | 5/5   |
| Vercel                 | Pass                                 | Pass               | Pass                                  | Pass              | Partial (MCP beta)                        | 4.5/5 |
| Railway                | Partial (rollback semi-manual)       | Pass               | Pass                                  | Partial           | Partial (MCP evolving, no GA label)       | 3.5/5 |
| Netlify                | Partial (no rollback CLI)            | Pass               | Pass                                  | Partial           | Partial (MCP not GA-labeled)              | 3.5/5 |
| Render                 | Partial (no rollback CLI)            | Pass               | Partial (no llms.txt/markdown source) | Partial           | Pass (GA MCP + published skills catalog)  | 3.5/5 |
| Fly.io                 | Partial (manual image-hash rollback) | Pass               | Pass                                  | Partial           | Fail (community-only MCP, no first-party) | 3/5   |

Notes per platform:

- **Cloudflare Workers**: `wrangler deploy`/`wrangler rollback`/`wrangler tail` are all GA and deterministic; rollback
  history was recently extended to 100 versions. Docs are served as markdown/llms.txt for every page (GA). Official
  hosted MCP server at `mcp.cloudflare.com` (GA, OAuth). Free tier: 100k requests/day, comfortably covers the PRD's
  small-user, low-QPS target.
- **Vercel**: full parity with Cloudflare on CLI/deploy/docs, but **Node 26 is not yet supported for production
  Functions** — only Node 24/22/20 are GA there (26 is GA only in Vercel Sandboxes as of 2026-05-12). Would require
  overriding `engines.node` away from the project's `.nvmrc` (26.7.0). MCP server is public beta. Hobby tier's
  non-commercial license restriction is also worth flagging if this ever monetizes.
- **Railway**: no hard Node-version ceiling (Railpack auto-detects current majors), decent GitHub-hosted docs, but
  **no outbound IPv6** — Supabase's direct connection is IPv6-only, so it would require switching to Supabase's
  Session Pooler. Astro's Node adapter also needs an explicit `HOST=0.0.0.0` fix (binds to `localhost` by default,
  causing 502s on Railway). No permanent free tier; realistic cost ~$5-10/mo.
- **Netlify**: adapter swap is low-effort, but shares Vercel's Node-version problem (Netlify's Functions runtime
  defaults to Node 24, not 26) and has no CLI rollback subcommand (dashboard/API only). Credit-based pricing since
  April 2026 makes cost estimation at 100k req/mo fuzzy — likely needs the $9/mo Personal tier for headroom.
- **Render**: has the strongest MCP/agent story of the alternatives (official GA MCP server plus a published,
  MIT-licensed Agent Skills catalog aimed at Claude Code/Cursor/Codex), but its free tier spins down after 15 min
  of inactivity (unsuitable for a live MVP demo) and its CLI has no rollback subcommand — rollback is dashboard or
  REST API only. Cheapest usable tier is $7/mo.
- **Fly.io**: fully GA CLI/docs, and cheapest raw compute (~$2-6/mo always-on), but requires authoring and
  maintaining a Dockerfile + `fly.toml` (no auto-detection), and its scale-to-zero option (to hit the lower price
  point) reintroduces cold starts that work against the PRD's "perceptible instant" dashboard-update requirement.
  MCP integration is community-maintained only, not first-party.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Already the deployed target — zero migration cost, 5/5 on the agent-friendly criteria, and the only platform with
no version-compatibility friction against the project's pinned Node 26.7.0 (Workers isn't a Node runtime at all;
`nodejs_compat` polyfills what's needed). Free tier removes cost as a concern entirely at this scale.

#### 2. Vercel

Matches Cloudflare on CLI, docs, and deploy-API maturity, and would be the natural second choice if Workers
somehow became unworkable. The Node 26→24 downgrade for production Functions is the deciding gap — it's a real,
if probably harmless, version mismatch against the project's stated runtime.

#### 3. Railway

No version ceiling and workable free-tier-adjacent pricing, but two concrete migration frictions (IPv6/Supabase
pooler, host-binding fix) plus an ongoing ~$5-10/mo cost make it a clear third against an already-working, free,
zero-effort incumbent.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. Astro 6 + `nodejs_compat` + middleware has an open GitHub issue (astro#15434) producing `[object Object]` SSR
   output — exactly the code path this app's auth middleware (`src/middleware.ts`, runs on every request) depends
   on. Untested, this could break silently in production.
1. Workers isn't real Node.js — it polyfills via `nodejs_compat`. A transitive dependency (Supabase JS client, zod,
   etc.) touching an unpolyfilled Node built-in breaks only at deploy time, not at local `npm run build`.
1. `astro:env/server` vars must be separately wired into `wrangler.jsonc`/`.dev.vars` bindings, not just `.env` — a
   recurring source of "works in dev, secret undefined in prod" bugs.
1. Vendor lock-in on Workers-specific primitives (bindings, `context.locals.runtime`) means a future platform swap
   costs more than an adapter change — session/cookie code tied to Workers runtime would need rewriting.
1. `tech-stack.md`'s stale `cloudflare-pages` hint (caught during this research) shows foundation docs already
   drift from reality — a pattern that could recur with `infrastructure.md` itself if not revisited.

### Pre-Mortem — How This Could Fail

The team deployed the Astro 6 SSR app on Cloudflare Workers for the MVP demo. Six months later, the pipeline broke
silently: a routine Supabase SDK bump pulled in a Node built-in not covered by `nodejs_compat`. The build compiled
fine locally on Node 26, `wrangler deploy` succeeded in CI, but the live site 500'd on every authenticated route —
no staging deploy existed, only auto-deploy-on-merge straight to production. Separately, the Astro middleware bug
(#15434) had been quietly dormant thanks to a coincidental patch version, until a dependency bump reintroduced it,
corrupting SSR output for logged-in users only — the exact segment the demo depended on. Nobody had ever directly
tested the `nodejs_compat` + middleware interaction; it had been copied from the bootstrapper and never revisited.
The stale `cloudflare-pages` hint turned out to be symptomatic: foundation docs drifted from reality early, and
nobody built a habit of reconciling them, foreshadowing the eventual production surprise from month one.

### Unknown Unknowns

- Workers' request model isn't Node.js — "works locally" is a weaker signal here than on any Node-based platform,
  since some npm packages fail only under the partial `nodejs_compat` polyfill.
- `wrangler deploy` from CI needs a scoped API token with Workers-edit permission; a later least-privilege
  tightening can silently break deploys with an unhelpful 403.
- Cloudflare's zone-level "Auto Minify" setting (unrelated to the Worker deploy itself) can mangle React 19 island
  hydration — a production-only bug with no local repro.
- `wrangler rollback` only reverts the Worker's code/version — it does **not** revert a Supabase schema migration
  shipped in the same release, so "instant rollback" is only half the story if a migration went out alongside.
- Free-tier CPU-time limits (10ms/invocation) are generous today but invisible locally — there's no way to
  reproduce Workers' CPU-time enforcement outside production.

## Operational Story

- **Preview deploys**: Cloudflare Workers builds preview URLs per Wrangler version upload; for PR-based previews,
  wire the GitHub Actions workflow to run `wrangler versions upload` on pull requests (distinct from `wrangler deploy`, which promotes to 100% production traffic) — this needs to be added to `.github/workflows/ci.yml`
  alongside the existing `deploy` job, which currently only fires on push to `main`.
- **Secrets**: `SUPABASE_URL` / `SUPABASE_KEY` are declared server-only in `astro.config.mjs`'s `env.schema`. Locally
  they live in `.dev.vars` (gitignored); in production they must be set via `wrangler secret put <NAME>` or the
  Cloudflare dashboard — CI's `SUPABASE_URL`/`SUPABASE_KEY` repo secrets (used for the build step) are a separate
  concern from the Worker's runtime secrets and must both be kept in sync manually.
- **Rollback**: `wrangler rollback [version-id]` reverts 100% of traffic to a prior version near-instantly (up to
  100 versions of history). Caveat: this only reverts Worker code — any Supabase migration shipped in the same
  release is not rolled back and must be reverted separately.
- **Approval**: an agent may run `wrangler deploy`/`wrangler versions upload` and `wrangler tail` unattended for
  routine iteration. A human must approve: rotating `SUPABASE_KEY` (breaks all active sessions), running a Supabase
  migration that drops or alters a column, and any change to the GitHub Actions `deploy` job itself (irreversible
  blast radius: production).
- **Logs**: `wrangler tail` streams live console/exception logs from the deployed Worker; the official MCP server
  (`mcp.cloudflare.com`) also exposes structured, read-only account/resource inspection for an agent operating via
  Claude Code without shelling out to `wrangler`.

## Risk Register

| Risk                                                                                                                                                                | Source           | Likelihood | Impact | Mitigation                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nodejs_compat` + Astro middleware produces corrupted SSR output for authenticated routes (astro#15434)                                                             | Devil's advocate | M          | H      | Smoke-test the auth flow against a real Workers preview deploy before relying on middleware in production; pin the Astro version known to work and re-test on every Astro upgrade |
| A dependency update introduces a Node built-in not covered by `nodejs_compat`, passing local build but failing only on deploy                                       | Pre-mortem       | M          | H      | Add a `wrangler versions upload` preview-deploy step to CI on every PR so incompatibilities surface before merge, not after                                                       |
| Secrets set in `.env`/CI repo secrets are not mirrored into Worker runtime secrets (`wrangler secret put` / `.dev.vars`), causing "works in dev, undefined in prod" | Devil's advocate | M          | M      | Document the three separate secret locations (`.env`, `.dev.vars`, Worker secrets) in `CLAUDE.md`; add a pre-deploy checklist item                                                |
| `wrangler rollback` reverts Worker code but not an accompanying Supabase schema migration, leaving app and DB out of sync after a rollback                          | Unknown unknowns | L          | H      | Treat DB migrations as forward-only per release; if a bad release included a migration, write and run an explicit down-migration rather than assuming rollback covers it          |
| Workers-specific vendor lock-in (bindings, `context.locals.runtime`) raises future platform-swap cost                                                               | Devil's advocate | L          | M      | Keep Supabase-facing code platform-agnostic; isolate any Workers-runtime-specific code behind a thin adapter layer in `src/lib/`                                                  |
| CI's `wrangler deploy` step relies on an API token whose permissions could later be tightened, breaking deploys with an opaque 403                                  | Unknown unknowns | L          | M      | Document the required token scope in `CLAUDE.md`'s CI section; verify token scope whenever the Cloudflare account's access policies change                                        |
| Zone-level "Auto Minify" or similar dashboard settings can silently break React island hydration in production only                                                 | Unknown unknowns | L          | M      | Confirm Auto Minify is disabled for this zone as part of initial deploy setup; note it in the deploy plan as a one-time manual check                                              |
| Free-tier CPU-time limit (10ms/invocation) is invisible until an unusually heavy request trips it                                                                   | Unknown unknowns | L          | M      | Monitor `wrangler tail`/Cloudflare dashboard for CPU-time warnings after launch; revisit if the task-list serialization grows significantly                                       |
| Foundation docs (`tech-stack.md`) already drifted from actual deployment reality (`cloudflare-pages` vs. Workers)                                                   | Research finding | M          | L      | Fix the stale hint in `tech-stack.md` now; revisit `infrastructure.md` itself whenever the deploy setup changes materially                                                        |

## Getting Started

1. Fix the stale hint in `context/foundation/tech-stack.md` (`deployment_target: cloudflare-pages` → `cloudflare-workers`) so foundation docs match what's actually deployed.
1. Wrangler is already a project devDependency (`wrangler` in `package.json`) — always invoke it via `npx wrangler`, not a global install, so the pinned version matches CI. First-time local auth: `npx wrangler login`; verify with `npx wrangler whoami`. Docs: [developers.cloudflare.com/workers/wrangler](https://developers.cloudflare.com/workers/wrangler/).
1. Verify the auth flow works end-to-end against a real Workers deploy (not just `npm run dev`/`npm run preview`) — this directly tests the `nodejs_compat` + middleware risk flagged above: `npm run build && npx wrangler deploy --dry-run` first, then a real preview deploy.
1. Set production secrets via `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY` (do not rely on `.env`/`.dev.vars` reaching production).
1. Add a `wrangler versions upload` step to `.github/workflows/ci.yml` on pull requests (distinct from the existing `deploy` job's `wrangler deploy` on push to `main`) so incompatibilities surface in PR review, not after merge.

## Out of Scope

The following were not evaluated in this research:

- Docker image configuration
- CI/CD pipeline setup (beyond the specific PR-preview recommendation above, which follows directly from the risk register)
- Production-scale architecture (multi-region, HA, DR)
