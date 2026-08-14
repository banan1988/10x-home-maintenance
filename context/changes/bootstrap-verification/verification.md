---
bootstrapped_at: 2026-08-14T18:54:05Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: home-maintenance
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: home-maintenance
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
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
```

### Why this stack

A solo user shipping a single-property maintenance tracker in a 3-week after-hours budget needs a battle-tested,
agent-friendly starter that handles auth, a database, and edge deploy out of the box rather than assembling them
piecemeal. 10x-astro-starter is the recommended default for (web-app, js), clears all four agent-friendly gates,
and its Astro API routes cover the PRD's CRUD-via-API requirement alongside the UI. Auth is in scope (email/password
registration, login, logout); payments, realtime, and AI are explicitly out of scope per the PRD's non-goals. CI
runs on GitHub Actions with auto-deploy-on-merge, and deployment defaults to Cloudflare Pages — both the starter's
out-of-the-box shape, chosen to keep the 3-week timeline realistic.

## Pre-scaffold verification

| Signal      | Value                                                     | Severity | Notes                                                                 |
| ----------- | --------------------------------------------------------- | -------- | --------------------------------------------------------------------- |
| npm package | not run                                                   | n/a      | `cmd_template` starts with `git clone`; no npm CLI package to resolve |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-05-17 | fresh    | from card `docs_url`                                                  |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 19
**Conflicts (.scaffold siblings)**: CLAUDE.md.scaffold, README.md.scaffold
**.gitignore handling**: moved silently (absent in cwd)
**.bootstrap-scaffold cleanup**: deleted (nested `.git/` removed first, per the git-clone strategy)

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: 1 CRITICAL, 13 HIGH, 7 MODERATE, 2 LOW (23 total; 895 dependencies audited — 449 prod, 316 dev, 131 optional)
**Direct vs transitive**: 0/1/2/0 direct of total 1/13/7/2 — only `astro` itself (HIGH) is a direct dependency; the rest, including the sole CRITICAL (`tar`), are transitive

#### CRITICAL findings

- `tar` — transitive (via `tar` chain). Fix available via `npm audit fix`.

#### HIGH findings

- `astro` — **direct**. Fix available.
- `brace-expansion` — transitive (via `brace-expansion`). Fix available.
- `devalue` — transitive (via `devalue`). Fix available.
- `fast-uri` — transitive (via `fast-uri`). Fix available.
- `js-yaml` — transitive (via `js-yaml`). Fix available.
- `miniflare` — transitive (via `sharp`, `undici`, `ws`). Fix available.
- `nanoid` — transitive (via `nanoid`). Fix available.
- `postcss` — transitive (via `postcss`). Fix available.
- `sharp` — transitive (via `sharp`). Fix available.
- `svgo` — transitive (via `svgo`). Fix available.
- `undici` — transitive (via `undici`). Fix available.
- `vite` — transitive (via `vite`). Fix available.
- `ws` — transitive (via `ws`). Fix available.

#### MODERATE findings

2 direct, 5 transitive (see raw `npm audit --json` output for full advisory IDs — not reproduced here for brevity; re-run `npm audit` locally for the live report).

#### LOW / INFO findings

2 low-severity findings, both transitive.

## Hints recorded but not acted on

| Hint                    | Value                |
| ----------------------- | -------------------- |
| bootstrapper_confidence | first-class          |
| quality_override        | false                |
| path_taken              | standard             |
| self_check_answers      | (none provided)      |
| team_size               | solo                 |
| deployment_target       | cloudflare-pages     |
| ci_provider             | github-actions       |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true                 |
| has_payments            | false                |
| has_realtime            | false                |
| has_ai                  | false                |
| has_background_jobs     | false                |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:

- Review `CLAUDE.md.scaffold` and `README.md.scaffold` and decide which parts of the starter's version to merge into your existing `CLAUDE.md` / `README.md`.
- Address audit findings per your project's risk tolerance — run `npm audit` for the live report, or `npm audit fix` for the auto-fixable subset. The sole CRITICAL (`tar`) and most HIGH findings are transitive.
- `git init` is not needed — this directory already has its own git history; the cloned starter's `.git/` was discarded before move-up.
