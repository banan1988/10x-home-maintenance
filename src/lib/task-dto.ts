import { format } from "date-fns";

import { computeDueDate, computeStatus } from "@/lib/status";
import type { MaintenanceTask, TaskStatus } from "@/types";

export function toTaskDto(task: MaintenanceTask) {
  const dueDate = computeDueDate(new Date(task.last_done_date), task.frequency_value, task.frequency_unit);

  return {
    ...task,
    due_date: format(dueDate, "yyyy-MM-dd"),
    status: computeStatus(dueDate, new Date()) satisfies TaskStatus,
  };
}

export type TaskDto = ReturnType<typeof toTaskDto>;
