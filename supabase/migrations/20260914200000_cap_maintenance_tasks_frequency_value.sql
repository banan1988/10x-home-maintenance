-- Defense-in-depth: mirror addTaskSchema/createTaskJsonSchema's frequency_value.max(1000) at the DB layer.
-- Without this, a row written outside those two zod-guarded routes could still carry an unbounded
-- frequency_value and crash format(dueDate, "yyyy-MM-dd") downstream (TaskList.tsx, task-dto.ts) on read.

alter table maintenance_tasks
  add constraint maintenance_tasks_frequency_value_max_check check (frequency_value <= 1000);
