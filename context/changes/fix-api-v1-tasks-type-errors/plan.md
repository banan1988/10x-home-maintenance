# Fix API v1 Tasks Type Errors Implementation Plan

## Overview

`npx astro check` currently reports 10 errors across 4 files, none of them caught by CI (which runs `lint`/`test`/`build` only). Nine live in `src/lib/api-auth.ts` and the v1 tasks routes (`src/pages/api/v1/tasks/{index,[id]}.ts`), inherited unnoticed from the already-merged `maintenance-tasks-api` change; one unrelated error lives in `src/pages/api/auth/signup.test.ts`. All are type-annotation or input-guard fixes — no behavior change to any already-shipped endpoint. This plan fixes all 10 errors, backfills the test gap that let one of them ship silently, and wires `astro check` into CI so this class of regression can't recur unnoticed again.

## Current State Analysis

- `requireApiClient` (`src/lib/api-auth.ts:13`) narrows `supabase` away from `null` at runtime before returning it, but its declared return type (`ReturnType<typeof createClient> | Response`) still includes `null` because `createClient`'s own inferred return type does. Every downstream `.from(...)` call site sees `SupabaseClient | null` and fails `ts(18047)`.
- `src/pages/api/v1/tasks/[id].ts`'s GET/PATCH/DELETE handlers all call `.eq("id", context.params.id)` with no guard against `context.params.id` being `undefined` (Astro types dynamic segments as `string | undefined`), failing `ts(2345)`. The sibling redirect-based routes (`src/pages/api/tasks/[id].ts:15`, `complete.ts:14`, `delete.ts:13`) already guard this correctly.
- The PATCH handler's `update` object (`[id].ts:50-53`) spreads `parsed.data` then conditionally overrides `last_done_date` with a formatted string, but the first spread's wider `string | Date | undefined` property type isn't overridden by the second spread in TS's inference, so `update` is not assignable to Supabase's `.update()` parameter type.
- `src/pages/api/auth/signup.test.ts:63` calls `createClientMock.mockReturnValueOnce(null)`, but `createClientMock` was created as `vi.fn(() => ({ auth: { signUp: signUpMock } }))` — passing an initial implementation locks the mock's inferred return type to that object shape, excluding `null`.
- No test anywhere in the repo (old sibling routes or new v1 routes) exercises a missing/undefined `params.id`; every `makeContext()` test helper defaults `id` to a fixed string.
- CI (`.github/workflows/ci.yml`) runs `npx astro sync` (types generation only) but never `astro check`; no `check`/`astro:check` npm script exists yet. `astro build` does not fully type-check standalone `.ts` files, which is how these errors were baked in at `maintenance-tasks-api`'s first implementation-phase commit (`79a2d88`) and shipped through 4 phases plus a review undetected.

## Desired End State

`npx astro check` reports 0 errors. `src/pages/api/v1/tasks/[id].ts`'s three handlers reject a missing task id with a `400` JSON error before touching the database. CI fails fast on any future type regression via a new `astro check` step, run right after types are synced and before lint/test/build.

### Key Discoveries

- `src/lib/api-auth.ts:13` — the null-inclusive return-type annotation is the sole cause of 5 of the 9 original errors (2 call sites in `index.ts`, 3 in `[id].ts`).
- `src/pages/api/tasks/[id].ts:15` — the existing guard idiom (`if (!context.params.id) return ...;`) to match, adapted to the JSON error contract (`jsonError(400, ...)`) instead of a redirect.
- `astro.config.mjs:19-20` — `SUPABASE_URL`/`SUPABASE_KEY` are both `optional: true` in the env schema, so a new `astro check` CI step needs no secrets, unlike the `build` step.

## What We're NOT Doing

- No `lessons.md` follow-up entry documenting the JSON auth-contract sibling (`requireApiUser`/`requireApiClient`/`assertRequiresApiAuth`) — flagged by research as a documentation gap, not required for this change.
- No changes to the redirect-based auth contract or the older `src/pages/api/tasks/**` routes — they already guard `params.id` correctly and are out of scope.
- No new per-route `503` ("Supabase not configured") tests — that path is already covered once, generically, in `src/lib/api-auth.test.ts`.
- No rebase or coordination with the unmerged `feat/account-deletion` branch's `api-auth.ts` changes — flagged by research as a future-PR concern, not blocking this change.

## Implementation Approach

Fix the three root causes at their source (type annotations and guards, not call-site workarounds), matching each fix to an existing convention already established elsewhere in the codebase: the `NonNullable<...>` return-type pattern keeps a single source of truth on `createClient`, the `params.id` guard matches the sibling routes' early-return idiom adapted to the JSON contract, and the `update` object fix uses explicit destructuring per `change.md`'s own stated preference over a blanket cast. Phase 1 fixes everything `astro check` currently flags and backfills the test gap; Phase 2 wires the gate into CI so it stays fixed.

## Phase 1: Fix type errors and backfill test coverage

### Overview

Resolve all 10 `astro check` errors across `src/lib/api-auth.ts`, `src/pages/api/v1/tasks/[id].ts`, and `src/pages/api/auth/signup.test.ts`, and add test coverage for the previously-untested missing-`params.id` case.

### Changes Required

#### 1. Widen `requireApiClient`'s return type

**File**: `src/lib/api-auth.ts`

**Intent**: Exclude `null` from the declared return type so callers see the type that's actually returned at runtime, with no behavior change.

**Contract**: `requireApiClient`'s return type annotation becomes `NonNullable<ReturnType<typeof createClient>> | Response`, derived from `createClient`'s own inferred return type rather than a separately-named type.

#### 2. Guard `context.params.id` in all three handlers

**File**: `src/pages/api/v1/tasks/[id].ts`

**Intent**: Reject requests with a missing task id before any database call, matching the guard already present in the sibling redirect-based routes but adapted to this file's JSON error contract.

**Contract**: In GET, PATCH, and DELETE, add `if (!context.params.id) return jsonError(400, "Missing task id");` immediately after the `requireApiUser` `instanceof Response` guard and before the `requireApiClient()` call — matching the sibling redirect-based route's guard ordering (`src/pages/api/tasks/[id].ts:12-16`: user check → params.id check → supabase creation). `jsonError` is already imported in this file.

#### 3. Fix the `update` object's `Date`-leak in PATCH

**File**: `src/pages/api/v1/tasks/[id].ts`

**Intent**: Build the `update` object so its inferred type never retains `Date` for `last_done_date`, matching what happens at runtime.

**Contract**: Destructure `last_done_date` out of `parsed.data` before spreading the rest, then conditionally re-add it as a formatted string:

```ts
const { last_done_date, ...rest } = parsed.data;
const update = {
  ...rest,
  ...(last_done_date ? { last_done_date: format(last_done_date, "yyyy-MM-dd") } : {}),
};
```

#### 4. Add missing-`params.id` test coverage

**File**: `src/pages/api/v1/tasks/[id].test.ts`

**Intent**: Cover the new guard added in change 2 above for all three handlers, and fix the test helper so it can express "id was never provided" distinctly from "id defaults to a fixed string."

**Contract**: `makeContext`'s id defaulting must switch from `overrides.id ?? "task-1"` to a check that only defaults when the `id` key is absent from `overrides` (e.g. `"id" in overrides ? overrides.id : "task-1"`), so a caller can pass `id: undefined` and get `params.id === undefined`. Add one `it("should return 400 when params.id is missing", ...)` case to each of the three `describe` blocks (GET, PATCH, DELETE), calling the handler with `makeContext({ user: { id: "user-1" }, id: undefined })` and asserting `response.status === 400`. Because the guard (change 2 above) now runs before `requireApiClient()`, these tests do not need to set up `createClientMock.mockReturnValue(...)` — the default `vi.fn()` is never invoked.

#### 5. Fix the unrelated mock-typing error in signup tests

**File**: `src/pages/api/auth/signup.test.ts`

**Intent**: Widen `createClientMock`'s inferred return type to include `null`, matching what the existing test at line 62-70 already needs to pass at runtime — a type-only fix, same category as change 1.

**Contract**: Annotate the initial implementation passed to `vi.fn` with an explicit return type including `null`, e.g. `vi.fn((): { auth: { signUp: typeof signUpMock } } | null => ({ auth: { signUp: signUpMock } }))`.

### Success Criteria

#### Automated Verification

- Type checking passes with 0 errors: `npx astro check`
- Unit tests pass: `npm run test`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`

#### Manual Verification

- Manually hit `GET /api/v1/tasks/` (or a task by id) in dev to confirm normal task retrieval still works unchanged.
- Manually hit `PATCH /api/v1/tasks/<id>` with a `last_done_date` field to confirm the update still persists the formatted date correctly.

______________________________________________________________________

## Phase 2: Wire `astro check` into CI

### Overview

Add a `check` npm script and a CI step so a future regression of this exact kind fails the pipeline instead of shipping silently, as `maintenance-tasks-api` did.

### Changes Required

#### 1. Add a `check` npm script

**File**: `package.json`

**Intent**: Give CI (and local developers) a single command for the type-check gate.

**Contract**: Add `"check": "astro check"` to the `scripts` block.

#### 2. Add a CI type-check step

**File**: `.github/workflows/ci.yml`

**Intent**: Fail the pipeline on any `astro check` error, positioned so types are already synced but before the slower lint/test/build steps.

**Contract**: Add a `"Type check"` step running `npm run check`, inserted between the existing `"Sync Astro types"` and `"Lint"` steps in the `ci` job. No new secrets required — `SUPABASE_URL`/`SUPABASE_KEY` are declared `optional: true` in `astro.config.mjs`'s env schema.

### Success Criteria

#### Automated Verification

- New script runs cleanly and reports 0 errors: `npm run check`
- Full CI job succeeds locally in sequence: `npx astro sync && npm run check && npm run lint && npm run test && npm run build`

#### Manual Verification

- Push the branch and confirm the GitHub Actions `ci` job's new "Type check" step appears and passes.

______________________________________________________________________

## Testing Strategy

### Unit Tests

- Three new cases in `src/pages/api/v1/tasks/[id].test.ts` (GET, PATCH, DELETE) covering a missing `params.id` returning `400`.
- No new tests needed for Phase 2 — it's a CI/tooling change with no application code to unit test.

### Integration Tests

- None required — the existing mocked-Supabase unit tests already cover the affected handlers' behavior; this change doesn't alter any integration-level contract.

### Manual Testing Steps

1. Run `npx astro check` before and after Phase 1 to confirm the error count drops from 10 to 0.
1. In dev, call each of GET/PATCH/DELETE on `/api/v1/tasks/[id]` with a valid id to confirm no regression, then with an empty-string id segment (if reachable) to sanity-check the new guard doesn't misfire on a real request.
1. After Phase 2, push the branch and check the Actions tab for the new "Type check" step.

## Performance Considerations

None — all changes are compile-time type fixes, a guard clause, and a CI step; no runtime hot path is affected.

## Migration Notes

Not applicable — no data model, schema, or API contract changes.

## References

- Related research: `context/changes/fix-api-v1-tasks-type-errors/research.md`
- Original change notes: `context/changes/fix-api-v1-tasks-type-errors/change.md`
- Guard pattern to match: `src/pages/api/tasks/[id].ts:15`
- Root-cause introduction: `context/changes/maintenance-tasks-api/plan.md:126,243`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append `— <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Fix type errors and backfill test coverage

#### Automated

- [x] 1.1 Type checking passes with 0 errors: `npx astro check` — 82e63ff
- [x] 1.2 Unit tests pass: `npm run test` — 82e63ff
- [x] 1.3 Linting passes: `npm run lint` — 82e63ff
- [x] 1.4 Build succeeds: `npm run build` — 82e63ff

#### Manual

- [x] 1.5 Manually hit `GET /api/v1/tasks/` (or a task by id) in dev to confirm normal task retrieval still works unchanged. — 82e63ff
- [x] 1.6 Manually hit `PATCH /api/v1/tasks/<id>` with a `last_done_date` field to confirm the update still persists the formatted date correctly. — 82e63ff

### Phase 2: Wire astro check into CI

#### Automated

- [x] 2.1 New script runs cleanly and reports 0 errors: `npm run check`
- [x] 2.2 Full CI job succeeds locally in sequence: `npx astro sync && npm run check && npm run lint && npm run test && npm run build`

#### Manual

- [ ] 2.3 Push the branch and confirm the GitHub Actions `ci` job's new "Type check" step appears and passes.
