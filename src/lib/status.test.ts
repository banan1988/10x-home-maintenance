import { addDays } from "date-fns";
import { describe, expect, it } from "vitest";

import { compareByUrgency, computeDueDate, computeStatus } from "@/lib/status";
import type { MaintenanceTaskWithStatus } from "@/types";

describe("computeDueDate", () => {
  const lastDoneDate = new Date(2026, 0, 1);

  it("should add days when frequency unit is day", () => {
    expect(computeDueDate(lastDoneDate, 5, "day")).toEqual(new Date(2026, 0, 6));
  });

  it("should add weeks when frequency unit is week", () => {
    expect(computeDueDate(lastDoneDate, 2, "week")).toEqual(new Date(2026, 0, 15));
  });

  it("should add months when frequency unit is month", () => {
    expect(computeDueDate(lastDoneDate, 3, "month")).toEqual(new Date(2026, 3, 1));
  });

  it("should add years when frequency unit is year", () => {
    expect(computeDueDate(lastDoneDate, 1, "year")).toEqual(new Date(2027, 0, 1));
  });

  it("should clamp to the end of the target month when the source day-of-month doesn't exist there", () => {
    expect(computeDueDate(new Date(2026, 0, 31), 1, "month")).toEqual(new Date(2026, 1, 28));
  });
});

describe("computeStatus", () => {
  const today = new Date(2026, 5, 15);

  it("should return OVERDUE when the due date is before today", () => {
    expect(computeStatus(addDays(today, -1), today)).toBe("OVERDUE");
  });

  it("should return DUE_SOON when the due date is exactly today", () => {
    expect(computeStatus(today, today)).toBe("DUE_SOON");
  });

  it("should return DUE_SOON when the due date is exactly 7 days from today", () => {
    expect(computeStatus(addDays(today, 7), today)).toBe("DUE_SOON");
  });

  it("should return OK when the due date is 8 days from today", () => {
    expect(computeStatus(addDays(today, 8), today)).toBe("OK");
  });
});

describe("compareByUrgency", () => {
  const baseTask: MaintenanceTaskWithStatus = {
    id: "1",
    user_id: "user-1",
    name: "Task",
    category: "other",
    importance: "medium",
    frequency_value: 1,
    frequency_unit: "month",
    last_done_date: "2026-01-01",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    dueDate: new Date(2026, 1, 1),
    status: "OK",
  };

  it("should rank OVERDUE before DUE_SOON before OK regardless of importance", () => {
    const overdue: MaintenanceTaskWithStatus = { ...baseTask, id: "overdue", status: "OVERDUE", importance: "low" };
    const dueSoon: MaintenanceTaskWithStatus = { ...baseTask, id: "due-soon", status: "DUE_SOON", importance: "low" };
    const ok: MaintenanceTaskWithStatus = { ...baseTask, id: "ok", status: "OK", importance: "high" };

    const sorted = [ok, dueSoon, overdue].sort(compareByUrgency);

    expect(sorted.map((task) => task.id)).toEqual(["overdue", "due-soon", "ok"]);
  });

  it("should rank HIGH before MEDIUM before LOW importance within the same status", () => {
    const high: MaintenanceTaskWithStatus = { ...baseTask, id: "high", status: "OVERDUE", importance: "high" };
    const medium: MaintenanceTaskWithStatus = { ...baseTask, id: "medium", status: "OVERDUE", importance: "medium" };
    const low: MaintenanceTaskWithStatus = { ...baseTask, id: "low", status: "OVERDUE", importance: "low" };

    const sorted = [low, high, medium].sort(compareByUrgency);

    expect(sorted.map((task) => task.id)).toEqual(["high", "medium", "low"]);
  });
});
