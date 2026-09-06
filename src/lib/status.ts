import { addDays, addMonths, addWeeks, addYears, differenceInCalendarDays } from "date-fns";

import type { MaintenanceFrequencyUnit, MaintenanceTaskWithStatus, TaskStatus } from "@/types";

export const DUE_SOON_THRESHOLD_DAYS = 7;

const STATUS_RANK: Record<TaskStatus, number> = { OVERDUE: 0, DUE_SOON: 1, OK: 2 };
const IMPORTANCE_RANK: Record<MaintenanceTaskWithStatus["importance"], number> = { high: 0, medium: 1, low: 2 };

export function computeDueDate(
  lastDoneDate: Date,
  frequencyValue: number,
  frequencyUnit: MaintenanceFrequencyUnit,
): Date {
  switch (frequencyUnit) {
    case "day":
      return addDays(lastDoneDate, frequencyValue);
    case "week":
      return addWeeks(lastDoneDate, frequencyValue);
    case "month":
      return addMonths(lastDoneDate, frequencyValue);
    case "year":
      return addYears(lastDoneDate, frequencyValue);
    default: {
      const _exhaustive: never = frequencyUnit;
      throw new Error(`Unhandled frequency unit: ${_exhaustive as string}`);
    }
  }
}

export function computeStatus(dueDate: Date, today: Date): TaskStatus {
  const daysUntilDue = differenceInCalendarDays(dueDate, today);
  if (daysUntilDue < 0) return "OVERDUE";
  if (daysUntilDue <= DUE_SOON_THRESHOLD_DAYS) return "DUE_SOON";
  return "OK";
}

export function compareByUrgency(a: MaintenanceTaskWithStatus, b: MaintenanceTaskWithStatus): number {
  return STATUS_RANK[a.status] - STATUS_RANK[b.status] || IMPORTANCE_RANK[a.importance] - IMPORTANCE_RANK[b.importance];
}
