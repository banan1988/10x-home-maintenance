---
change_id: unified-visual-theme
title: Unified visual theme
status: implementing
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
