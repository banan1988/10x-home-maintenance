# External research: S-01 library selection

> Source: exa.ai web search (`web_search_exa`), 2026-09-01.
> Scope: external research only (what libraries to use) — see `research.md` for internal codebase research
> (existing patterns/conventions) when that step is run.

## Context

S-01 (`first-task-on-dashboard`) needs three capabilities the current stack doesn't provide yet:

1. compute status (OK / DUE SOON / OVERDUE) from `frequency_value` + `frequency_unit` + `last_done_date`
1. a validated add-task form
1. urgency-sorted dashboard rendering

Checked against `context/foundation/tech-stack.md`: Astro 6 SSR on Cloudflare Workers (workerd), React 19 islands,
Tailwind 4, zod-for-API-input convention (`CLAUDE.md`).

## 1. Due-date/status computation

| Library                | Bundle (typical use)   | Workers/workerd compatible                                                                  | Fit for this task                                                                                                             |
| ---------------------- | ---------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **date-fns v4**        | ~4–13KB, tree-shaken   | Confirmed on worksonworkers.dev — pure functions over native `Date`, no Node API dependency | Best fit — functional style, only pay for the functions used (`addDays`/`addMonths`, `differenceInDays`, etc.)                |
| Day.js                 | ~2KB core              | Yes                                                                                         | Fine but adds a chainable-object style with no benefit here; no timezone need                                                 |
| Luxon                  | ~23KB, no tree-shaking | Yes                                                                                         | Overkill — its value is IANA timezone handling, which S-01 doesn't need (single-user, no cross-timezone scheduling)           |
| Native `Date` + `Intl` | 0KB                    | Yes                                                                                         | Viable for the arithmetic alone, but hand-rolls date-math edge cases (month rollover, leap years) that date-fns already tests |

**Recommendation: `date-fns` v4.** Confirmed to run cleanly in workerd, tree-shakes to a handful of functions, and
its pure-function style keeps `computeStatus(lastDoneDate, frequencyValue, frequencyUnit)` easy to unit-test in
isolation (Vitest). No timezone library needed — no cross-timezone requirement in the PRD.

## 2. Add-task form + validation

**`react-hook-form` + `zod` + `@hookform/resolvers`** — the de facto 2026 standard pairing, and the one shadcn/ui's
own `Form` component is built around (project already uses shadcn "new-york" style). zod is also the project's
mandated validation library for API routes (`CLAUDE.md`), so the same schema can be reused client-side and
server-side instead of defining validation twice.

> [!IMPORTANT]
> Astro-specific gotcha (recurring in 2024–2026 sources): Astro's SSR bundler can fail to resolve
> `react-hook-form`'s named exports (`FieldValues`, `FieldPath`, `ControllerProps`) inside islands. Known-good fix,
> two parts:
>
> 1. `astro.config.mjs`: `vite: { ssr: { noExternal: ['react-hook-form'] } }`
> 1. In `src/components/ui/form.tsx` (shadcn-generated), import `FieldValues`/`FieldPath`/`ControllerProps` as
>    `import type { ... }`, not value imports.

None of `zod`, `react-hook-form`, or `@hookform/resolvers` are in `package.json` yet — all three are net-new.

## 3. Dashboard sorting/rendering

No new library recommended. The dashboard's sort (status → then importance) is a single in-memory
`Array.prototype.sort()` over a small per-user task list. Pulling in TanStack Table (the shadcn "Data Table"
pattern) for pagination/filtering/column-visibility would add abstraction beyond what's needed for what is
currently a single sorted list, not a grid — against the project's own "don't add abstractions beyond what the
task requires" rule. Revisit only if S-02's task-management view later needs filtering/column controls.

## Net new dependencies for S-01

```bash
npm install date-fns zod react-hook-form @hookform/resolvers
```

## Open follow-up

Before baking these into `plan.md`, run `/10x-research first-task-on-dashboard` to confirm there's no existing
internal convention (e.g. a `formatDate`/status helper stub, or a zod schema pattern already in `src/types.ts`)
that these choices would need to align with.

## Sources

- <https://worksonworkers.southpolesteve.workers.dev/?category=date-time>
- <https://www.pkgpulse.com/guides/best-javascript-date-libraries-2026>
- <https://codecudos.com/blog/date-fns-vs-dayjs-vs-luxon-2026>
- <https://typescript.website/best-date-and-time-libraries-for-typescript-compared>
- <https://www.pkgpulse.com/guides/date-fns-v4-vs-temporal-api-vs-dayjs-date-handling-2026>
- <https://crosscheck.cloud/blogs/handling-dates-and-timezones-javascript/>
- <https://stackoverflow.com/questions/79135682/astro-and-react-island-react-hook-form-and-zod-dont-validate-the-input-field>
- <https://github.com/orgs/react-hook-form/discussions/11832>
- <https://stackoverflow.com/questions/77690083/react-hook-form-not-working-with-astro-and-react>
- <https://nerdleveltech.com/react-hook-form-zod-resolver-tutorial>
- <https://stacknotice.com/blog/react-hook-form-zod-guide-2026>
- <https://medium.com/just-tech-it-now/building-forms-with-react-19-react-hook-form-and-zod-4-part-1-simple-book-form-2b0f7a1f0401>
- <https://ui.shadcn.com/docs/components/base/data-table>
- <https://tanstack.com/table/latest/docs/framework/react/guide/sorting>
- <https://blog.cloudflare.com/more-npm-packages-on-cloudflare-workers-combining-polyfills-and-native-code/>
- <https://date-fns.org/>
