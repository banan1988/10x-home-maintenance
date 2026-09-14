# Test Plan

> Phased test rollout for this project. The strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases roll out.
> Read this before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when the plan goes stale (see §8).
>
> Last updated: 2026-09-11 (rollout reordered: key-path e2e moved from Phase 1
> to Phase 5 as a capstone over the API/UI/logic conventions built in Phases
> 1–4; status reset to `not started` — prior work exists only on the unmerged
> branch `chore/testing-e2e-critical-path` and will be redone, not resumed)

## 1. Strategy

Testing in this project is governed by three non-negotiable rules:

1. **Cost × signal.** The cheapest test that gives real signal for a given
   risk wins. We don't promote to e2e because e2e "feels safer." We don't put
   a vision model on a deterministic diff that already catches the
   regression.
1. **User concerns are first-class evidence.** Risks anchored in "the team is
   worried about X, and a failure would show up somewhere in area Y" carry
   the same weight as PRD lines or hot-spot scan data.
1. **Risks are scenarios, not code locations.** This plan documents _what
   could break_ and _why we believe it's likely_ — based on documents,
   interview, and code signal (churn, structure, existing test base). It does
   NOT claim to know which line is responsible for a failure. That knowledge
   is delivered by `/10x-research` during each rollout phase. If the plan and
   the research disagree on where a failure lives, the research is the
   source of truth.

Hot-spot scan scope used to weight likelihood: `src/`, `supabase/`
(excluding `node_modules`, `dist`, `build`) — 20 commits in the last 30 days.

## 2. Risk Map

Primary failure scenarios this project must guard against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user/business
terms, not test names. The Source column cites _the evidence that raised
this risk to the top_ — never a specific file as "where the failure lives"
(that's research's job, see §1 rule 3).

| #   | Risk (failure scenario)                                                                                                                                        | Impact | Likelihood | Source (evidence — not location)                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | Leaking or overwriting another user's task (IDOR) via a new or modified API endpoint                                                                           | High   | High       | PRD Guardrails/NFR/Access Control; interview Q1, Q2, Q4; roadmap S-03 (new, not-yet-built API surface)                |
| 2   | A new or changed route under `/api/*` reaches production without its own auth check, because middleware only protects pages, not APIs                          | High   | High       | interview Q1, Q2, Q4 (named explicitly, including as a past incident); hot-spot dir `src/pages/api/` — 13 commits/30d |
| 3   | The next roadmap slice (S-03, public CRUD API, FR-011) ships without the same level of auth/isolation testing as S-01/S-02                                     | High   | Medium     | roadmap: S-03 status `proposed`; PRD FR-011; interview Q1                                                             |
| 4   | A shared UI component (Add/Edit/Delete/Complete dialogs, common layout) drifts visually after a change, or client-side validation stops blocking invalid input | High   | High       | interview Q2, Q3, Q5; hot-spot dir `src/components/tasks/` — 11 commits/30d                                           |
| 5   | No e2e test of the key user flow (login → add task → see on dashboard → edit/complete/delete), despite this being an explicit PRD guardrail                    | High   | High       | PRD Guardrails ("a working E2E test of the key user flow exists"); health-check.md (no e2e stage in CI); interview Q5 |
| 6   | The currently-tested status boundary (exactly 7 days, exactly today) silently stops honoring FR-008/FR-009 after a future change to status/date logic          | High   | Medium     | PRD FR-008/FR-009 (fixed 7-day threshold); interview Q1, Q3, Q4; hot-spot dir `src/lib/` — 13 commits/30d             |
| 7   | A future change (e.g. in S-03) introduces a string-built SQL query and opens SQL injection, because nothing guards against it today                            | Medium | Low        | interview Q2 (explicit concern about SQL injection); PRD Access Control/NFR (server must not trust the client)        |

### Risk Response Guidance

| Risk | What proves protection                                                                                                                                                                | What must be challenged                                                                                                                                                                                                                    | Context `/10x-research` must ground                                                                                                                 | Cheapest layer (hypothesis)                                                                                             | Anti-pattern to avoid                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| #1   | A request as user B against user A's task returns the same generic "not found" as for a nonexistent id, and never returns/mutates A's data — for every endpoint, present and future   | "RLS in the database is enough, the API layer doesn't need to check anything" — an assumption already made for existing mutations; needs verifying it holds for every route, including future ones                                         | Per-table/per-operation RLS policy definitions; whether any route uses a service-role client that bypasses RLS                                      | unit/integration on the route handler (two different users); e2e for only one full flow (see #5)                        | asserting only "an error appeared," without checking that none of the other user's data leaked into the response body |
| #2   | Every mutating/reading API route rejects a request from an unauthenticated user before touching the database — checked per route, not just representatively                           | "middleware protects everything" — false, it only protects pages, not `/api/*`; this was already a real incident                                                                                                                           | Current list of middleware-protected paths; whether a shared convention/helper exists for the auth check, or each route does it separately          | unit test per route (mock an unauthenticated user, assert redirect + mutation never invoked)                            | one "smoke" test on one route treated as proof the pattern works everywhere                                           |
| #3   | Before S-03 is considered done, every CRUD operation has the same auth/isolation coverage as #1/#2, plus a test proper to the public API contract, not just "endpoint returns 200"    | "S-03 is just existing routes exposed differently" — a public API contract differs from HTML forms; the test pattern carries over, the specific assertions don't                                                                           | What `/10x-research` finds only once S-03 actually enters planning — this risk is inherently about code that doesn't exist yet                      | unit/integration, same level as #1/#2                                                                                   | treating "slice shipped" as equivalent to "slice is tested"                                                           |
| #4   | After a shared component changes, every dialog still opens, renders its full field set, and still blocks an invalid submit before it reaches the server                               | "if the page loads with no console error, the UI is fine" — visual drift and validation silently letting invalid input through are failures a page load alone won't catch                                                                  | Which fields/components are actually shared across dialogs today; the current call path for client-side validation                                  | component test (render + submit a known-invalid input, assert it's blocked); some coverage already comes from e2e in #5 | a snapshot test of rendered markup — breaks on every cosmetic change and proves nothing about validation behavior     |
| #5   | A single e2e run logs in as a test user, adds a task, sees it on the dashboard with the correct status, then edits, marks complete, and deletes it — through the real UI              | "unit + API tests already prove the flow works" — they prove it per piece in isolation, not that the pieces are correctly wired together (routing, redirects, session, feedback)                                                           | Whether a Supabase test project/seeded test user exists; how session cookies are set in a headless browser; Playwright as the runtime               | e2e (Playwright) — the only risk on this map where e2e is the proper layer, not a fallback                              | an e2e test that only checks the happy path, without asserting cross-user isolation or invalid input handling         |
| #6   | Boundary values (exactly today, exactly +7 days, +8 days, -1 day, each frequency unit) still produce a result consistent with FR-008/FR-009 after any change to status/date logic     | "existing tests protect this forever" — a future change (or a duplicated copy of the logic from a parallel slice, which has already happened in this repo) could silently drift if the test asserts the current output instead of the rule | The current contract of the functions computing status/date and where boundary values are asserted today                                            | unit test (pure functions, no I/O)                                                                                      | an oracle test: asserting the function's current output instead of the literal boundary table from the FR             |
| #7   | Every task field and every dynamic route identifier is validated server-side before it reaches a Supabase query; no code path builds a query by concatenating strings with user input | "Supabase's query builder is inherently safe" — true for today's parameterized calls, but not a guarantee for future raw SQL/RPC                                                                                                           | Confirmation of whether any raw SQL / string-built query / RPC call exists in the repo today, and repeating this check for whatever S-03 introduces | static check/lint, or a single targeted test if such a spot is found                                                    | an "injection" test against parameterized query-builder calls — proves nothing new                                    |

## 3. Phased Rollout

Each row is a separate rollout phase that opens its own change folder via
`/10x-new`. Status moves left to right using the values below; the
orchestrator updates Status as artifacts appear on disk.

> **Reorder note (2026-09-11):** key-path e2e was originally Phase 1 (risk-first
> priority — it closes the highest-rated, currently-zero-coverage PRD
> guardrail). It has been moved to Phase 5 so it lands as a capstone once the
> API auth/isolation convention, shared-component UI regression, and
> status/date logic phases have already stabilized the surfaces it exercises
> (login, dialogs, task list, status). This defers, but does not drop, the
> PRD guardrail — do not let it slip past Phase 5.
>
> Status reset to `not started`: an unmerged branch `chore/testing-e2e-critical-path`
> holds an old `change.md`/`research.md` from before the reorder, but that work
> will be redone from scratch rather than resumed.

| #   | Phase name                                                  | Goal (one line)                                                                                                                           | Risks               | Test types                         | Status      | Change folder                     |
| --- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------- | ----------- | --------------------------------- |
| 1   | Auth/isolation contract — generalized and required for S-03 | Turn the existing auth-gate + cross-user isolation pattern into an explicit, testable convention required for S-03 too                    | #1, #2, #3          | unit + integration                 | complete    | `testing-auth-isolation-contract` |
| 2   | Shared-component UI regression                              | Prove dialogs and shared views don't drift visually and that validation still blocks invalid input after a change                         | #4                  | component tests                    | not started | —                                 |
| 3   | Status/date logic regression grid                           | Extend existing boundary tests to guard against future duplication/drift of the logic across parallel changes                             | #6                  | unit                               | complete    | `status-date-regression-grid`     |
| 4   | Injection guard + missing CI gates                          | Confirm no raw SQL exists today, add a safeguard for the future, close the CI gates already flagged as missing (typecheck, security scan) | #7                  | static check/lint + CI gate wiring | not started | —                                 |
| 5   | Key-path e2e                                                | Close the explicit PRD guardrail gap — prove the full login→add→dashboard→edit/complete/delete flow works as a coherent whole             | #5 (touches #1, #4) | e2e                                | not started | —                                 |

**Status vocabulary** (fixed — parser literals): `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`.

## 4. Stack

This project's classic test base. AI-native tools (where present) carry a
`checked:` date so future readers know which lines need re-verification.

| Layer                | Tool                                                   | Version             | Note                                                                                                                         |
| -------------------- | ------------------------------------------------------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| unit + integration   | Vitest                                                 | 4.1.10              | already configured (`vitest.config.ts`), 8 test files under `src/lib/` and `src/pages/api/tasks/`                            |
| API mocking          | `vi.hoisted()` + dynamic import of the Supabase client | (built into Vitest) | established mocking pattern for `@/lib/supabase`, continue it, don't introduce a separate library                            |
| e2e                  | none yet — see Phase 5                                 | —                   | none; Phase 5 introduces Playwright                                                                                          |
| UI component tests   | none yet — see Phase 2                                 | —                   | no React Testing Library — deliberately rejected in prior implementation plans; Phase 2 decides on the tool                  |
| accessibility        | none yet                                               | —                   | not flagged as a risk in the interview or the PRD — out of scope for this rollout                                            |
| (optional) AI-native | Playwright MCP — checked: 2026-09-11                   | n/a                 | useful for building/verifying e2e scenarios in Phase 5; doesn't replace deterministic assertions, only supports writing them |

**Stack grounding tools (current session):**

- Docs: context7 MCP — available in this session, to be used when planning Phase 5 (current Playwright API) and Phase 4 (security scan tooling); checked: 2026-09-11
- Search: Exa MCP (web_search/web_fetch) — available, not yet used in this session; checked: 2026-09-11
- Runtime/browser: Playwright MCP — available, key for Phase 5 (e2e); checked: 2026-09-11
- Provider/platform: GitHub MCP present in this session but not logged in — unused; Cloudflare/Supabase have no dedicated MCP in this session; checked: 2026-09-11

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase N" means the gate starts applying once that
rollout phase lands; before that, the gate is `planned`.

| Gate                              | Where                | Required?                 | What it catches                                                                         |
| --------------------------------- | -------------------- | ------------------------- | --------------------------------------------------------------------------------------- |
| lint                              | local + CI           | required (already wired)  | syntactic drift                                                                         |
| typecheck                         | local + CI           | required after §3 Phase 4 | type drift (today `npx astro check` only runs locally, not in CI — health-check.md)     |
| unit + integration                | local + CI           | required (already wired)  | logic regressions                                                                       |
| e2e on critical paths             | CI on PR             | required after §3 Phase 5 | broken key user flows                                                                   |
| UI component tests (dialogs/list) | local + CI           | required after §3 Phase 2 | validation/UI regressions in shared components                                          |
| security/dependency scan          | CI on PR             | required after §3 Phase 4 | dependency vulnerabilities, injection (health-check.md already flagged this as missing) |
| pre-prod smoke                    | between merge & prod | optional                  | environment-specific failures                                                           |

## 6. Cookbook Patterns

How to add new tests in this project. Each subsection fills in once the
matching rollout phase lands; until then it reads "TBD — see §3 Phase N."

### 6.1 Adding a unit test (established pattern)

- **Location**: colocated next to the module, e.g. `src/lib/<module>.test.ts`.
- **Naming**: `describe`/`it("should ...")`, file `<module>.test.ts`.
- **Reference test**: `src/lib/utils.test.ts`.
- **Run locally**: `npm run test`.

### 6.2 Adding an API route test (established pattern)

- **Auth check**: every `/api/*` route's handler must call `requireUser(context)`
  (`src/lib/auth.ts`) as its first step — `if (user instanceof Response) return user;`
  — instead of repeating the inline `if (!context.locals.user) ...` check.
- **Auth-check test**: every route's test file must prove the contract via
  `assertRequiresAuth(handler, buildContext, createClientMock)` from
  `@/test-utils/auth-contract`, instead of hand-writing the redirect +
  `createClientMock`-not-called assertions per file.
- **Cross-user case**: routes whose ownership check is deferred to RLS
  (i.e. the query only filters `.eq("id", ...)`, never `.eq("user_id", ...)`)
  must add a case asserting a request for another user's row produces the
  identical generic not-found redirect as a nonexistent-id request, using an
  id clearly labeled as belonging to another user (e.g. `"other-users-task"`).
- **Location**: colocated next to the route, e.g. `src/pages/api/tasks/[id].test.ts`.
- **Mocking policy**: mock only the Supabase client (`@/lib/supabase`,
  `vi.hoisted()` + dynamic import pattern), never mock the handler's internal
  logic.
- **Reference tests**: `src/lib/auth.test.ts` (the `requireUser()` helper
  itself); `src/pages/api/tasks/index.test.ts` (auth-check contract +
  `user_id` spoof-defense); `src/pages/api/tasks/[id].test.ts` (auth-check
  contract + cross-user not-found case).
- **Run locally**: `npm run test`.

### 6.3 Adding an e2e test

- TBD — see §3 Phase 5 (key flow login→add→dashboard→edit/complete/delete).

### 6.4 Adding a UI component test (dialog/list)

- TBD — see §3 Phase 2 (validation regression and visual drift in shared
  dialogs/task list).

### 6.5 Extending status/date logic boundary tests

- **Combined frequency × boundary grid**: when adding coverage for `computeDueDate`/`computeStatus`, don't
  test the frequency-unit axis (day/week/month/year) and the FR-009 status-boundary axis (-1/0/+7/+8 days)
  separately — combine them in one `it.each` table so every unit is proven against every boundary. Derive
  each row's `lastDoneDate`/`expectedDueDate` by hand from the oracle (FR-008/FR-009, `prd.md:110-119`), not
  via `addDays`/`addMonths`/`addYears` — a fixture computed with the same helper the code under test uses
  can't catch a bug in that helper. Also add at least one row combining a calendar-length edge (leap-year
  Feb, or a Jan-31→Feb-28/29 clamp) with a status boundary — those two things are easy to test separately and
  easy to forget testing together.
  - Reference test: `src/lib/status.test.ts` (`computeDueDate + computeStatus combined regression grid (FR-008/FR-009)`).
- **TZ-forced parsing-divergence regression**: a bare `YYYY-MM-DD` string parses differently depending on
  which `date-fns` function reads it — `parseISO` treats it as local midnight, `new Date(string)` treats it
  as UTC midnight. Two call sites parsing the same field with different functions will silently diverge at a
  timezone edge. To pin this in a test, force `process.env.TZ` to a timezone with a non-zero UTC offset (e.g.
  `America/New_York`) in `beforeAll`, and restore the original value in `afterAll` — `process.env.TZ` is
  process-global, so an unrestored override leaks into whichever test file Vitest runs next in the same
  worker.
  - Reference tests: `src/lib/task-schema.test.ts:95-121` (`addTaskSchema last_done_date timezone handling`,
    the original pattern); `src/lib/task-dto.test.ts` (`toTaskDto last_done_date timezone handling`, the same
    pattern applied to a second call site).
- **Caveat — this app's runtime doesn't honor `TZ` in dev or prod**: Cloudflare Workers (this app's actual
  runtime, including local dev via `@astrojs/cloudflare`) hardcodes its clock to UTC regardless of host `TZ`
  — verified empirically (`Intl.DateTimeFormat().resolvedOptions().timeZone` always reports `"UTC"` inside a
  `wrangler dev` worker, even with `TZ` forced on the host shell). A parsing divergence that depends on the
  runtime's local timezone is therefore only ever observable in Vitest/Node (which does honor
  `process.env.TZ`), never in this app's actually served pages. That's exactly why the TZ-forcing pattern
  above belongs in the test tier, and why a manual "force a non-UTC timezone and compare pages in the
  browser" check cannot demonstrate anything either way on this platform — don't rely on one for this class
  of bug.
- **Run locally**: `npm run test`.

### 6.6 Per-phase rollout notes

(Empty for now — fills in once the first phase closes.)

### 6.7 Adding a real-RLS integration test

- **When to use**: only when a mocked Supabase client can't prove what's
  needed — i.e. proving RLS itself blocks cross-user access, not just that
  the route queries `.eq(...)` correctly (that stays at the unit-mock tier,
  §6.2). Not a substitute for the mocked-unit tier; it's additive.
- **Naming convention**: `*.integration.test.ts` — excluded from the default
  `vitest.config.ts` run, included only by `vitest.integration.config.ts`.
- **Fixture**: `supabase/seed.sql` — two fixed users
  (`isolation-test-user-a@example.com` / `isolation-test-user-b@example.com`,
  both with a known password) plus one `maintenance_tasks` row each, loaded
  automatically by `supabase db reset`. Never add an admin/service-role
  client to a test — sign in as one of the seeded users via
  `auth.signInWithPassword` instead, exactly like production.
- **Client**: plain `@supabase/supabase-js` `createClient(url, anonKey)`
  (not the app's `@/lib/supabase` SSR factory) — reads
  `SUPABASE_URL`/`SUPABASE_ANON_KEY` from `process.env`, falling back to
  Supabase CLI's well-known local defaults.
- **Reference test**: `src/pages/api/tasks/isolation.integration.test.ts`.
- **Run locally**: `npx supabase start && npx supabase db reset && npm run test:integration`
  (`db reset` is what re-applies `seed.sql` — running only `start` is not
  enough after fixture data has been mutated by a prior run).

## 7. What We Deliberately Don't Test

- **Features explicitly excluded from MVP** — mobile app, property sharing,
  multiple properties per user, push/SMS notifications, calendar
  integration, payments, IoT, photo/document scanning, advanced analytics,
  required AI, custom recommendation/scheduling algorithm, filtering and
  custom categories. No test logic should be built around these areas until
  the PRD changes. (Source: PRD Non-Goals.)
- **Generated Supabase types** (`src/db/database.types.ts`) — the generator
  is itself the test; don't write tests asserting its contents. (Source:
  general convention, no objection from the user in the interview.)
- **No clear negative space from the user (Q5)** — the user couldn't name an
  area to skip, and instead pointed out that even seemingly static views can
  suffer from shared components. Treat this as a signal to NOT exclude any
  view a priori for seeming "static" — UI coverage (Phase 2) also covers
  pages that use the shared layout.
  (Source: Phase 2 interview Q5.)

## 8. Freshness Log

- Strategy (§1–§5) last reviewed: 2026-09-11
- Stack versions last verified: 2026-09-11
- AI-native tool references last verified: 2026-09-11

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative space no longer matches what the team believes.
