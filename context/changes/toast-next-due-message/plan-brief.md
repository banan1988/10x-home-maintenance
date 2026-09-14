# Toast Next-Due Message + Mark-Done Confirmation Guardrail — Plan Brief

> Full plan: `context/changes/toast-next-due-message/plan.md`
> Research: `context/changes/toast-next-due-message/research.md`

## What & Why

The "Mark done" completion toast now shows the task's actual next-due interval ("see you in 2 weeks") instead
of a generic message, and moved to top-right so it clears the header. Planning then surfaced that "Mark done"
has zero guardrails against completing a task that isn't due yet — so this plan also adds a confirmation
dialog for that one case, plus a one-off audit for a separate, unrelated legacy-data risk (`frequency_value`
values written before a recent cap).

## Starting Point

"Mark done" was a bare, no-JS `<form>` POST with a generic "Task completed" toast, rendered identically for
every task regardless of status. That form-POST plumbing, the toast message, and the toast position were
already changed in the working tree before this plan was written (see `research.md`); nothing in the app has
ever asked "are you sure?" before completing a task.

## Desired End State

Fast-path tasks (`DUE_SOON`/`OVERDUE`) complete in one click exactly as before, with a toast that now says how
long until the next occurrence. A task that's `OK` (not yet due) instead gets a confirmation dialog showing
its due date before completing. A documented SQL query exists to check for any legacy row that could still
crash on read due to an unbounded `frequency_value`.

## Key Decisions Made

| Decision                         | Choice                                                                                                                                | Why (1 sentence)                                                                                                       | Source |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------ |
| Plan scope                       | Retroactive Phase 1 (already shipped) + new confirmation guardrail + legacy-data audit; timezone fix and audit-trail history deferred | Balances closing real safety gaps against not blocking on the least-decided, most speculative workstream (audit trail) | Plan   |
| Confirmation trigger             | `status === "OK"` only, no second "very far" tier                                                                                     | Zero friction for the common OVERDUE/DUE_SOON case; matches the granularity `computeStatus` already exposes            | Plan   |
| Confirmation interaction         | Warn-then-allow modal (Cancel/Confirm), not a hard block                                                                              | Preserves the legitimate "I did this early" use case                                                                   | Plan   |
| Dialog implementation            | Duplicate small `<form>` inside the dialog, mirroring `DeleteTaskAlertDialog`, not `AlertDialogAction`                                | Matches the exact existing idiom in this codebase; avoids form-ref lifecycle complexity                                | Plan   |
| `complete.ts` timezone skew      | No code change — documented as an accepted limitation                                                                                 | Rare, few-hours-wide edge case; fixing it would change the endpoint's request contract for a narrow benefit            | Plan   |
| Legacy `frequency_value` rows    | Read-only audit query only, no data mutation                                                                                          | No confirmed incident exists; silently changing user data is worse than the theoretical crash risk                     | Plan   |
| Audit execution                  | One-off manual SQL, not a `supabase/migrations/*.sql` file                                                                            | Migrations in this repo are for schema changes, not one-time data audits                                               | Plan   |
| Completion history / audit trail | Deferred entirely, out of scope                                                                                                       | No existing precedent anywhere in the app; a real new feature (schema + UI) that deserves its own change               | Plan   |

## Scope

**In scope:**

- Recording the already-implemented next-due toast message and top-right toast positioning (Phase 1)
- A confirmation dialog for "Mark done" on `OK`-status tasks (Phase 2)
- A one-off read-only SQL audit for `frequency_value > 1000` legacy rows (Phase 3)

**Out of scope:**

- A `complete.ts` timezone grace window
- A completion history / audit trail (with or without undo)
- Any second confirmation threshold beyond `OK` vs `DUE_SOON`/`OVERDUE`
- Auto-correcting any row the Phase 3 audit finds

## Architecture / Approach

The "Mark done" `<form>` stays a real, server-posted form for the common case (no JS overhead). A new
`onSubmit` handler intercepts only when the task's status is `OK` (via a new pure predicate,
`shouldConfirmCompletion`), opening a confirmation dialog that mirrors the existing `DeleteTaskAlertDialog`
pattern exactly — including its own small duplicate confirm-form, not a shared ref. `DUE_SOON`/`OVERDUE` tasks
never touch this new code path at all.

## Phases at a Glance

| Phase                                   | What it delivers                                          | Key risk                                                       |
| --------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| 1. Toast next-due message (retroactive) | Documents already-shipped toast content + position change | Manual browser verification hasn't happened yet                |
| 2. Confirmation guardrail               | Dialog blocking accidental early completion of `OK` tasks | Must not add JS overhead to the `DUE_SOON`/`OVERDUE` fast path |
| 3. Legacy `frequency_value` audit       | One documented SQL query, run manually, result recorded   | Purely informational — no automated safety net if skipped      |

**Prerequisites:** Local Supabase running for manual testing; Supabase SQL access for Phase 3.
**Estimated effort:** ~1 session — Phase 1 is verification-only, Phase 2 is a small, well-precedented UI
addition, Phase 3 is a single query.

## Open Risks & Assumptions

- Phase 1's manual browser verification hasn't been run yet — it's a prerequisite check before Phase 2 builds
  on the same form.
- The Phase 3 audit assumes no row currently violates the cap; if one is found, its resolution is manual and
  out of this plan's automated scope by design.
- Deferring the timezone fix and audit trail means those `research.md` Open Questions remain genuinely open —
  revisit them if either edge case is actually reported by a user.

## Success Criteria (Summary)

- Clicking "Mark done" feels identical to today for any task that's actually due or overdue.
- Clicking "Mark done" on a task that isn't due yet requires an explicit confirmation, showing its due date.
- No legacy `frequency_value` row can silently crash a page render without at least one documented check
  having been run against it.
