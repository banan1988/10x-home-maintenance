---
change_id: maintenance-task-data-model
title: Maintenance task data model with per-user RLS isolation
status: implemented
created: 2026-08-27
updated: 2026-08-28
archived_at:
---

## Notes

F-01 z @context/foundation/roadmap.md

Unlocks S-01 (`first-task-on-dashboard`), S-02 (`manage-maintenance-tasks`), S-03 (`maintenance-tasks-api`).

This is the first database migration in the project — no prior migrations, `users`/`profiles` table, or
TypeScript type-generation convention exist yet. This change establishes all three.
