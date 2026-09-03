# External Research: manage-maintenance-tasks (S-02)

> Source: Exa web search (`mcp__exa__web_search_exa`), 2026-09-03.
> Scope: library options to implement S-02 (view, edit incl. mark-complete, delete maintenance tasks),
> checked for compatibility with `context/foundation/tech-stack.md` — Astro 6 SSR, React 19 islands,
> Tailwind 4, shadcn/ui ("new-york"), Cloudflare Workers, Supabase.

## Method

For each of S-02's four concrete needs — task list/table view, edit form (incl. last-done-date update),
delete confirmation, and mutation feedback — searched for the current (2025-2026) React 19 / Astro 6
compatible library, preferring options that compose with the existing shadcn/ui component system and run
inside a client-side React island on Cloudflare Workers' edge runtime (no Node-only APIs).

## Findings

| Area                                          | Library                                               | Version                         | React 19 OK?                                                                                        | Notes                                                                                                                                                                   |
| --------------------------------------------- | ----------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| List/table                                    | shadcn `Table` (plain, no extra dep)                  | n/a (owned code)                | Yes                                                                                                 | Sufficient for S-02's scope — a personal list with no sort/filter/pagination requirement in FR-005–007                                                                  |
| List/table (only if sort/filter needed later) | `@tanstack/react-table`                               | 8.21.3                          | Yes, but breaks under **React Compiler** (needs `"use no memo"`; full compiler support lands in v9) | Repo already has `eslint-plugin-react-compiler` in devDependencies — confirm whether the compiler is actually enabled before adding this                                |
| Edit form                                     | `react-hook-form` + `@hookform/resolvers` + `zod`     | RHF v7.80, resolvers v5, zod v4 | Yes                                                                                                 | Current shadcn form recipe; avoid `.transform()` in the zod schema to dodge a known TS-inference bug ([shadcn-ui/ui#7312](https://github.com/shadcn-ui/ui/issues/7312)) |
| Last-done-date picker                         | `react-day-picker`                                    | v9                              | Yes, explicit ("enhances compatibility with React 19")                                              | `date-fns` is now **optional** in v9, not a required peer — no need to add it just for this picker                                                                      |
| Delete confirmation                           | `@radix-ui/react-alert-dialog` (shadcn `AlertDialog`) | latest                          | Yes, explicit "full React 19 compatibility"                                                         | Watch for a type collision ([shadcn-ui/ui#8300](https://github.com/shadcn-ui/ui/issues/8300)) only if `@radix-ui/react-select` is added later                           |
| Mutation feedback (toast)                     | `sonner`                                              | latest                          | Yes — peer dep declares `react: ^18.0.0 \|\| ^19.0.0 \|\| ^19.0.0-rc`                               | shadcn's own `Toast` component is deprecated in favor of this; it's the current default (`npx shadcn add sonner`)                                                       |

## Recommendation

None of the recommended additions require Node-only APIs, so all are safe inside a React island served
from Cloudflare Workers.

- **Add now:** `react-hook-form`, `zod`, `@hookform/resolvers`, `react-day-picker`, `sonner`, plus the
  shadcn `alert-dialog` and `sonner` component recipes (`npx shadcn add alert-dialog sonner`).
- **Skip for S-02:** `@tanstack/react-table` and `date-fns` — neither is required by FR-005/006/007
  (no sorting, filtering, or locale-aware date formatting called for); adding them now would be unused
  surface area. Reach for `@tanstack/react-table` only if a future slice needs sorting/filtering, and
  confirm the React Compiler interaction (`"use no memo"` workaround) before doing so.

## Open questions carried into planning

- Is the React Compiler (`eslint-plugin-react-compiler`) actually enabled in the build, or just linted
  for? This determines whether `@tanstack/react-table` is viable if a later slice needs it.
