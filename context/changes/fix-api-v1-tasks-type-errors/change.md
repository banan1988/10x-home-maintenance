---
change_id: fix-api-v1-tasks-type-errors
title: Fix pre-existing astro check type errors in the v1 tasks API
status: implementing
created: 2026-09-14
updated: 2026-09-14
archived_at:
---

## Notes

Discovered via `/10x-impl-review shared-app-shell` (F2, `context/changes/shared-app-shell/reviews/impl-review.md`).
Confirmed present already at `shared-app-shell`'s Phase 1 completion commit (`1a6eb56`), so this is inherited
from the already-merged `maintenance-tasks-api` change (S-03), not caused by `shared-app-shell`. Not gated by
CI today — `.github/workflows/ci.yml` runs `lint`/`test`/`build` only, not `astro check` — so this has been
silently red with nothing catching it. **Not implementing now** — this file exists to formalize what's broken
and why, for a future `/10x-plan` pass.

### Current `npx astro check` output (9 errors, all in 2 files)

```
src/pages/api/v1/tasks/index.ts:20:40 - error ts(18047): 'supabase' is possibly 'null'.
src/pages/api/v1/tasks/index.ts:47:39 - error ts(18047): 'supabase' is possibly 'null'.
src/pages/api/v1/tasks/[id].ts:20:39 - error ts(18047): 'supabase' is possibly 'null'.
src/pages/api/v1/tasks/[id].ts:23:15 - error ts(2345): Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
src/pages/api/v1/tasks/[id].ts:57:39 - error ts(18047): 'supabase' is possibly 'null'.
src/pages/api/v1/tasks/[id].ts:59:13 - error ts(2345): update payload's `last_done_date` is `string | Date | undefined`, not assignable to `string | undefined`.
src/pages/api/v1/tasks/[id].ts:60:15 - error ts(2345): Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
src/pages/api/v1/tasks/[id].ts:80:39 - error ts(18047): 'supabase' is possibly 'null'.
src/pages/api/v1/tasks/[id].ts:83:15 - error ts(2345): Argument of type 'string | undefined' is not assignable to parameter of type 'string'.
```

### Root cause 1 — `requireApiClient`'s declared return type still includes `null` (6 of 9 errors)

`src/lib/api-auth.ts`:

```ts
export function requireApiClient(context: APIContext): ReturnType<typeof createClient> | Response {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError(503, "Supabase is not configured");
  }
  return supabase;
}
```

The function body correctly narrows `supabase` away from `null` at runtime before returning it, but the
**declared** return type annotation is `ReturnType<typeof createClient> | Response`, and `createClient`'s own
return type includes `null`. TypeScript does not narrow a function's declared return type based on its control
flow — only the annotation is visible to callers. So every call site that does:

```ts
const supabase = requireApiClient(context);
if (supabase instanceof Response) return supabase;
// supabase is still typed SupabaseClient | null here, even though it can never actually be null
await supabase.from(...)  // ts(18047): 'supabase' is possibly 'null'
```

still sees `SupabaseClient | null`, producing the `ts(18047)` error at every downstream `.from(...)` call in
both files (2 in `index.ts`, 3 in `[id].ts`).

**Fix**: change `requireApiClient`'s return type annotation to exclude `null`, e.g.
`NonNullable<ReturnType<typeof createClient>> | Response`, or introduce an explicit `SupabaseClient | Response`
return type. No runtime behavior change — this is a type-annotation-only fix.

### Root cause 2 — `context.params.id` is `string | undefined`, used unguarded (3 of 9 errors)

`src/pages/api/v1/tasks/[id].ts` (GET, PATCH, DELETE handlers) all do:

```ts
.eq("id", context.params.id)
```

Astro types dynamic route params as `string | undefined` (no static guarantee the segment is present), and
`.eq()` expects a `string`. Nothing in the handler guards against `undefined` before use.

**Fix**: guard early in each handler, e.g. `if (!context.params.id) return jsonError(400, "Missing task id");`
before the first use, then reference the narrowed value — matching the existing early-return style already used
for `user instanceof Response` / `supabase instanceof Response` in the same file.

### Root cause 3 — `update` object's inferred type still allows `Date` (1 of 9 errors)

`src/pages/api/v1/tasks/[id].ts`, `PATCH` handler:

```ts
const update = {
  ...parsed.data,
  ...(parsed.data.last_done_date ? { last_done_date: format(parsed.data.last_done_date, "yyyy-MM-dd") } : {}),
};
```

At runtime `update.last_done_date` is always a formatted string (or absent), but the spread's inferred type
keeps `last_done_date?: string | Date | undefined` from `parsed.data`'s original (pre-format) shape, because
the second spread's narrower type doesn't override the first spread's wider property type in TS's inference for
object spreads with optional properties. Supabase's generated `.update()` type expects strictly
`string | undefined`, so passing `update` fails with `ts(2345)`.

**Fix**: build `update` so the final inferred type doesn't retain `Date`, e.g. destructure `last_done_date` out
of `parsed.data` explicitly before spreading, or cast/type the merged object to the exact update shape Supabase
expects. Prefer restructuring the object construction over a blanket `as` cast.

### Scope guardrails for the eventual plan

- Touches only `src/lib/api-auth.ts` and `src/pages/api/v1/tasks/{index,[id]}.ts` — type-level and
  input-validation fixes, no behavior change to already-tested, already-shipped `maintenance-tasks-api`
  endpoints.
- Existing tests for these routes (`src/pages/api/v1/tasks/*.test.ts`) must stay green; add a case for the
  missing-`params.id` guard if one doesn't already exist.
- Consider adding `npx astro check` to `.github/workflows/ci.yml` once this is green, so this class of
  regression doesn't silently recur (currently only `lint`/`test`/`build` run in CI).
