# Unified Visual Theme Implementation Plan

## Overview

Today the app has two disconnected, never-reconciled theming systems: a hand-rolled dark/purple "cosmic"
gradient (`bg-cosmic`) re-declared independently at 10 page/component call sites, and shadcn/ui's light-mode
CSS-variable tokens plus a fully-authored but **completely inert** `.dark` token block (no theme provider or
toggle exists anywhere). This plan makes the cosmic aesthetic the single, permanently-fixed theme for the
whole app: the existing `.dark` OKLCH values move into `:root` (reusing already-designed values rather than
inventing new ones), the now-pointless toggle scaffolding is deleted, confirmed contrast bugs are fixed at
the token level, two new shared components (`Card`, `ErrorBanner`) replace ~9 duplicated markup blocks, and
the result is applied consistently across every page and dialog — including `Header.astro`/`Footer.astro`
(which shipped after this slice was originally scoped) and the two account-deletion pages research found
outside the roadmap's original list.

## Current State Analysis

- `src/styles/global.css:6-39` — light-mode `:root` tokens are the only ones ever active (`--background: oklch(1 0 0)` white, `--foreground: oklch(0.145 0 0)` near-black), because nothing in the app ever adds a
  `dark` class to any ancestor. Every page that wants the dark look opts in independently via `bg-cosmic`
  (`global.css:113-115`, a hardcoded hex gradient, structurally unrelated to the token system).
- `src/styles/global.css:41-73` — a complete parallel `.dark` OKLCH token set exists and is dead code.
- Confirmed contrast bugs (all traced to the light-mode-only token defaults): `TableHead` near-invisible on
  `tasks/index.astro` (`table.tsx:43-54` hardcodes `text-foreground`, near-black, against a near-black
  `bg-cosmic` wrapper); `outline` Button variant has no owned text color; `destructive` Button variant
  hardcodes `text-white` because `--destructive-foreground` doesn't exist at all; `Input`/`Label`/
  `SelectTrigger` have no owned background (safe today only because they're always Dialog-nested); three
  separate hardcoded implementations of the same "error banner" concept; a third hardcoded hex palette in
  `Banner.astro`, independent of both other systems.
- No shadcn `Card` primitive has ever been installed — every "glass panel" surface in the app (~9 sites
  across `Welcome.astro`, `dashboard.astro`, auth pages, account pages) hand-rolls the same
  `rounded-*xl border border-white/10 bg-white/{5,10} [backdrop-blur-xl]` recipe with small, apparently
  unintentional drift (`bg-white/5` + `rounded-xl` on the two account pages vs. `bg-white/10` + `rounded-2xl`
  everywhere else).
- `AddTaskDialog.tsx` and `EditTaskDialog.tsx` contain 4 bare `<input className="...border...">` elements
  with no owned background/text color — a defect the token-level fix does **not** self-resolve, since these
  elements never participated in the token system to begin with.

## Desired End State

Every page and dialog renders with one fixed dark/purple palette, driven entirely by CSS-variable tokens (no
page ever declares `bg-cosmic` itself — it's applied once, globally). `TableHead`, the `outline`/`destructive`
Button variants, and every dialog/input read correctly without any per-page override. `Card` and
`ErrorBanner` are the single source of truth for their respective patterns, used identically whether the call
site is `.astro` or `.tsx`. `LibBadge.astro` and `ServerError.tsx` no longer exist. `Banner.astro` and the
`.dark`/`dark:` toggle scaffolding are gone.

**Verification**: `npm run build && npm run lint && npm run test` all pass; manually loading every route
(`/`, `/auth/signin`, `/auth/signup`, `/auth/confirm-email`, `/dashboard`, `/tasks`, `/account/delete`,
`/account-deleted`) plus opening every dialog (Add/Edit/Delete task, delete-account confirmation) and
triggering at least one error state (e.g. a failed sign-in) shows one consistent dark/purple look with no
invisible text, no plain white boxes, and no `LibBadge`/`ServerError` references left importable.

### Key Discoveries

- `src/lib/utils.ts`'s `cn()` (`clsx` + `tailwind-merge`) already dedupes conflicting classes (last one
  wins), so `<Card className="bg-white/10 rounded-2xl p-8">` cleanly overrides `Card`'s default `bg-card`/
  `rounded-xl`/`py-6` without manual string surgery.
- Astro renders any imported framework component (React/Vue/Svelte) to static HTML with **zero** client-side
  JS whenever no `client:*` directive is present (confirmed via Astro's own docs — "By default, framework
  components render statically on the server as HTML without sending client-side JavaScript"). This means
  the new `Card` and `ErrorBanner` React components can be used directly inside `.astro` pages with no
  hydration cost — no need for parallel Astro-native duplicates.
- `TableHead`'s contrast bug, and every dialog's (`dialog.tsx`, `alert-dialog.tsx`, `popover.tsx`) plain-white
  appearance, resolve automatically once `:root` is repointed — none of those files need editing.
- `--destructive` in the *merged* `:root` (i.e. today's `.dark` value, `oklch(0.704 0.191 22.216)`) is a
  light-ish coral, not the light-mode `oklch(0.577 0.245 27.325)` — so its `-foreground` pairing needs *dark*
  text (`oklch(0.145 0 0)`, ≈6.85:1 WCAG contrast), the opposite of the naive "destructive = white text"
  assumption `button.tsx` hardcodes today.
- The prior `shared-app-shell` change deliberately kept `Layout.astro`'s box model non-flex; this plan
  respects that by applying the cosmic background via `global.css`'s existing `body { @apply ...; }` rule
  rather than touching `Layout.astro` at all.

## What We're NOT Doing

- No light/dark toggle, theme provider, or user-facing theme switcher — one fixed theme only.
- No redesign of `Layout.astro`'s box model (prior `shared-app-shell` decision stands).
- No changes to `FormField.tsx`, `SubmitButton.tsx`, `PasswordToggle.tsx` — already correctly hardcoded to
  the cosmic palette, independent of the token system, not part of this consolidation.
- No changes to `DeleteTaskAlertDialog.tsx` or `DeleteAccountForm.tsx` — pure shadcn primitives that
  re-theme automatically once the base tokens flip.
- No accessibility audit beyond the contrast fixes already identified — `test-plan.md` flags accessibility as
  out of scope for this rollout.
- No E2E/Playwright testing — out of scope for this lesson; automated verification below is
  build/lint/unit-test only, and visual correctness is verified manually.

## Implementation Approach

Work bottom-up: fix the token system first (Phase 1), since every other phase's visual correctness depends on
it. Then build the two new shared components (Phase 2) before any call site references them. Then apply the
result outward from the shared shell (Phase 3) to the two remaining page groups (Phases 4-5), each of which
is independently testable.

## Critical Implementation Details

**Token merge is a value transplant, not a rename.** The new `:root` block must use the *values currently in
the `.dark` block* verbatim — do not reuse the old light-mode `:root` values or invent new ones. Concretely,
`--destructive` becomes `oklch(0.704 0.191 22.216)` (today's `.dark` value), which is why its new
`-foreground` pairing needs dark text, not white — get this backwards and the destructive Button becomes
unreadable in the opposite direction from today's bug.

**Removing `dark:` variants means adopting their values as the new unconditional base, not deleting them.**
E.g. `button.tsx`'s `destructive` variant today reads `bg-destructive text-white ... dark:bg-destructive/60`
— the correct merge is `bg-destructive/60 text-destructive-foreground ...` (drop the `dark:` prefix, keep the
tuned value), not reverting to the plain `bg-destructive`. The same pattern applies to every `dark:` hit in
`input.tsx`, `select.tsx`, `calendar.tsx`.

## Phase 1: Token & Primitive Foundation

### Overview

Establish the single dark palette as `:root` and remove the dead `.dark`/`dark:` toggle scaffolding. Nothing
downstream is correct until this phase lands.

### Changes Required

#### 1. `src/styles/global.css`

**Intent**: Make the dark palette the only palette; centralize the cosmic background at the body level; add
the missing semantic tokens.

**Contract**:

- Replace the `:root` block (lines 6-39) with the current `.dark` block's values verbatim, keeping
  `--radius: 0.625rem` unchanged, and add two new lines: `--destructive-foreground: oklch(0.145 0 0);` and,
  after `--destructive-foreground`, `--warning: oklch(0.769 0.188 70.08);` and
  `--info: oklch(0.488 0.243 264.376);` (no separate `-foreground` tokens for these two — see rationale
  below).
- Delete the `.dark { ... }` block (lines 41-73) entirely.
- Delete `@custom-variant dark (&:is(.dark *));` (line 4) — safe once Phase 1's other edits land, since no
  `dark:` class reference survives anywhere in `src/` after this phase.
- In the `@theme inline` block (lines 75-111), add the three new token mappings following the file's
  existing `--color-X: var(--X);` convention: `--color-destructive-foreground`, `--color-warning`,
  `--color-info`.
- In `@layer base` (lines 117-124), change `body { @apply bg-background text-foreground; }` to
  `body { @apply bg-cosmic text-foreground; }` — this is the single point where the cosmic gradient becomes
  global; every per-page `bg-cosmic` declaration removed in later phases becomes redundant because of this
  one line.
- `--warning`/`--info` have no dedicated `-foreground` pairing because `Banner.astro` (Phase 3) only ever
  uses them as a low-opacity tint (`bg-warning/15`, `bg-info/15`) over the fixed dark page background, paired
  with the existing `text-foreground` token for readable text — inventing a fourth/fifth foreground pair
  would duplicate what `--foreground` already provides for this specific translucent-tint usage pattern.

#### 2. `src/components/ui/button.tsx`

**Intent**: Fix the `destructive` variant's hardcoded `text-white` (now wrong once `--destructive` becomes a
light coral) and give `outline` an owned text color; drop dead `dark:` prefixes everywhere, adopting their
tuned values as the base.

**Contract**: In the `variants.variant` map (lines 11-20) and the shared base string (line 8):

- `destructive`: `"bg-destructive/60 text-destructive-foreground shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/40"`
- `outline`: `"border border-input bg-input/30 text-foreground shadow-xs hover:bg-input/50 hover:text-accent-foreground"`
- `ghost`: drop the `dark:` prefix from `dark:hover:bg-accent/50` → `hover:bg-accent/50`
- `default`, `secondary`, `link`: unchanged
- base string: `aria-invalid:ring-destructive/40 aria-invalid:border-destructive` (drop the `dark:`-prefixed
  duplicate and the now-unused `/20` value)

#### 3. `src/components/ui/input.tsx`

**Intent**: Drop the dead `dark:` prefix on the input's owned background, adopting it as the permanent base.

**Contract**: `dark:bg-input/30` → `bg-input/30` (and remove the now-redundant plain `bg-transparent` it was
layered under); `aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40` →
`aria-invalid:ring-destructive/40`.

#### 4. `src/components/ui/select.tsx`

**Intent**: Same `dark:` merge as `input.tsx`, scoped to `SelectTrigger`.

**Contract**: `dark:bg-input/30` → `bg-input/30`, `dark:hover:bg-input/50` → `hover:bg-input/50`,
`dark:aria-invalid:ring-destructive/40` → `aria-invalid:ring-destructive/40` (drop the `/20` original); drop
the now-redundant plain `bg-transparent`. `SelectContent`/`SelectItem`/etc. already use owned tokens
(`bg-popover text-popover-foreground`) — no change needed there.

#### 5. `src/components/ui/calendar.tsx`

**Intent**: Remove a redundant `dark:` modifier.

**Contract**: `CalendarDayButton`'s class string — delete `dark:hover:text-accent-foreground` outright (no
replacement: this button always renders via the `ghost` button variant, whose own base classes already apply
`hover:text-accent-foreground` unconditionally after Phase 1 item 2's edit).

#### 6. `src/components/ui/sonner.tsx`

**Intent**: Pin the toaster to the app's one fixed theme instead of following the OS preference.

**Contract**: `theme="system"` → `theme="dark"` (the `Toaster`'s `theme` prop, typed
`'light' | 'dark' | 'system'`). No other change — the `--normal-bg`/`--normal-text`/etc. style overrides
already reference CSS variables and repoint automatically.

### Success Criteria

#### Automated Verification

- Type checking passes: `npx astro check` (or the repo's configured `tsc` invocation)
- Linting passes: `npm run lint`
- Unit tests pass: `npm run test`
- Build succeeds: `npm run build`
- No remaining `dark:` references: `grep -rn "dark:" src/` returns no matches
- No remaining `@custom-variant dark` or `.dark {` in `global.css`: `grep -n "custom-variant dark\|^\.dark" src/styles/global.css` returns no matches

#### Manual Verification

- Every shadcn primitive (Button in all variants, Input, Select, Calendar popover, Dialog, AlertDialog,
  Popover, Sonner toast) renders with correct dark contrast when viewed in isolation (e.g. via a quick manual
  page visit) — no invisible text, no plain-white boxes
- Triggering a toast (e.g. via an existing success/error flow) shows dark-themed styling regardless of OS
  light/dark preference

______________________________________________________________________

## Phase 2: Shared Components & Dead-Code Removal

### Overview

Introduce the two new shared components before any call site references them, and remove confirmed dead
code.

### Changes Required

#### 1. Install shadcn `Card`

**Intent**: Formalize the repeated hand-rolled "glass panel" recipe into one reusable component.

**Contract**: Run `npx shadcn@latest add card`, producing `src/components/ui/card.tsx` (`Card`,
`CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter`). Per the
`lessons.md` shadcn-add checklist: diff the generated file for a literal `"cn"` import (must be
`@/lib/utils`) and any unrequested dependency import — none expected here since `Card` has no theme-provider
dependency, but verify. Later phases use `Card` directly (no wrapping needed) with a `className` override per
call site — do not compose `CardHeader`/`CardContent`/`CardFooter` for the simple glass-panel usages in this
plan, since none of the call sites need that internal structure.

#### 2. `src/components/ErrorBanner.tsx` (new file)

**Intent**: Replace three separate hardcoded "error banner" implementations
(`dashboard.astro`'s inline token-based markup, `TaskList.tsx`'s and `ServerError.tsx`'s hardcoded red
palette) with one shared component.

**Contract**: A React component, `{ message?: string | null }` props, returns `null` when `message` is
falsy, otherwise renders an icon + message using the token classes already correct in `dashboard.astro`'s
reference implementation:

```tsx
import { CircleAlert } from "lucide-react";

interface ErrorBannerProps {
  message?: string | null;
}

export function ErrorBanner({ message }: ErrorBannerProps) {
  if (!message) return null;

  return (
    <p className="border-destructive/30 bg-destructive/10 text-destructive flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
      <CircleAlert className="size-4 shrink-0" />
      {message}
    </p>
  );
}
```

Used directly (no `client:*` directive) inside `.astro` files per the Key Discoveries note on static
framework-component rendering.

#### 3. Delete `src/components/auth/ServerError.tsx`

**Intent**: Superseded by `ErrorBanner`.

**Contract**: Delete the file. Update its two importers:

- `src/components/auth/SignInForm.tsx`: `import { ServerError } from "@/components/auth/ServerError"` →
  `import { ErrorBanner } from "@/components/ErrorBanner"`; `<ServerError message={serverError} />` →
  `<ErrorBanner message={serverError} />`.
- `src/components/auth/SignUpForm.tsx`: same import/usage swap.

#### 4. Delete `src/components/ui/LibBadge.astro`

**Intent**: Confirmed unused anywhere in `src/` (verified independently via `grep -rn "LibBadge" src/`
returning zero results) and hardcoded outside the token system.

**Contract**: Delete the file. No importers to update.

### Success Criteria

#### Automated Verification

- `npx shadcn@latest add card` completes without error and `src/components/ui/card.tsx` exists
- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`
- `grep -rn "ServerError\|LibBadge" src/` returns no matches

#### Manual Verification

- A failed sign-in/sign-up attempt still shows the error message, now via `ErrorBanner`

______________________________________________________________________

## Phase 3: Shell & Landing

### Overview

Remove now-redundant per-component `bg-cosmic` declarations, retoken `Banner.astro`, and Card-extract
`Welcome.astro`'s glass panels.

### Changes Required

#### 1. `src/components/layout/Header.astro`

**Intent**: Remove the now-redundant `bg-cosmic` declaration (the body-level rule from Phase 1 supplies it).

**Contract**: Line 9 — drop `bg-cosmic` from the `<header>` class list; all other literal color classes
(`text-white`, `text-purple-300`, `text-blue-100/70`, hover states) are unchanged and remain correct.

#### 2. `src/components/layout/Footer.astro`

**Intent**: Same as Header.

**Contract**: Line 5 — drop `bg-cosmic` from the `<footer>` class list; `text-blue-100/60` unchanged.

#### 3. `src/components/Banner.astro`

**Intent**: Replace the third independent hardcoded hex palette with the new token system.

**Contract**: Replace the `<style>` block's three `.banner--*` color rules with token-based Tailwind classes
on the root element, dropping the scoped `<style>` entirely:

```astro
<div
  class:list={[
    "border-b px-4 py-3 text-center text-sm",
    variant === "info" && "bg-info/15 border-info text-foreground",
    variant === "warning" && "bg-warning/15 border-warning text-foreground",
    variant === "error" && "bg-destructive/15 border-destructive text-foreground",
  ]}
  role={variant === "error" ? "alert" : "status"}
>
  <slot />
</div>
```

(Structural properties from the old `.banner` rule — padding, font size, centering, border — move into the
class list; the old `.banner :global(a)` link-color rule is no longer needed since `text-foreground` already
covers link color via inheritance and the app has no distinct link-color convention inside banners.)

#### 4. `src/components/Welcome.astro`

**Intent**: Remove the redundant `bg-cosmic`; extract the 3 identical glass-panel blocks into `Card`.

**Contract**: Line 5 — drop `bg-cosmic` from the outer div's class list, keep `relative min-h-screen w-full overflow-hidden`. Lines 70, 93, 117 — replace each `<div class="rounded-xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl">...</div>` with `<Card className="border-white/10 bg-white/5 p-6 backdrop-blur-xl">...</Card>` (import `Card` from `@/components/ui/card`, no `client:*` directive). The
inline `style` attribute star-field gradients (lines 21-25) are a deliberate decorative embellishment
independent of the token system — leave unchanged, do not tokenize.

### Success Criteria

#### Automated Verification

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`
- `grep -n "bg-cosmic" src/components/layout/Header.astro src/components/layout/Footer.astro src/components/Welcome.astro` returns no matches

#### Manual Verification

- Visiting `/` shows the header/footer/hero rendering with one consistent dark background (no seams between
  the body-level background and any component)
- `Banner.astro` (trigger via its existing config-error condition, or temporarily force each variant) shows
  readable text in all 3 states: info, warning, error

______________________________________________________________________

## Phase 4: Dashboard & Tasks

### Overview

Apply `Card`/`ErrorBanner`, remove redundant `bg-cosmic`, fix the heading-treatment inconsistency, and fix
the 4 bare `<input>` elements in the task dialogs.

### Changes Required

#### 1. `src/pages/dashboard.astro`

**Intent**: Remove redundant `bg-cosmic`; use `ErrorBanner` and `Card` in place of hand-rolled markup.

**Contract**: Drop `bg-cosmic` from the outer div. Replace the `tasksError` branch's `<p>` with
`<ErrorBanner message="We're having trouble loading your tasks right now. Please try refreshing the page." />`.
This intentionally shrinks the error state from the current large centered box (`rounded-2xl p-6 text-center`)
to `ErrorBanner`'s compact icon+text strip — matching the style already used in `TaskList.tsx`/
`AddTaskDialog.tsx` — not a regression.
Replace the empty-state `<p>` and each list-item `<li>`'s inner `<div>` with `<Card>`, carrying forward the
original glass-panel classes explicitly (shadcn's stock `Card` defaults to an opaque `bg-card`/`rounded-xl`
with no transparency or blur, so these must be restated in `className`, not assumed): empty-state
`className="rounded-2xl border-white/10 bg-white/10 p-6 text-center text-blue-100/80"`; list item
`className="rounded-xl border-white/10 bg-white/10 p-4 text-white"`, kept inside the existing `<li>`. The
heading (line 40) keeps its existing gradient treatment unchanged — it's the reference other pages align to.

#### 2. `src/pages/tasks/index.astro`

**Intent**: Remove redundant `bg-cosmic`; align the heading with dashboard's gradient treatment.

**Contract**: Drop `bg-cosmic` and the now-redundant explicit `text-white` from the outer div. Change the
`<h1>` from `class="text-2xl font-bold"` to
`class="bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-2xl font-bold text-transparent"`
(matching dashboard.astro's pattern, since 5 of 6 heading sites in the app already use it — this page was the
outlier).

#### 3. `src/components/tasks/TaskList.tsx`

**Intent**: Replace the hardcoded error banner with the shared component.

**Contract**: Replace the `<p className="...border-red-500/30 bg-red-900/30 text-red-300">` block with
`<ErrorBanner message={errorMessage} />` (import from `@/components/ErrorBanner`).

#### 4. `src/components/tasks/AddTaskDialog.tsx`

**Intent**: Fix 2 bare `<input>` elements with no owned background/text color; consolidate its inline error
banner into the shared component.

**Contract**: Replace the `name` and `frequency_value` `<input className="w-full rounded-md border px-3 py-2 text-sm" ...>` elements with the shadcn `Input` component (`import { Input } from "@/components/ui/input"`),
passing through the same `id`/`name`/`value`/`onChange` props and dropping the manual `className`. Replace
the inline server-error `<p>` (already token-correct, just duplicated) with `<ErrorBanner message={...} />`.

#### 5. `src/components/tasks/EditTaskDialog.tsx`

**Intent**: Same bare-`<input>` fix as `AddTaskDialog.tsx`.

**Contract**: Replace the `edit-name` and `edit-frequency-value` bare `<input>` elements with shadcn `Input`,
same pattern as item 4.

### Success Criteria

#### Automated Verification

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Unit tests pass: `npm run test`
- Build succeeds: `npm run build`
- `grep -n "bg-cosmic" src/pages/dashboard.astro src/pages/tasks/index.astro` returns no matches
- `grep -n "border-red-500" src/components/tasks/TaskList.tsx` returns no matches
- `grep -n '<input className' src/components/tasks/AddTaskDialog.tsx src/components/tasks/EditTaskDialog.tsx` returns no matches

#### Manual Verification

- `/dashboard` with zero tasks shows a readable empty-state Card; with tasks, each list item renders as a
  Card with readable text
- `/tasks` shows a fully visible table header row (the confirmed `TableHead` contrast bug) and a
  gradient-styled heading matching dashboard
- Opening Add/Edit Task dialogs shows both text inputs (name, frequency value) with a visible dark input
  background and border, not a stray white box
- Triggering a task-load or task-save error shows the shared `ErrorBanner` in both the tasks page and the
  dialogs
- Dashboard's task-load error now renders as `ErrorBanner`'s smaller compact strip (not the old large centered
  box) and still reads clearly in that page position

______________________________________________________________________

## Phase 5: Auth & Account

### Overview

Card-extract the auth and account glass panels, remove redundant `bg-cosmic`, and fix the heading/opacity
drift on the account pages.

### Changes Required

#### 1. `src/pages/auth/signin.astro`, `src/pages/auth/signup.astro`, `src/pages/auth/confirm-email.astro`

**Intent**: Remove redundant `bg-cosmic`; Card-extract the glass panel.

**Contract**: Drop `bg-cosmic` from each page's outer wrapper div. Replace the glass-card div (`rounded-2xl border border-white/10 bg-white/10 p-8 [text-center] text-white backdrop-blur-xl`) with `<Card className="rounded-2xl border-white/10 bg-white/10 backdrop-blur-xl w-full max-w-sm p-8 text-white [text-center]">`
— the glass classes (`rounded-2xl border-white/10 bg-white/10 backdrop-blur-xl`) must be restated explicitly
in `className` since shadcn's stock `Card` defaults to an opaque `bg-card`/`rounded-xl` with no transparency
or blur (the `text-center` class only applies where the original markup had it — `confirm-email.astro`).
Heading/copy/links inside are unchanged — these pages are already the reference implementation other pages
are being aligned to.

#### 2. `src/pages/account/delete.astro`

**Intent**: Remove redundant `bg-cosmic`; Card-extract; normalize the glass-panel opacity/rounding drift to
match every other card in the app; fix the plain (non-gradient) heading.

**Contract**: Drop `bg-cosmic` from the outer div. Replace the `rounded-xl border border-white/10 bg-white/5 p-6` div with `<Card className="rounded-2xl border-white/10 bg-white/10 p-6">` — explicitly stating the
normalized app-wide recipe (`rounded-2xl`/`bg-white/10`) in `className`, since shadcn's stock `Card` defaults
to an opaque `bg-card`/`rounded-xl` with no transparency, not this app's glass recipe; do not pass the old
`bg-white/5`/`rounded-xl` values, since research found no evidence that difference was a deliberate choice.
Change the `<h1>` from
`text-xl font-semibold text-white` to the gradient treatment used elsewhere:
`bg-gradient-to-r from-blue-200 to-purple-200 bg-clip-text text-xl font-semibold text-transparent`.

#### 3. `src/pages/account-deleted.astro`

**Intent**: Same normalization as `account/delete.astro`.

**Contract**: Drop `bg-cosmic` from the outer div. Replace the `rounded-xl border border-white/10 bg-white/5 p-6 text-center` div with `<Card className="rounded-2xl border-white/10 bg-white/10 max-w-md p-6 text-center">`
— same explicit-glass-classes rationale as item 2. Apply the same gradient-heading treatment as item 2.

### Success Criteria

#### Automated Verification

- Type checking passes: `npx astro check`
- Linting passes: `npm run lint`
- Build succeeds: `npm run build`
- `grep -rn "bg-cosmic" src/pages/auth/ src/pages/account/ src/pages/account-deleted.astro` returns no matches
- `grep -rln "bg-white/5\|rounded-xl" src/pages/account/delete.astro src/pages/account-deleted.astro` returns no matches

#### Manual Verification

- `/auth/signin`, `/auth/signup`, `/auth/confirm-email` render unchanged visually (glass card, gradient
  heading) — confirming the Card extraction is a pure refactor, not a visual regression
- `/account/delete` and `/account-deleted` now visually match the rest of the app's glass-card treatment
  (same opacity/rounding as auth pages) and show a gradient heading

______________________________________________________________________

## Testing Strategy

### Unit Tests

- No new business logic is introduced (pure styling/markup refactor); existing unit tests
  (`npm run test`) must continue to pass unmodified after every phase.

### Integration Tests

- Not applicable — this change touches presentation only, no API/data-layer behavior changes.

### Manual Testing Steps

1. After Phase 1: visit any page, confirm no build/runtime errors from the token change alone (some pages
   will still show redundant double-application of `bg-cosmic` until later phases remove the per-page
   declarations — that's expected and harmless, not a regression).
1. After Phase 2: confirm `npx shadcn@latest add card` produced a clean `card.tsx` (correct `@/lib/utils`
   import, no stray dependencies) and that sign-in/sign-up error states still render.
1. After each of Phases 3-5: walk every route/dialog listed in "Desired End State" and confirm one consistent
   dark/purple look, no invisible text, no plain white boxes.
1. Final pass: grep the whole `src/` tree for `dark:`, `bg-cosmic` outside `global.css`, `LibBadge`,
   `ServerError`, and `border-red-500` — all should return zero matches.

## Performance Considerations

None — this is a pure CSS-class/markup change with no new runtime dependencies beyond the already-planned
`Card` component (which ships zero additional JS when used without a `client:*` directive, per the Key
Discoveries note).

## Migration Notes

Not applicable — no data model or persisted-state changes.

## References

- Related research: `context/changes/unified-visual-theme/research.md`
- Roadmap item: `context/foundation/roadmap.md` (S-07)
- Prior related decisions: `context/changes/shared-app-shell/plan.md:84-90` (Layout.astro box model),
  `context/changes/home-maintenance-landing-page/plan.md:53-55` (deferred shadcn Button adoption to this
  change)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append `— <commit sha>` when a step lands. Do not rename step
> titles. See `references/progress-format.md`.

### Phase 1: Token & Primitive Foundation

#### Automated

- [x] 1.1 Type checking passes: `npx astro check` — e3015a3
- [x] 1.2 Linting passes: `npm run lint` — e3015a3
- [x] 1.3 Unit tests pass: `npm run test` — e3015a3
- [x] 1.4 Build succeeds: `npm run build` — e3015a3
- [x] 1.5 No remaining `dark:` references — e3015a3
- [x] 1.6 No remaining `@custom-variant dark` or `.dark {` in `global.css` — e3015a3

#### Manual

- [x] 1.7 Every shadcn primitive renders with correct dark contrast in isolation — e3015a3
- [x] 1.8 Toast rendering is dark-themed regardless of OS preference — e3015a3

### Phase 2: Shared Components & Dead-Code Removal

#### Automated

- [x] 2.1 `npx shadcn@latest add card` completes and `card.tsx` exists
- [x] 2.2 Type checking passes: `npx astro check`
- [x] 2.3 Linting passes: `npm run lint`
- [x] 2.4 Build succeeds: `npm run build`
- [x] 2.5 No remaining `ServerError`/`LibBadge` references

#### Manual

- [x] 2.6 Failed sign-in/sign-up shows the error via `ErrorBanner`

### Phase 3: Shell & Landing

#### Automated

- [ ] 3.1 Type checking passes: `npx astro check`
- [ ] 3.2 Linting passes: `npm run lint`
- [ ] 3.3 Build succeeds: `npm run build`
- [ ] 3.4 No `bg-cosmic` in Header/Footer/Welcome

#### Manual

- [ ] 3.5 `/` shows one consistent dark background across header/footer/hero
- [ ] 3.6 `Banner.astro` shows readable text in all 3 variants

### Phase 4: Dashboard & Tasks

#### Automated

- [ ] 4.1 Type checking passes: `npx astro check`
- [ ] 4.2 Linting passes: `npm run lint`
- [ ] 4.3 Unit tests pass: `npm run test`
- [ ] 4.4 Build succeeds: `npm run build`
- [ ] 4.5 No `bg-cosmic` in dashboard.astro/tasks/index.astro
- [ ] 4.6 No `border-red-500` in TaskList.tsx
- [ ] 4.7 No bare `<input className>` in AddTaskDialog.tsx/EditTaskDialog.tsx

#### Manual

- [ ] 4.8 Dashboard empty-state and list items render as readable Cards
- [ ] 4.9 Tasks table header is fully visible; heading matches dashboard's gradient
- [ ] 4.10 Add/Edit dialog inputs show a visible dark background/border
- [ ] 4.11 Error states show the shared `ErrorBanner` on tasks page and dialogs

### Phase 5: Auth & Account

#### Automated

- [ ] 5.1 Type checking passes: `npx astro check`
- [ ] 5.2 Linting passes: `npm run lint`
- [ ] 5.3 Build succeeds: `npm run build`
- [ ] 5.4 No `bg-cosmic` in auth/account pages
- [ ] 5.5 No `bg-white/5`/`rounded-xl` in account pages

#### Manual

- [ ] 5.6 Auth pages render visually unchanged (pure refactor check)
- [ ] 5.7 Account pages now visually match the app-wide glass-card treatment with a gradient heading
