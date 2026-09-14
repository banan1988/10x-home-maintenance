# Fix API v1 Tasks Type Errors — Plan Brief

> Full plan: `context/changes/fix-api-v1-tasks-type-errors/plan.md`
> Research: `context/changes/fix-api-v1-tasks-type-errors/research.md`

## What & Why

`npx astro check` currently reports 10 errors, none caught by CI (which runs `lint`/`test`/`build` only, never `astro check`). Nine trace to `requireApiClient`'s return type and two unguarded/mistyped spots in the v1 tasks routes, inherited silently from the already-merged `maintenance-tasks-api` change; a tenth, unrelated one is a mock-typing issue in an auth test. All are type-annotation or input-guard fixes with no behavior change to any shipped endpoint.

## Starting Point

`requireApiClient` (`src/lib/api-auth.ts`) narrows away `null` at runtime but its declared return type doesn't, so every downstream `.from(...)` call sees a possibly-null client. `src/pages/api/v1/tasks/[id].ts`'s three handlers use `context.params.id` unguarded, and its PATCH handler builds an `update` object whose inferred type still allows `Date`. No test anywhere in the repo exercises a missing `params.id`. CI never runs `astro check` — only `astro sync` (types generation, not type-checking).

## Desired End State

`npx astro check` reports 0 errors. All three v1 `[id]` handlers reject a missing task id with a `400` before touching the database, with test coverage for that path. CI now runs `astro check` as its own step, so a future regression of this exact kind fails the pipeline instead of shipping unnoticed for months.

## Key Decisions Made

| Decision                                            | Choice                                            | Why (1 sentence)                                                                                  | Source          |
| --------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------- | --------------- |
| `requireApiClient` return-type fix                  | `NonNullable<ReturnType<typeof createClient>>`    | Derives from `createClient`'s own type so it can't drift out of sync                              | Plan            |
| `update` object `Date`-leak fix                     | Destructure `last_done_date` out before spreading | Fully explicit at both compile and runtime, matches `change.md`'s stated preference over a cast   | Research / Plan |
| Missing-`params.id` test coverage                   | One test per handler (GET, PATCH, DELETE)         | Matches this file's existing per-handler test granularity                                         | Plan            |
| Unrelated 10th error (`signup.test.ts` mock typing) | Fix inline in this change                         | User chose to close it out now rather than leave `astro check` at 1 remaining error               | Plan            |
| CI gate for `astro check`                           | Add now, in Phase 2                               | Directly closes the process gap that let these errors ship for 4 implementation phases undetected | Research / Plan |

## Scope

**In scope:**

- Type-annotation and guard fixes in `src/lib/api-auth.ts` and `src/pages/api/v1/tasks/[id].ts`
- New test coverage for the missing-`params.id` guard
- The unrelated `signup.test.ts` mock-typing fix
- A new `check` npm script and CI step running `astro check`

**Out of scope:**

- A `lessons.md` follow-up entry documenting the JSON auth-contract sibling (flagged by research, not required here)
- Any change to the redirect-based auth contract or older `src/pages/api/tasks/**` routes (already correct)
- New per-route `503` tests (already covered once, generically)
- Coordinating with the unmerged `feat/account-deletion` branch's `api-auth.ts` edits

## Architecture / Approach

Fix each root cause at its source rather than at call sites: widen the two type annotations that don't reflect their runtime-narrowed values, add the one missing guard, and restructure one object construction so its inferred type matches what it actually holds. No new abstractions, no behavior change — this is a type-and-test-coverage fix followed by a CI-gate addition.

## Phases at a Glance

| Phase                                       | What it delivers                                                                        | Key risk                                                                                                                                                                    |
| ------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Fix type errors + backfill test coverage | `astro check` goes from 10 errors to 0; new `400` guard + tests for missing `params.id` | The test-helper tweak (distinguishing "id omitted" from "id defaults to a fixed string") must not change behavior for every *existing* test case that relies on the default |
| 2. Wire `astro check` into CI               | A new CI step that fails the pipeline on any future type regression of this kind        | None significant — the env vars the new step needs are already optional in `astro.config.mjs`                                                                               |

**Prerequisites:** None — this branch already exists (`research/fix-api-v1-tasks-type-errors`) with the diagnosis complete.
**Estimated effort:** ~1 session, 2 phases — small, well-scoped diff across 5 files.

## Open Risks & Assumptions

- Assumes no other test in the repo relies on `makeContext()`'s current `??`-based id defaulting in a way the `"id" in overrides` rewrite would break — the plan requires checking existing call sites in `[id].test.ts` don't pass `id: undefined` expecting the old default-to-`"task-1"` behavior (none currently do, per research).
- Assumes the unmerged `feat/account-deletion` branch (which also edits `api-auth.ts`) is not being actively rebased during this change's implementation window.

## Success Criteria (Summary)

- `npx astro check` reports 0 errors after this change.
- All existing tests remain green; 3 new tests cover the previously-untested missing-`params.id` case.
- CI fails on any future `astro check` regression instead of staying silently green.
