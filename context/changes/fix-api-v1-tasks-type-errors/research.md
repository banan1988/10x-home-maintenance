---
date: 2026-09-14T11:18:09+00:00
researcher: banan1988
git_commit: f69412d011e1dca3d25c974448fed43c939164d2
branch: main
repository: 10x-home-maintenance
topic: "Fix pre-existing astro check type errors in the v1 tasks API"
tags: [research, codebase, api-auth, tasks-api, astro-check, type-errors]
status: complete
last_updated: 2026-09-14
last_updated_by: banan1988
---

# Research: Fix pre-existing `astro check` type errors in the v1 tasks API

**Date**: 2026-09-14T11:18:09+00:00
**Researcher**: banan1988
**Git Commit**: [`f69412d`](https://github.com/banan1988/10x-home-maintenance/commit/f69412d011e1dca3d25c974448fed43c939164d2)
**Branch**: main
**Repository**: 10x-home-maintenance

## Research Question

`change.md` for this change already identified three root causes behind 9 `npx astro check` errors confined to
`src/lib/api-auth.ts` and `src/pages/api/v1/tasks/{index,[id]}.ts`, inherited un-caught from the already-merged
`maintenance-tasks-api` change. This research verifies those root causes against the current codebase, gathers
exact current file:line references, checks for any drift since `change.md` was written, surveys existing test
conventions the eventual fix must follow, and traces the process history of how these errors went uncaught for
four implementation phases plus a review.

## Summary

All three root causes in `change.md` are **confirmed true, unchanged, at the exact same file:line:column**
against the current `main` branch head. One thing has changed since `change.md` was written: `npx astro check`
now reports **10 errors, not 9** — a new, unrelated error appeared in `src/pages/api/auth/signup.test.ts:63:42`
(a test-mock typing issue, out of scope for this change). No other production call sites of `requireApiClient`
exist outside the two files this change already scopes to.

The process root cause is now clear: the change immediately prior to `maintenance-tasks-api`
(`testing-auth-isolation-contract`) used `npx astro check` as its per-phase Success Criteria gate and shipped
green. `maintenance-tasks-api`'s own plan silently downgraded that gate to `npm run build` in every phase —
`astro build` does not fully type-check `.ts` files — so the errors were baked in at the very first
implementation-phase commit (`79a2d88`) and have been invisible to every gate (build, lint, test, and even a
later "address impl-review findings" commit that touched both files without noticing) ever since. CI genuinely
never runs `astro check` today, and no `check`/`astro:check` npm script exists yet.

Test coverage confirms `change.md`'s own scope guardrail is necessary, not precautionary: **no test file in the
entire repo** — old sibling routes or new v1 routes — exercises the missing/undefined `context.params.id` case;
every test helper defaults `id` to a fixed string. The v1 routes already correctly use the JSON-response auth
contract (`requireApiUser`/`requireApiClient` + `assertRequiresApiAuth`), a deliberate sibling to the
redirect-based contract (`requireUser`/`assertRequiresAuth`) used by the older HTML-form routes — this is an
intentional split by response shape, not an inconsistency, but `lessons.md`'s existing rule on the auth contract
predates and doesn't mention the JSON sibling.

## Detailed Findings

### Root cause 1 — `requireApiClient`'s declared return type still includes `null`

- [`src/lib/api-auth.ts:13`](https://github.com/banan1988/10x-home-maintenance/blob/f69412d011e1dca3d25c974448fed43c939164d2/src/lib/api-auth.ts#L13) —
  `requireApiClient(context: APIContext): ReturnType<typeof createClient> | Response`.
- [`src/lib/supabase.ts:6-10`](https://github.com/banan1988/10x-home-maintenance/blob/f69412d011e1dca3d25c974448fed43c939164d2/src/lib/supabase.ts#L6-L10) —
  `createClient` has no explicit return-type annotation; TS infers `SupabaseClient<Database> | null` because
  line 8 returns `null` when `SUPABASE_URL`/`SUPABASE_KEY` are unset. This inferred type is what leaks into
  `requireApiClient`'s annotation.
- Confirmed still producing 5 of the current errors, unchanged: `index.ts:20:40`, `index.ts:47:39`,
  `[id].ts:20:39`, `[id].ts:57:39`, `[id].ts:80:39` — all `ts(18047)`.
- **Introduced in a single commit**: `79a2d88` ("feat(maintenance-tasks-api): shared JSON API infrastructure
  (p1)") — the sole commit that has ever touched `src/lib/api-auth.ts` on `main`. The
  `maintenance-tasks-api/plan.md:126` contract spec already wrote this exact signature verbatim before
  implementation — the type gap was baked into the plan itself, not a later implementation deviation.
- **Call-site inventory** (only place a return-type-annotation fix has any effect): `index.ts:4` (import),
  `:15` (GET), `:34` (POST); `[id].ts:4` (import), `:15` (GET), `:37` (PATCH), `:75` (DELETE); plus
  `src/lib/api-auth.test.ts:12,40,45,51` (unit tests for `requireApiClient` itself). No other production call
  site exists in the main `src/` tree. (Two unrelated, unmerged worktree branches —
  `.claude/worktrees/unified-visual-theme` and `.claude/worktrees/account-deletion` — carry their own copies of
  `api-auth.ts`; see Open Questions.)

### Root cause 2 — `context.params.id` is `string | undefined`, used unguarded

- [`src/pages/api/v1/tasks/[id].ts:23,60,83`](https://github.com/banan1988/10x-home-maintenance/blob/f69412d011e1dca3d25c974448fed43c939164d2/src/pages/api/v1/tasks/%5Bid%5D.ts#L23) —
  GET/PATCH/DELETE each call `.eq("id", context.params.id)` directly, with no `if (!context.params.id)` guard
  anywhere in the file. Confirmed still producing 3 of the current errors, unchanged: `[id].ts:23:15`,
  `[id].ts:60:15`, `[id].ts:83:15` — all `ts(2345)`.
- **This gap traces to the original plan**: `maintenance-tasks-api/plan.md:243` explicitly specifies the
  unguarded `.eq("id", context.params.id)` call — the plan only discusses the RLS-only ownership convention (no
  `user_id` filter), never the type of `id` itself. Neither `research.md` nor any review caught it.
- **Contrast with the older sibling routes**, which all guard this correctly before the equivalent maintenance-tasks-api change existed:
  - [`src/pages/api/tasks/[id].ts:15`](https://github.com/banan1988/10x-home-maintenance/blob/f69412d011e1dca3d25c974448fed43c939164d2/src/pages/api/tasks/%5Bid%5D.ts#L15) — `if (!context.params.id) return context.redirect(NOT_FOUND_REDIRECT);`
  - `src/pages/api/tasks/[id]/complete.ts:14` and `src/pages/api/tasks/[id]/delete.ts:13` — identical guard.
  - All three also carry the RLS-only-ownership comment `lessons.md` mandates (lines 39-44, 25-26, 22-23
    respectively).
- **Test gap, confirmed repo-wide, not just v1**: no `.test.ts` file anywhere — `src/pages/api/v1/tasks/[id].test.ts`
  nor any of `src/pages/api/tasks/{[id],complete,delete}.test.ts` — exercises a missing/undefined `params.id`.
  Every `makeContext()` test helper defaults `id` to a fixed string (`"task-1"` or similar) unless overridden
  with a different-but-still-defined id for cross-user cases. `change.md`'s own guardrail ("add a case for the
  missing-`params.id` guard if one doesn't already exist") is therefore a real requirement, not a formality.

### Root cause 3 — `update` object's inferred type still allows `Date`

- [`src/pages/api/v1/tasks/[id].ts:50-53`](https://github.com/banan1988/10x-home-maintenance/blob/f69412d011e1dca3d25c974448fed43c939164d2/src/pages/api/v1/tasks/%5Bid%5D.ts#L50-L53) —
  `const update = { ...parsed.data, ...(parsed.data.last_done_date ? { last_done_date: format(...) } : {}) };`
  The spread's inferred `last_done_date` type stays `string | Date | undefined` because the first spread's wider
  property type isn't overridden in TS's object-spread inference, even though the second spread always produces
  a formatted string at runtime.
- Confirmed still producing the error, unchanged, at `[id].ts:59:13` — the fresh `astro check` output shows the
  fuller message: `Argument of type '{ last_done_date?: string | Date | undefined; ... }' is not assignable to parameter of type 'RejectExcessProperties<{...}, {...}>'` — a more precise restatement of the same `ts(2345)`
  `change.md` already described.

### New error not in `change.md`'s original 9 — out of scope for this change

- `npx astro check` on the current `main` head now reports **10 errors**, not 9. The new one:
  `src/pages/api/auth/signup.test.ts:63:42 - error ts(2345): Argument of type 'null' is not assignable to parameter of type '{ auth: { signUp: Mock<Procedure>; }; }'` (`createClientMock.mockReturnValueOnce(null);`).
  This is a test-mock typing issue in an unrelated auth-signup test file — it appeared in a commit made since
  `change.md` was authored and has nothing to do with `requireApiClient` or the tasks routes. Flagging it so the
  eventual `/10x-plan` isn't surprised when `astro check` shows 10 errors before the fix and 1 (not 0) after —
  this one should be tracked separately, not folded into this change's scope.

### Auth-contract conventions the fix must preserve

- Two parallel, intentional auth-contract shapes exist, split by response type:
  - **Redirect-based** (`src/lib/auth.ts`'s `requireUser` + `src/test-utils/auth-contract.ts`'s
    `assertRequiresAuth`) — used by the older HTML-form routes under `src/pages/api/tasks/**`.
  - **JSON-based** (`src/lib/api-auth.ts`'s `requireApiUser`/`requireApiClient` +
    `src/test-utils/api-auth-contract.ts`'s `assertRequiresApiAuth`) — used by the v1 JSON routes under
    `src/pages/api/v1/tasks/**`. Both `requireApiUser` and `requireApiClient` are already called together,
    sequentially, with `instanceof Response` early returns, in every v1 handler
    (`index.ts:12-16,31-35`; `[id].ts:12-16,34-38,72-76`).
  - `lessons.md:105-122` ("Every `/api/*` route must use the shared auth-check contract") documents only the
    redirect-based contract and predates `requireApiUser`/`requireApiClient`/`assertRequiresApiAuth` — a
    documentation gap worth a lessons.md follow-up entry once this change ships, not a defect in the routes
    themselves.
- Mocking pattern for these routes' tests: `vi.hoisted` creates `createClientMock = vi.fn()`, then
  `vi.mock("@/lib/supabase", () => ({ createClient: createClientMock }))`, then a dynamic `await import(...)` of
  the route module so the mock registers before the module's top-level imports load. `APIContext` is stubbed via
  a per-file `makeContext()` helper, cast `as unknown as APIContext`. Any new test case (e.g. missing
  `params.id`) should follow this identical pattern.
- Every existing `it(...)` in `src/pages/api/v1/tasks/*.test.ts` and `src/pages/api/tasks/**/*.test.ts` already
  follows the `"should ..."` phrasing `lessons.md:138-149` mandates — no convention risk for new test cases as
  long as they follow suit.
- The 503 "Supabase not configured" path is tested once, generically, in `src/lib/api-auth.test.ts:48-58` — not
  per-route in the v1 test files. No new per-route 503 test is implied by this change.

## Code References

- `src/lib/api-auth.ts:13` — `requireApiClient`'s null-inclusive return-type annotation (Root cause 1)
- `src/lib/supabase.ts:6-10` — `createClient`'s inferred `SupabaseClient<Database> | null` return type
- `src/pages/api/v1/tasks/index.ts:20,47` — `.from(...)` calls hitting the possibly-null `supabase`
- `src/pages/api/v1/tasks/[id].ts:20,57,80` — same, three call sites
- `src/pages/api/v1/tasks/[id].ts:23,60,83` — unguarded `context.params.id` usage (Root cause 2)
- `src/pages/api/v1/tasks/[id].ts:50-53,59` — `update` object `Date`-leak into the Supabase `.update()` call
  (Root cause 3)
- `src/pages/api/tasks/[id].ts:15`, `complete.ts:14`, `delete.ts:13` — the existing `params.id` guard pattern
  the fix should match
- `src/test-utils/api-auth-contract.ts:5-16` — `assertRequiresApiAuth`, the JSON auth-contract test helper
  already used correctly by all v1 test files
- `src/pages/api/v1/tasks/index.test.ts`, `src/pages/api/v1/tasks/[id].test.ts` — existing test files that must
  stay green and are the natural home for a new missing-`params.id` test case
- `.github/workflows/ci.yml:28` — `npx astro sync` runs (types generation only, not a type-check); no
  `astro check` step exists anywhere in CI
- `package.json` — existing scripts: `dev, build, preview, astro, lint, lint:fix, format, test, test:watch, test:integration, types:generate, deploy`; no `check`/`astro:check` script exists yet

## Architecture Insights

- The redirect-vs-JSON auth-contract split (`requireUser`/`assertRequiresAuth` vs.
  `requireApiUser`+`requireApiClient`/`assertRequiresApiAuth`) is a deliberate, already-established pattern by
  response shape, not an inconsistency to reconcile — the fix should keep both function names as-is and only
  correct `requireApiClient`'s return-type annotation.
- The codebase's idiom for narrowing a "guard or `Response`" result is consistently
  `if (x instanceof Response) return x;` immediately after the guard call. A new `params.id` guard should follow
  the same early-return idiom already used for `user instanceof Response` / `supabase instanceof Response` in
  the same handlers, matching `change.md`'s own suggested fix.
- `astro build` and `npx astro sync` are not substitutes for `npx astro check` — `build` compiles but doesn't
  fully type-check standalone `.ts` files, and `sync` only regenerates Astro's virtual types. This distinction is
  the direct process explanation for how a plan's own `[x]`-checked "type checking passes" criterion can be true
  for `npm run build` while `astro check` is red.

## Historical Context (from prior changes)

- **`context/changes/maintenance-tasks-api/plan.md:126,243`** — the plan that introduced both root causes,
  specifying `requireApiClient`'s exact (null-inclusive) signature and the unguarded `.eq("id", context.params.id)` call verbatim, with no phase or review step catching either.
- **`context/changes/maintenance-tasks-api/plan.md:167,216,266,321`** and `## Progress` rows
  `384,393,407,421` — every phase's Success Criteria list `Type checking passes: npm run build` (not `astro check`), all checked `[x]`. This is the proximate process cause: the gate that would have caught these errors
  was never run.
- **`context/changes/testing-auth-isolation-contract/plan.md:145,217,288`** (the change immediately prior,
  predecessor to `maintenance-tasks-api`) — used `Type checking passes: npx astro check` as its Success Criteria
  in every phase, all genuinely green (`## Progress` rows `395,407,422` with real commit SHAs). No reference to
  `requireApiClient` or the v1 tasks routes — its `research.md:236-239` explicitly notes S-03
  (`maintenance-tasks-api`) didn't exist yet at research time.
- **Commit chain for `maintenance-tasks-api`** (`git log --oneline main`): `084364c` (change opened) →
  `d0f03b4` (research) → `2eb4591` (plan) → `79a2d88` (Phase 1 — introduces Root cause 1) → `f05083f` (Phase 2)
  → `33994bb` (Phase 3 — introduces Root causes 2 and 3) → `3f5aa69` (Phase 4, doesn't touch these files) →
  `c380a3d` (epilogue) → `5b45521` ("address impl-review findings" — touches both route files for unrelated
  fixes: `parseJsonBody`, generic error messages; does not encounter or fix the type errors).
- **`context/changes/shared-app-shell/reviews/impl-review.md` F2** — the discovery point for this whole change:
  independently ran `npx astro check` at commit `0e9dcb3`, got the same 9 errors, confirmed via checkout of
  `maintenance-tasks-api`'s Phase 1 completion commit `1a6eb56` that the errors pre-date `shared-app-shell`
  entirely, and flagged `shared-app-shell`'s own plan rows `1.2`/`2.2` for falsely marking `astro check` `[x]`
  (a bookkeeping inaccuracy in that unrelated change, not a new regression).
- `context/archive/` contains only a `README.md` — nothing has been archived in this repo yet, so there is no
  older archived context beyond what's cited above.

## Related Research

- `context/changes/maintenance-tasks-api/research.md` and `plan.md` — original design of `requireApiClient` and
  the v1 tasks routes (S-03)
- `context/changes/testing-auth-isolation-contract/plan.md` — predecessor change establishing the redirect-based
  auth contract and the `astro check` gate that `maintenance-tasks-api` didn't carry forward
- `context/changes/shared-app-shell/reviews/impl-review.md` — F2, the finding that opened this change

## Open Questions

- **Unmerged branch conflict risk**: an unmerged branch (`feat/account-deletion`, commit `3d6a688`, checked out
  in `.claude/worktrees/account-deletion`) also edits `src/lib/api-auth.ts` (adding a new
  `requireApiAdminClient`) and both v1 tasks test files. Not blocking for this change, but the eventual PR
  should be aware this branch will need to rebase around whatever this change changes in `api-auth.ts`'s
  exports/signatures.
- **New 10th error** (`src/pages/api/auth/signup.test.ts:63:42`) — confirm with the user/plan whether it's
  tracked as its own follow-up or silently left for whoever next runs `astro check`; it is unrelated to this
  change's scope either way.
- **`lessons.md` gap**: whether to add a follow-up lessons.md entry documenting the JSON auth-contract sibling
  (`requireApiUser`/`requireApiClient`/`assertRequiresApiAuth`) alongside the existing redirect-based rule — not
  required for this change to proceed, but flagged since research surfaced it.
