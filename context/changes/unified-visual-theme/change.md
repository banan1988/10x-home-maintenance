---
change_id: unified-visual-theme
title: Unified visual theme
status: impl_reviewed
created: 2026-09-14
updated: 2026-09-14
archived_at:
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### Phase 1 deviation: brand-tinted tokens instead of literal `.dark` value transplant

During Phase 1 manual verification, user feedback (in-session) flagged that the plan's literal
"transplant `.dark` values verbatim" contract (`plan.md` Phase 1 item 1) leaves `--primary`/`--secondary`/
`--accent`/`--ring`/`--background`/`--card`/`--popover`/`--sidebar-*` fully achromatic (chroma 0) — the
resulting shadcn buttons (e.g. "Add task" = near-white, "Mark done" = near-black) don't follow the
purple brand accent used everywhere else (`SubmitButton.tsx`'s hardcoded `bg-purple-600`, header nav
links, gradient headings). This is exactly the risk `roadmap.md` flagged for S-07: "Turning on `.dark`
alone fixes contrast but will not reproduce that specific purple/glass aesthetic automatically."

User chose to deviate from the literal Phase 1 token values (AskUserQuestion: "Dostosuj i kontynuuj —
dodaj fiolet"). Applied retint, values pulled from the installed Tailwind v4 package
(`node_modules/tailwindcss/theme.css`) to exactly match the existing hardcoded brand colors:

- `--primary`: `oklch(0.558 0.288 302.321)` (Tailwind `purple-600`, matches `SubmitButton.tsx`/`Welcome.astro`
  CTA exactly) with `--primary-foreground: oklch(0.985 0 0)` (white, matches their `text-white`).
- `--secondary`: `oklch(0.32 0.08 264)` (muted indigo-navy, distinct from primary purple, replaces the
  near-black gray) with `--secondary-foreground: oklch(0.985 0 0)`.
- `--ring` / `--sidebar-ring`: `oklch(0.627 0.265 303.9)` (Tailwind `purple-500`, matches existing
  `--chart-4`) instead of achromatic gray — focus rings now read as brand purple.
- `--accent` / `--sidebar-accent`: `oklch(0.32 0.06 300)` — subtle purple-leaning hover highlight instead
  of flat gray.
- `--background` / `--card` / `--popover` / `--muted` / `--sidebar`: kept the same lightness as the
  plan's original values, added a subtle navy tint (`chroma 0.03, hue 264`) so dialogs/toasts/cards read
  as part of the same cosmic-navy family as `bg-cosmic`, instead of flat neutral gray/black.
- `--foreground`, `--card-foreground`, `--popover-foreground`, `--muted-foreground`, `--accent-foreground`,
  `--destructive`/`--destructive-foreground`, `--warning`, `--info`, `--border`, `--input`, chart colors:
  unchanged from the plan's literal spec — no complaint raised about these.

Not written back into `plan.md`'s Phase 1 Changes Required block (read-only per implement conventions);
this note is the record of the deviation and its rationale.

### Phase 1 follow-up: `destructive`/`outline` Button variant tuning

Further in-session feedback: (1) `destructive`'s default (non-hover) state used `bg-destructive/60` —
literally copied from the plan's Critical Implementation Details merge example — but at 60% opacity the
light-coral `--destructive` blends down into the dark page behind it, so the fixed dark
`--destructive-foreground` text reads as near-black-on-near-black until `hover:bg-destructive/90` restores
enough opacity. Fixed by dropping the default opacity modifier entirely (`bg-destructive` at full
strength, `hover:bg-destructive/90` unchanged) — the destructive token is already the dark-mode-tuned
lighter coral, so an extra default-state dim was redundant and actively harmful to contrast at rest.
(2) `outline` (used by e.g. "Edit") and `secondary` (used by e.g. "Mark done") were visually
indistinguishable in hue — `outline` relied on the achromatic `--input` token (`bg-input/30`), while
`secondary` had the new indigo tint. Changed `outline` to a translucent purple tint tied to `--primary`
(`border-primary/40 bg-primary/15`, `hover:bg-primary/25`) so it reads as a lighter/subtler purple action
next to `secondary`'s solid indigo-navy and `default`'s solid full-strength purple — three distinguishable
brand-purple/blue treatments instead of purple/indigo/gray.

### Phase 4 follow-up: deferred — "Add task" button missing on `/tasks`

During Phase 4 manual verification, user flagged that `/tasks` has no "Add task" entry point (only
`/dashboard` does) and asked for the two pages' content width to match (Dashboard `max-w-2xl` vs. Tasks
`max-w-4xl`).

**Width mismatch**: fixed in this phase — widened `dashboard.astro`'s wrapper to `max-w-4xl` to match
`tasks/index.astro` (kept the wider value since Tasks' table needs the room; narrowing Tasks to `max-w-2xl`
would cramp its columns).

**Missing Add-task entry point on `/tasks`**: investigated and deferred, per user's choice
(AskUserQuestion: "Pomiń w tej zmianie"). Root cause: `src/pages/api/tasks/index.ts`'s `POST` handler
hardcodes `context.redirect("/dashboard?...")` on every path (success and all 3 error branches) with no
"return to originating page" mechanism — so wiring `AddTaskDialog` into `/tasks` isn't a pure styling
change, it needs either a UX compromise (redirect away from `/tasks` back to `/dashboard` after adding,
which would feel broken) or an API behavior change (a return-to param) that falls outside
"unified-visual-theme"'s scope (color/component consistency, not new navigation flows/API changes).
**Follow-up**: worth its own roadmap item / change to add feature parity for task creation from `/tasks`,
including the redirect-target fix.

**Heading size**: user also noted (lightheartedly) that Dashboard's heading (`text-3xl`) is bigger than
Tasks' (`text-2xl` per the plan's literal Phase 4 item 2 contract, which only asked to match the gradient
treatment, not the size). User chose to equalize both to `text-3xl` rather than leave the size mismatch —
applied to `tasks/index.astro`.

### Phase 5 follow-up: account-delete button/heading tuning + header navigation

Three more in-session requests while manually verifying Phase 5:

1. **"Delete my account" button matching Tasks' "Delete" button**: `DeleteAccountForm.tsx`'s destructive
   button already used the same shared `variant="destructive"` as `TaskList.tsx`'s "Delete" (so the *color*
   already matched after Phase 1), but it visually stretched to fill its `flex flex-col` parent's full width
   (default flexbox `align-items: stretch` on the cross axis), unlike Tasks' compact, content-width button
   sitting in a table cell. Added `size="sm"` and `className="self-start"` so it renders as a compact,
   non-stretched pill matching Tasks' Delete button exactly, instead of a full-width bar.
1. **"Delete account" heading matching Dashboard's**: changed `account/delete.astro`'s `<h1>` from
   `text-xl font-semibold` to `text-3xl font-bold` (same size/weight as `dashboard.astro`'s heading; both
   already shared the gradient treatment since Phase 5's original contract).
1. **Header navigation to `/account/delete`**: user requested that clicking their own email in
   `Header.astro` (currently a plain `<span>`) navigate to `/account/delete`. This is new navigation
   behavior, not a color/theme change, and technically outside "unified-visual-theme"'s scope — but it's a
   single-element, zero-risk change (wrap the existing `<span>{user.email}</span>` in an `<a href="/account/delete">`),
   so implemented directly rather than deferred, unlike the larger "Add task on /tasks" ask above which
   needed an API behavior change.

### Phase 5 follow-up: destructive Button white text vs. WCAG-contrast dark text

User flagged that the "Delete" buttons' dark text (near-black, `text-destructive-foreground`) looked
inconsistent next to every other button's white text, and asked for white text instead. This directly
conflicts with the plan's own documented contrast reasoning (Critical Implementation Details: the merged
`--destructive` is `oklch(0.704 0.191 22.216)`, a *light* coral — confirmed to be exactly Tailwind's
`red-400` — which needs *dark* text for ~6.85:1 WCAG contrast; white text on that same light coral would
likely fail AA).

Resolved by decoupling the Button component's `destructive` *background* from the shared `--destructive`
token rather than retinting the token globally: changed `button.tsx`'s destructive variant to
`bg-red-600 text-white hover:bg-red-500` (Tailwind's own `red-600`/`red-500` — confirmed via
`node_modules/tailwindcss/theme.css` that `red-600` is exactly the *original pre-Phase-1 light-mode*
`--destructive` value, `oklch(0.577 0.245 27.325)`, which is darker/more saturated and was always meant to
pair with white text — the plan's own original `button.tsx` used `bg-destructive text-white` in light mode.
Further softened one step per follow-up feedback ("too bloody/intense") to `bg-red-500 text-white hover:bg-red-400` — still solid/saturated enough for white text, one shade gentler than `red-600`
before Phase 1 swapped to the lighter dark-mode value). Left `--destructive`/`--destructive-foreground`
untouched for its *other* uses (`ErrorBanner`, `Banner.astro`'s error variant, aria-invalid rings/borders)
since those use it as translucent-background *text*, not a solid button background — the lighter red-400
value reads better as text-on-dark-background than red-600 would. `AlertDialogAction variant="destructive"`
(used in `DeleteTaskAlertDialog.tsx`, `DeleteAccountForm.tsx`'s confirm dialog) inherits this fix for free
since it renders through the same `Button` component.

Since `--destructive-foreground` (added in Phase 1) is no longer referenced by anything after this change,
removed it from `global.css`'s `:root` and `@theme inline` blocks as dead code (confirmed via
`grep -rn "destructive-foreground" src/` returning only the two definitions themselves).

Also added `focus-visible:ring-red-400/40` to the destructive variant alongside the background change above,
so the focus ring color stays consistent with the new `red-500`/`red-400` background instead of keeping the
old `--destructive`-derived ring color.
