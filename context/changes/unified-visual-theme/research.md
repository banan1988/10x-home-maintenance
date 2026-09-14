---
date: 2026-09-14T18:27:02Z
researcher: kucharsk
git_commit: 17619421732bff4c2e17f4b9dd721d2993bda919
branch: feat/unified-visual-theme
repository: banan1988/10x-home-maintenance
topic: "Unified visual theme (S-07 / MS-04) — apply one consistent palette across every page and dialog"
tags: [research, codebase, theme, tailwind, shadcn, dark-mode, contrast]
status: complete
last_updated: 2026-09-14
last_updated_by: kucharsk
---

# Research: Unified visual theme (S-07 / MS-04)

**Date**: 2026-09-14T18:27:02Z
**Researcher**: kucharsk
**Git Commit**: 17619421732bff4c2e17f4b9dd721d2993bda919
**Branch**: feat/unified-visual-theme
**Repository**: banan1988/10x-home-maintenance

## Research Question

Research the current state of the app's visual styling ahead of planning `unified-visual-theme` (roadmap S-07,
PRD ref MS-04): apply one consistent visual theme (colors, buttons, dialogs) across every page and dialog,
replacing the current split between hand-styled dark/purple auth pages and plain light-mode shadcn defaults
elsewhere — grounded in `context/foundation/roadmap.md`, `context/foundation/tech-stack.md`, and other
foundation/change docs.

## Summary

There are **two disconnected theming systems** coexisting today, and neither is a real "dark mode":

1. A **hand-rolled "cosmic" dark/purple aesthetic** — a hardcoded, non-token Tailwind `@utility bg-cosmic`
   (`src/styles/global.css:113-115`, a plain hex gradient) applied independently at **10 separate call
   sites** across pages/components, each also hand-rolling its own glassmorphism (`bg-white/10 backdrop-blur-xl`), gradient text, and literal `purple-*`/`blue-100/*` Tailwind palette classes.
1. **shadcn/ui's light-mode CSS-variable tokens** (`src/styles/global.css:6-39`) that every shadcn primitive
   uses by default, plus a fully-defined but **entirely unreachable** `.dark` token block
   (`global.css:41-73`) and `dark:` variants baked into several primitives — dead code, because nothing in
   the app ever adds a `dark` class to `<html>` (confirmed by exhaustive search: no theme provider, no
   `next-themes`, no `classList` toggle, no `prefers-color-scheme` handling anywhere in `src/`).

This split traces back to the original 10x-Astro-Starter bootstrap commit (`203cea8`) and every subsequent
product change (`shared-app-shell`, `home-maintenance-landing-page`, `account-deletion`) knowingly built more
surface area on the same unresolved split, each explicitly deferring the real fix to S-07. The roadmap's own
audit already enumerates several concrete contrast bugs; this research confirms them with exact file:line
citations, finds two additional pages the roadmap didn't scope (`account/delete.astro`,
`account-deleted.astro`), and surfaces a token gap (`destructive-foreground` doesn't exist) and a load-bearing
prior decision (`shared-app-shell` deliberately kept `Layout.astro`'s box model non-flex) that any S-07 plan
must respect or consciously override.

**No design decision (palette, "keep purple/glass" vs. "go full light shadcn defaults", contrast model) has
been made anywhere in the PRD, shape-notes, or roadmap** — MS-04 is entirely audit-sourced, not spec-derived.
Picking the actual target palette is `/10x-plan`'s job, not something this research resolves.

## Detailed Findings

### The two theming systems, precisely

- `src/styles/global.css:1-4` — Tailwind 4 wired via `@import "tailwindcss"`; `@custom-variant dark (&:is(.dark *))` makes `dark:` utilities work, but only when an ancestor literally has class `dark`.
- `src/styles/global.css:6-39` — light-mode `:root` OKLCH tokens: `--background: oklch(1 0 0)` (white),
  `--foreground: oklch(0.145 0 0)` (near-black), `--primary: oklch(0.205 0 0)` (dark charcoal),
  `--primary-foreground: oklch(0.985 0 0)`, `--border: oklch(0.922 0 0)`, `--muted`/`--accent: oklch(0.97 0 0)` (near-white), `--destructive: oklch(0.577 0.245 27.325)`. **No `--destructive-foreground` token
  exists at all** — every other variant pairs a `*-foreground` token; destructive does not (see Button
  below).
- `src/styles/global.css:41-73` — a complete parallel `.dark` token set exists (e.g. `--background: oklch(0.145 0 0)`, `--foreground: oklch(0.985 0 0)`) but is unreachable; no `@media (prefers-color-scheme: dark)`
  fallback either.
- `src/styles/global.css:75-111` — `@theme inline` maps every CSS var into Tailwind `--color-*` names consumed
  by utility classes like `bg-background`/`text-foreground`.
- `src/styles/global.css:113-115` — `bg-cosmic`: `background-image: linear-gradient(to bottom, #0a0e1a, #0f1529, #0a0e1a)` — a **hardcoded hex gradient**, structurally independent of the token system; doesn't
  set `.dark`, doesn't touch `--background`/`--foreground`.
- `src/styles/global.css:117-123` — `body { @apply bg-background text-foreground; }` is the only global
  color pairing, and since `.dark` never activates, `<body>` is always **white background / near-black
  text** by default. The dark/purple look only appears where a page independently opts into `bg-cosmic`.
- `components.json` — shadcn style `new-york`, `baseColor: "neutral"`, `cssVariables: true`, empty JS
  config (Tailwind 4 has none — all config lives in `global.css`). No `darkMode` strategy is configured
  anywhere.
- Dark-mode toggle mechanism: **none exists**. No theme provider, no `useTheme` hook, no `next-themes`
  dependency, no UI control, no script touching `document.documentElement.classList`. The `.dark` block and
  every `dark:` utility in `button.tsx`, `input.tsx`, `select.tsx`, `calendar.tsx` are inert today.
- `src/components/ui/sonner.tsx:8` — `Toaster` is configured `theme="system"` (OS-driven light/dark), a
  *third* independent theming input, disconnected from both the forced-dark cosmic pages and the
  never-activated shadcn `.dark` class.

### `bg-cosmic` call sites (10 total — the actual real-world scope surface)

- `src/components/Welcome.astro:5` (landing hero)
- `src/components/layout/Header.astro:9`
- `src/components/layout/Footer.astro:5`
- `src/pages/dashboard.astro:37`
- `src/pages/tasks/index.astro:29`
- `src/pages/auth/signin.astro:9`
- `src/pages/auth/signup.astro:9`
- `src/pages/auth/confirm-email.astro:22`
- `src/pages/account-deleted.astro:6` — **not listed in roadmap.md's S-07 scope**
- `src/pages/account/delete.astro:9` — **not listed in roadmap.md's S-07 scope**

The last two were added by the already-`done` `account-deletion` change (commit `8815b54`, touched again by
`b6c1faa`) and use the identical unstyled `bg-cosmic`/`text-purple-300` pattern. Since `Layout.astro` itself
applies no background (see below), every page independently re-declares `bg-cosmic` — a maintenance risk:
any future page that forgets it silently falls back to the plain white/light shadcn default with no visual
continuity to the rest of the app.

### Confirmed contrast bugs (concrete, not hypothetical)

1. **`TableHead` near-invisible on `tasks/index.astro`** — `src/components/ui/table.tsx:43-54` hardcodes
   `text-foreground` (near-black, `oklch(0.145 0 0)`). `src/pages/tasks/index.astro:29` wraps the table in
   `bg-cosmic` (near-black navy gradient). Since `.dark` never activates, every column header ("Name",
   "Category", "Importance", "Status", "Due date", "Last done", "Actions") renders near-black text on a
   near-black background — effectively invisible until `TableRow`'s `hover:bg-muted/50`
   (`table.tsx:35`, near-white) flashes underneath it.
1. **`outline` Button variant has no owned text color** — `src/components/ui/button.tsx:15-16`: `"border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 ..."`. It sets
   `bg-background` (white) but no text color, so it inherits whatever ambient text color the page set (e.g.
   `text-white` on `Header.astro:9` or `tasks/index.astro:29`) — producing a white box with white/near-white
   inherited text, invisible until hover flips both bg and text together.
1. **`destructive` Button variant hardcodes `text-white`** (`button.tsx:13-14`) instead of a
   `*-foreground` token — because no `--destructive-foreground` token exists in `global.css` at all. Every
   other variant is properly token-paired; this one is a real gap in the token set itself, not just a
   contrast bug in a particular page context.
1. **`Input`/`Label`/`SelectTrigger` have no owned background** (`input.tsx:10`, `label.tsx:9-10`,
   `select.tsx:31` — all effectively `bg-transparent`, no explicit text color). They inherit ambient
   background/text. Today's actual usages happen to be safe (always nested inside a Dialog/AlertDialog's own
   `bg-background` surface), but any future bare placement directly on a `bg-cosmic` page would break.
1. **`DialogContent`/`AlertDialogContent`** both hardcode `bg-background` with no explicit text color
   (`dialog.tsx:51`, `alert-dialog.tsx:46`) — internally self-consistent (light bg + inherited
   `text-foreground` from `<body>`, both light-mode tokens), but this means every dialog always renders as a
   plain white/light box regardless of the page's theme — the literal "plain light-mode boxes... next to
   hand-styled dark/purple auth pages" split the roadmap's Risk section describes.
1. **Inconsistent error-banner styling across pages for the same concept**: `dashboard.astro:48` uses
   proper shadcn tokens (`border-destructive/30 bg-destructive/10 text-destructive`), while
   `TaskList.tsx:44` (tasks page) uses hardcoded Tailwind red palette (`border-red-500/30 bg-red-900/30 text-red-300`), and `ServerError.tsx:11` (auth forms) uses yet another hardcoded variant
   (`border-red-500/30 bg-red-900/30 text-red-300`). Three different implementations of the same "error
   banner," none sharing a single source of truth.
1. **Inconsistent empty/heading treatment**: `dashboard.astro:52` hand-rolls a glass empty-state
   (`border-white/10 bg-white/10 text-blue-100/80`) while its heading (`dashboard.astro:40`) uses a
   gradient-text treatment matching the auth pages — but `tasks/index.astro:32`'s heading is a plain
   `text-2xl font-bold` with no gradient at all, an inconsistency between two otherwise-parallel pages.
1. **`LibBadge.astro`** (`src/components/ui/LibBadge.astro:10,12`) hardcodes `blue-900/50`/`text-blue-200`
   and `purple-500/30`/`text-purple-200`, entirely outside the token system. Appears unused anywhere in
   `src/` — likely dead/demo code left over from the starter, worth flagging for deletion rather than
   inclusion in the unified theme.
1. **`Banner.astro`** (config-error banner, always mounted in `Layout.astro`) uses a **third, completely
   separate hardcoded hex palette** (`src/components/Banner.astro:28-40`, e.g. `#dbeafe`/`#1e3a8a`,
   `#fef3c7`/`#78350f`, `#fee2e2`/`#7f1d1d`) — independent of both the shadcn token system and the cosmic
   palette.

### Component-by-component theme coverage (`src/components/ui/`)

All 11 files read in full. No `card.tsx` exists (shadcn Card was never installed) — every "card"-like glass
panel across the app (`Welcome.astro`, dashboard empty state/list items, auth glass cards) is hand-rolled
`rounded-*xl border border-white/10 bg-white/10 backdrop-blur-xl` rather than a themed shadcn surface
component.

| Component          | Token discipline                                                                             | Notes                                                                                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dialog.tsx`       | Good (`bg-background`, inherited `text-foreground`, `text-muted-foreground` for description) | Always light; overlay `bg-black/50` hardcoded (intentional, non-themed)                                                                                                                             |
| `alert-dialog.tsx` | Good, same pattern as Dialog                                                                 | `AlertDialogMedia` relies on `currentColor` SVGs                                                                                                                                                    |
| `button.tsx`       | Mostly good; `destructive` variant breaks pattern (`text-white` hardcode, #3 above)          | `outline` variant has no owned text color (#2 above)                                                                                                                                                |
| `calendar.tsx`     | Fully token-driven, no hardcoded colors                                                      | Has a defensive `[[data-slot=card-content]_&]:bg-transparent` selector that's currently dead code (no Card exists)                                                                                  |
| `input.tsx`        | Token-driven but no owned background (#4 above)                                              |                                                                                                                                                                                                     |
| `label.tsx`        | No color classes at all — fully inherits                                                     | Same latent risk as Input                                                                                                                                                                           |
| `popover.tsx`      | Good — `bg-popover text-popover-foreground` properly paired                                  | Low risk, self-contained/portaled                                                                                                                                                                   |
| `select.tsx`       | `SelectContent` well-paired; `SelectTrigger` has no owned background (#4 above)              |                                                                                                                                                                                                     |
| `sonner.tsx`       | Token-driven via CSS custom properties (`--normal-bg: var(--popover)`, etc.)                 | `next-themes` import flagged in a prior lesson is **already fixed** — confirmed absent; but `theme="system"` OS-driven switching is inconsistent with the rest of the app having no theme switching |
| `table.tsx`        | Mostly token-driven                                                                          | `TableHead`'s hardcoded `text-foreground` is the confirmed bug (#1 above)                                                                                                                           |
| `LibBadge.astro`   | Hardcoded palette colors, outside token system (#8 above)                                    | Appears dead/unused                                                                                                                                                                                 |

`src/lib/utils.ts`'s `cn()` is a standard `clsx` + `tailwind-merge` composition — `twMerge` dedupes
conflicting Tailwind classes (last one wins), so a unification pass can safely append/override className
props (`cn(existingClasses, "bg-background text-foreground")`) without manual string surgery. Every
`ui/*.tsx` file already funnels `className` through `cn()`, making token-class replacement a mechanical,
low-risk edit pattern across the primitives.

### Page/component styling inventory

- **Auth pages** (`src/pages/auth/{signin,signup,confirm-email}.astro`) — entirely custom markup, zero
  shadcn primitives at the page level. Glass card: `rounded-2xl border border-white/10 bg-white/10 p-8 text-white backdrop-blur-xl`. Gradient heading: `bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-transparent`. Supporting form components (`FormField.tsx`, `ServerError.tsx`,
  `SubmitButton.tsx`, `PasswordToggle.tsx`) are also entirely hand-rolled with hardcoded Tailwind palette
  colors (`purple-600`, `red-400/60`, `white/10`, etc.) — `SubmitButton.tsx:18` technically wraps shadcn
  `Button` but fully overrides its classes, so it's shadcn in name only.
- **`Welcome.astro`** (landing hero) — entirely custom, zero shadcn primitives, including an inline `style`
  attribute with hardcoded rgba star-field gradients (lines 21-25) that bypass Tailwind entirely. Hand-rolled
  CTA buttons (not shadcn `Button`).
- **`dashboard.astro`** — mixes shadcn-token-based error banner (line 48) with hand-rolled glass empty-state
  and list items (lines 52, 58) in the same file — internally inconsistent.
- **`tasks/index.astro` + `TaskList.tsx`** — the app's one screen closest to "plain shadcn" (real `Table`,
  `Button` usage), which is exactly why it exposes the `TableHead` contrast bug most visibly.
- **Add/Edit/Delete task dialogs** — `AddTaskDialog.tsx`/`EditTaskDialog.tsx` use unmodified shadcn
  `Dialog`/`Select`/`Popover`/`Calendar`/`Button` plus hand-rolled unstyled `<input>` elements (no color
  tokens at all). `DeleteTaskAlertDialog.tsx` is the cleanest file in the app — pure shadcn `AlertDialog` +
  `Button variant="destructive"`, no custom classes.
- **`Header.astro`/`Footer.astro`** (shared shell, replaced the removed `Topbar.astro` per
  `shared-app-shell`) — entirely hand-rolled cosmic palette, no shadcn primitives, no `dark:` variants
  (unnecessary since they hardcode the palette directly).
- **`Layout.astro`** — `<html>` never gets a `dark` class (confirmed dead code for `.dark` and every
  `dark:` utility). `<body>` renders `Banner` → `Header` → `<slot />` → `Footer` → `Toaster`, and applies no
  background/color itself beyond the global `bg-background text-foreground` — the cosmic aesthetic is
  entirely a per-page opt-in, not a layout-level concern.
- **`account/delete.astro` + `DeleteAccountForm.tsx`, `account-deleted.astro`** — same `bg-cosmic` + glass
  card pattern; `DeleteAccountForm.tsx` uses actual shadcn `Input`/`Label`/`Button`/`AlertDialog`
  unmodified/light-themed — another light-shadcn-on-dark-cosmic instance not captured in the roadmap's
  original S-07 scope list.

## Code References

- `src/styles/global.css:1-124` — full token system, `.dark` block, `@theme inline` mapping, `bg-cosmic` utility, base layer
- `src/layouts/Layout.astro:18` — `<html>` never receives `dark` class
- `src/components/ui/button.tsx:11-20` — variant map; `outline` (15-16) and `destructive` (13-14) are the flagged variants
- `src/components/ui/table.tsx:43-54` — `TableHead` hardcoded `text-foreground`
- `src/components/ui/dialog.tsx:51` / `src/components/ui/alert-dialog.tsx:46` — `bg-background` hardcode
- `src/components/ui/input.tsx:10` / `src/components/ui/label.tsx:9-10` / `src/components/ui/select.tsx:31` — no owned background
- `src/components/ui/sonner.tsx:8,19-21` — `theme="system"`, token-driven CSS custom properties
- `src/components/ui/LibBadge.astro:10,12` — hardcoded, likely-dead component
- `src/components/Banner.astro:28-40` — third hardcoded hex palette
- `src/components/Welcome.astro:5,21-25,30-31,44,70` — hero cosmic styling, inline rgba star-field, gradient text, hand-rolled CTAs
- `src/components/layout/Header.astro:9,20,30,42,44,51,53,56,58` — shared header cosmic styling
- `src/components/layout/Footer.astro:5` — shared footer cosmic styling
- `src/pages/dashboard.astro:37,40,48,52,58,61,63` — mixed token/hand-rolled styling in one file
- `src/pages/tasks/index.astro:29,32` — cosmic wrapper, plain (non-gradient) heading
- `src/components/tasks/TaskList.tsx:44` — hardcoded red error banner, inconsistent with dashboard's token-based one
- `src/components/tasks/AddTaskDialog.tsx`, `EditTaskDialog.tsx`, `DeleteTaskAlertDialog.tsx` — dialog styling patterns
- `src/pages/auth/signin.astro:9-18`, `signup.astro:9-18`, `confirm-email.astro:22-31` — auth glass-card pattern
- `src/components/auth/FormField.tsx:5-6,53`, `ServerError.tsx:11`, `SubmitButton.tsx:18`, `PasswordToggle.tsx:13` — hand-rolled auth form styling
- `src/pages/account/delete.astro:9-19`, `src/pages/account-deleted.astro:6-13` — additional cosmic-pattern pages not in the roadmap's original S-07 scope list
- `components.json` — shadcn config (`new-york`, `neutral`, `cssVariables: true`)

## Architecture Insights

- **Two independent, never-reconciled theming systems** (hand-rolled `bg-cosmic` cosmic aesthetic vs. shadcn
  light-mode tokens) coexist because `Layout.astro` never applies a background of its own — every page
  independently opts into one or the other, so nothing forces consistency.
- The shadcn `.dark` token infrastructure is **fully built but completely inert** — no theme provider, hook,
  or class toggle exists anywhere. This is a real fork in the road for the plan: (a) wire up an actual
  `.dark` toggle and map the cosmic aesthetic onto the existing dark tokens, or (b) abandon `.dark` entirely
  and hardcode one deliberately-chosen palette (light, dark, or the current cosmic look) as the only theme,
  removing the now-pointless `.dark` block and `dark:` utilities. Nothing in the PRD or shape-notes indicates
  a preference — this is a planning decision, not a research finding.
- `cn()` (`clsx` + `tailwind-merge`) makes token-class replacement mechanical and low-risk across every
  `ui/*.tsx` primitive, since `twMerge` already resolves className conflicts.
- No shadcn `Card` primitive exists; every "card"/"glass panel" surface in the app is hand-rolled per call
  site with the same `rounded-*xl border border-white/10 bg-white/10 backdrop-blur-xl` recipe repeated
  verbatim — a strong candidate for extraction into either a real `Card` component or a themed utility class
  once the target palette is chosen.
- Lesson `New Postgres functions must pin search_path` and other `lessons.md` entries are not directly
  relevant to this frontend-styling change; the applicable prior pattern is the `npx shadcn add` lesson
  (watch for stray `"cn"` imports / unwanted `next-themes` imports / missing React type imports if any new
  shadcn primitives, e.g. `card`, are added during this change) and the "no ad-hoc colors" convention
  already established during `shared-app-shell`.

## Historical Context (from prior changes)

- `context/foundation/roadmap.md:257-282` (S-07 detail) is the **only** existing design-level writing on
  this topic — audit-sourced, not PRD-derived. `context/foundation/prd.md` and `context/foundation/shape-notes.md`
  were both read in full and contain zero mentions of theme, palette, color, or dark mode anywhere.
- `context/changes/shared-app-shell/plan.md:84-90` explicitly decided **not** to restructure `Layout.astro`'s
  box model into a flex/sticky-footer layout — "unnecessary for this change's scope." This is a load-bearing
  constraint S-07 inherits: if the unified-theme plan wants a different box model (e.g., true sticky footer),
  it must consciously override this prior decision rather than silently drift from it.
- `context/changes/home-maintenance-landing-page/plan.md:53-55` deliberately **avoided** introducing shadcn
  `Button` for hero CTAs specifically because "`Button`'s default/outline variants use light-mode-tuned
  tokens that don't yet match the dark `bg-cosmic` hero background (S-07 hasn't landed)" — an explicit,
  documented deferral to this change.
- `context/changes/account-deletion/` (S-06, done) added `src/pages/account/delete.astro` and
  `src/pages/account-deleted.astro` using the same cosmic/glass pattern — not enumerated in
  `roadmap.md`'s S-07 Risk section, but squarely in scope for "every page and dialog."
- Git history: `git log --oneline --all -- src/styles/global.css src/pages/auth/ src/components/Welcome.astro` shows `global.css` has never been touched since the original bootstrap
  commit `203cea8 chore(m1l3): bootstrap` — the dark/purple cosmic aesthetic is starter-scaffold-original,
  not introduced by any product change. `e03f637` (shared-app-shell) and `7364a5c` (landing page) both
  reused the existing pattern rather than introducing anything new, each explicitly deferring reconciliation
  to S-07.
- `context/foundation/lessons.md:29` — a prior lesson flagged `sonner.tsx` for an unwanted `next-themes`
  import from a `shadcn add` batch; **confirmed already fixed** — no `next-themes`/`useTheme` import remains
  in the current file.

## Related Research

- `context/changes/shared-app-shell/research.md`
- `context/changes/home-maintenance-landing-page/research.md`
- `context/changes/account-deletion/research.md`

## Open Questions

- **Target palette**: should the unified theme keep the existing dark/purple "cosmic" aesthetic everywhere
  (extending it to dashboard/tasks/dialogs), move everything to shadcn's light defaults, or wire up a real
  light/dark toggle using the already-built-but-inert `.dark` token block? Nothing in the PRD, shape-notes,
  or roadmap answers this — it's the central decision `/10x-plan` needs to make.
- **Fate of the `.dark` token block and `dark:` utilities**: keep and actually wire them up, or remove them
  as dead weight if the plan settles on a single fixed theme with no light/dark switching?
- **`--destructive-foreground` token gap**: should this be added to `global.css` to fix the `destructive`
  Button variant's hardcoded `text-white`, or is `text-white` an acceptable fixed choice for that one
  variant regardless of theme?
- **Card primitive**: should `npx shadcn add card` be run to formalize the repeated hand-rolled glass-panel
  pattern, or is that out of scope (pure CSS/class consistency, no new component) for this change?
- **`LibBadge.astro`**: confirmed unused — flag for deletion during this change, or leave untouched as
  out-of-scope cleanup?
- **`Banner.astro`'s** separate hardcoded hex palette: in scope for "every page" unification, or is it
  exempt as a config/ops-only banner rather than product UI?
