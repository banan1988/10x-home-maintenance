# Unified Visual Theme — Plan Brief

> Full plan: `context/changes/unified-visual-theme/plan.md`
> Research: `context/changes/unified-visual-theme/research.md`

## What & Why

The app has two disconnected theming systems: a hand-rolled dark/purple "cosmic" gradient repeated at 10 page
call sites, and shadcn/ui's light-mode CSS tokens plus a fully-built-but-inert `.dark` block that never
activates. This plan makes the cosmic aesthetic the single, permanent theme everywhere — fixing confirmed
contrast bugs (invisible table headers, buttons with no owned text color) and consolidating duplicated markup
into two new shared components.

## Starting Point

Nothing in the PRD, shape-notes, or roadmap had ever picked a target palette — MS-04/S-07 was entirely
audit-sourced. `Header.astro`/`Footer.astro` shipped after this slice was scoped and are still on the old
mixed palette; two account-deletion pages use the same pattern but weren't in the roadmap's original list.

## Desired End State

Every page and dialog — landing, auth, dashboard, tasks, all dialogs, account deletion — renders with one
consistent dark/purple look driven entirely by CSS-variable tokens. No page declares its own background; no
dialog or button loses text to a contrast bug; one `Card` and one `ErrorBanner` component replace ~9
duplicated markup blocks.

## Key Decisions Made

| Decision                   | Choice                                                                          | Why (1 sentence)                                                                                                             | Source |
| -------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------ |
| Target palette             | Fixed dark/cosmic everywhere, no toggle                                         | Preserves the app's identity; matches `lessons.md`'s note that this project has no theme-switching system                    | Plan   |
| `.dark` mechanism          | Merge `.dark` values into `:root`, delete the block + `dark:` variants          | Reuses already-tuned values; avoids re-adding toggle scaffolding the decision above rejected                                 | Plan   |
| `--destructive-foreground` | New token, `oklch(0.145 0 0)` (dark text)                                       | Once merged, `--destructive` is light coral — needs dark text by WCAG contrast math (6.85:1), not the naive white assumption | Plan   |
| Card primitive             | Add shadcn `Card`, used directly in `.astro` files with no `client:*` directive | Astro renders framework components statically with zero JS when unhydrated — no need for a parallel Astro component          | Plan   |
| Error banner               | One shared `ErrorBanner.tsx` replacing 3 hardcoded implementations              | Single source of truth for a duplicated concept                                                                              | Plan   |
| `LibBadge.astro`           | Delete now                                                                      | Confirmed zero usages, hardcoded outside the token system                                                                    | Plan   |
| `Banner.astro`             | In scope — retoken with 2 new `--warning`/`--info` tokens                       | Mounted on every page; a third hardcoded palette contradicts the point of this change                                        | Plan   |

## Scope

**In scope:** `global.css` token system, all shadcn `ui/*.tsx` primitives with `dark:` variants, `Header`/
`Footer`/`Banner`/`Welcome`, dashboard/tasks pages and their dialogs, auth pages, account-deletion pages,
`Card`/`ErrorBanner` extraction, `LibBadge.astro`/`ServerError.tsx` removal.

**Out of scope:** light/dark toggle, `Layout.astro` box-model changes, `FormField`/`SubmitButton`/
`PasswordToggle` (already correct), `DeleteTaskAlertDialog`/`DeleteAccountForm` (pure shadcn, self-correcting),
accessibility audit beyond the identified contrast fixes, E2E/Playwright testing.

## Architecture / Approach

Fix the token system once (`global.css`, shadcn primitives) so every consumer downstream self-corrects. Build
two shared components (`Card`, `ErrorBanner`) before any call site needs them. Then sweep outward: shared
shell → dashboard/tasks → auth/account, removing each page's now-redundant `bg-cosmic` declaration and
extracting duplicated markup as it's touched.

## Phases at a Glance

| Phase                                    | What it delivers                                                           | Key risk                                                        |
| ---------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 1. Token & Primitive Foundation          | New `:root` palette, deleted `.dark`/`dark:` scaffolding, fixed token gaps | Getting the destructive-foreground contrast direction backwards |
| 2. Shared Components & Dead-Code Removal | `Card`, `ErrorBanner`; deleted `LibBadge`/`ServerError`                    | shadcn CLI generating a stray `"cn"` import                     |
| 3. Shell & Landing                       | Header/Footer/Banner/Welcome retoken + Card extraction                     | Banner's translucent-tint contrast on new tokens                |
| 4. Dashboard & Tasks                     | Card/ErrorBanner adoption, bare-`<input>` fix, heading consistency         | Missing one of the 4 bare `<input>` sites                       |
| 5. Auth & Account                        | Card extraction, opacity/heading normalization                             | Visual regression on auth pages (must look unchanged)           |

**Prerequisites:** none — no dependency on other in-flight changes.
**Estimated effort:** ~5 short sessions, one per phase.

## Open Risks & Assumptions

- Assumes no other in-flight change touches `global.css` or the `ui/*.tsx` primitives concurrently.
- The `--warning`/`--info` tokens are new design choices (no existing precedent), reusing existing chart hues
  for visual consistency — worth a quick visual sanity check once `Banner.astro` lands.

## Success Criteria (Summary)

- Every route and dialog shows one consistent dark/purple theme with no invisible text or plain white boxes.
- `grep` for `dark:`, stray `bg-cosmic`, `LibBadge`, `ServerError`, `border-red-500` across `src/` returns
  nothing.
- `npm run build && npm run lint && npm run test` pass after every phase.
