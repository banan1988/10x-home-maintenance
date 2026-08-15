---
starter_id: 10x-astro-starter
package_manager: npm
project_name: home-maintenance
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers:
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

A solo user shipping a single-property maintenance tracker in a 3-week after-hours budget needs a battle-tested,
agent-friendly starter that handles auth, a database, and edge deploy out of the box rather than assembling them
piecemeal. 10x-astro-starter is the recommended default for (web-app, js), clears all four agent-friendly gates,
and its Astro API routes cover the PRD's CRUD-via-API requirement alongside the UI. Auth is in scope (email/password
registration, login, logout); payments, realtime, and AI are explicitly out of scope per the PRD's non-goals. CI
runs on GitHub Actions with auto-deploy-on-merge, and deployment defaults to Cloudflare Workers (via the
`@astrojs/cloudflare` adapter and `wrangler deploy`) — both the starter's out-of-the-box shape, chosen to keep the
3-week timeline realistic.
