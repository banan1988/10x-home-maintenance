---
change_id: toast-next-due-message
title: Toast next due message
status: implemented
created: 2026-09-14
updated: 2026-09-15
archived_at:
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### Phase 3 audit result (2026-09-14)

Ran the read-only legacy `frequency_value` audit against local/dev Supabase
(`select id, user_id, frequency_value, frequency_unit from maintenance_tasks where frequency_value > 1000;`):
**0 rows returned** — no legacy violations found locally.

### Phase 3 audit result — staging/production (2026-09-15)

User ran the same query against staging/production Supabase: **0 rows returned** — no legacy violations found
there either. No triage needed in either environment.
