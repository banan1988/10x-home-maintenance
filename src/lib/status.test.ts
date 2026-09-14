import { addDays, format, parseISO } from "date-fns";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { compareByUrgency, computeDueDate, computeStatus } from "@/lib/status";
import type { MaintenanceFrequencyUnit, MaintenanceTaskWithStatus, TaskStatus } from "@/types";

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

  it("should throw for an unhandled frequency unit", () => {
    const invalidUnit = "decade" as unknown as MaintenanceFrequencyUnit;

    expect(() => computeDueDate(lastDoneDate, 1, invalidUnit)).toThrow("Unhandled frequency unit");
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

describe("computeDueDate + computeStatus combined regression grid (FR-008/FR-009)", () => {
  // today = 2026-06-15 (local). Boundaries per FR-009: dueDate < today -> OVERDUE;
  // today <= dueDate <= today+7 -> DUE_SOON; dueDate > today+7 -> OK.
  const today = new Date(2026, 5, 15);

  const gridRows: {
    frequencyUnit: MaintenanceFrequencyUnit;
    frequencyValue: number;
    lastDoneDate: Date;
    expectedDueDate: Date;
    expectedStatus: TaskStatus;
  }[] = [
    // day
    {
      frequencyUnit: "day",
      frequencyValue: 1,
      lastDoneDate: new Date(2026, 5, 13),
      expectedDueDate: new Date(2026, 5, 14),
      expectedStatus: "OVERDUE",
    },
    {
      frequencyUnit: "day",
      frequencyValue: 1,
      lastDoneDate: new Date(2026, 5, 14),
      expectedDueDate: new Date(2026, 5, 15),
      expectedStatus: "DUE_SOON",
    },
    {
      frequencyUnit: "day",
      frequencyValue: 1,
      lastDoneDate: new Date(2026, 5, 21),
      expectedDueDate: new Date(2026, 5, 22),
      expectedStatus: "DUE_SOON",
    },
    {
      frequencyUnit: "day",
      frequencyValue: 1,
      lastDoneDate: new Date(2026, 5, 22),
      expectedDueDate: new Date(2026, 5, 23),
      expectedStatus: "OK",
    },
    // week
    {
      frequencyUnit: "week",
      frequencyValue: 1,
      lastDoneDate: new Date(2026, 5, 7),
      expectedDueDate: new Date(2026, 5, 14),
      expectedStatus: "OVERDUE",
    },
    {
      frequencyUnit: "week",
      frequencyValue: 1,
      lastDoneDate: new Date(2026, 5, 8),
      expectedDueDate: new Date(2026, 5, 15),
      expectedStatus: "DUE_SOON",
    },
    {
      frequencyUnit: "week",
      frequencyValue: 1,
      lastDoneDate: new Date(2026, 5, 15),
      expectedDueDate: new Date(2026, 5, 22),
      expectedStatus: "DUE_SOON",
    },
    {
      frequencyUnit: "week",
      frequencyValue: 1,
      lastDoneDate: new Date(2026, 5, 16),
      expectedDueDate: new Date(2026, 5, 23),
      expectedStatus: "OK",
    },
    // month
    {
      frequencyUnit: "month",
      frequencyValue: 1,
      lastDoneDate: new Date(2026, 4, 14),
      expectedDueDate: new Date(2026, 5, 14),
      expectedStatus: "OVERDUE",
    },
    {
      frequencyUnit: "month",
      frequencyValue: 1,
      lastDoneDate: new Date(2026, 4, 15),
      expectedDueDate: new Date(2026, 5, 15),
      expectedStatus: "DUE_SOON",
    },
    {
      frequencyUnit: "month",
      frequencyValue: 1,
      lastDoneDate: new Date(2026, 4, 22),
      expectedDueDate: new Date(2026, 5, 22),
      expectedStatus: "DUE_SOON",
    },
    {
      frequencyUnit: "month",
      frequencyValue: 1,
      lastDoneDate: new Date(2026, 4, 23),
      expectedDueDate: new Date(2026, 5, 23),
      expectedStatus: "OK",
    },
    // year
    {
      frequencyUnit: "year",
      frequencyValue: 1,
      lastDoneDate: new Date(2025, 5, 14),
      expectedDueDate: new Date(2026, 5, 14),
      expectedStatus: "OVERDUE",
    },
    {
      frequencyUnit: "year",
      frequencyValue: 1,
      lastDoneDate: new Date(2025, 5, 15),
      expectedDueDate: new Date(2026, 5, 15),
      expectedStatus: "DUE_SOON",
    },
    {
      frequencyUnit: "year",
      frequencyValue: 1,
      lastDoneDate: new Date(2025, 5, 22),
      expectedDueDate: new Date(2026, 5, 22),
      expectedStatus: "DUE_SOON",
    },
    {
      frequencyUnit: "year",
      frequencyValue: 1,
      lastDoneDate: new Date(2025, 5, 23),
      expectedDueDate: new Date(2026, 5, 23),
      expectedStatus: "OK",
    },
  ];

  it.each(gridRows)(
    "should compute due date $expectedDueDate and status $expectedStatus for $frequencyValue $frequencyUnit(s) since $lastDoneDate",
    ({ frequencyUnit, frequencyValue, lastDoneDate, expectedDueDate, expectedStatus }) => {
      const dueDate = computeDueDate(lastDoneDate, frequencyValue, frequencyUnit);

      expect(dueDate).toEqual(expectedDueDate);
      expect(computeStatus(dueDate, today)).toBe(expectedStatus);
    },
  );

  it("should clamp a leap-year Feb 31 rollover to Feb 29 and still resolve the DUE_SOON boundary correctly", () => {
    const leapYearToday = new Date(2028, 1, 22);

    const dueDate = computeDueDate(new Date(2028, 0, 31), 1, "month");

    expect(dueDate).toEqual(new Date(2028, 1, 29));
    expect(computeStatus(dueDate, leapYearToday)).toBe("DUE_SOON");
  });
});

describe("computeDueDate extreme-value documenting cases", () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = "UTC";
  });

  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it("should silently return an Invalid Date when frequency_value is large enough to overflow Date's range, rather than throwing", () => {
    const dueDate = computeDueDate(new Date(2026, 0, 1), 100_000_000, "day");

    expect(dueDate.getTime()).toBeNaN();
  });

  it("should crash a downstream format('yyyy-MM-dd') call on that overflowed due date — an unguarded crash risk, not a safe fallback", () => {
    const dueDate = computeDueDate(new Date(2026, 0, 1), 100_000_000, "day");

    expect(() => format(dueDate, "yyyy-MM-dd")).toThrow("Invalid time value");
  });

  it("should compute a valid (if implausibly old) due date for a schema-permitted very old last_done_date, without crashing", () => {
    const dueDate = computeDueDate(parseISO("0001-01-01"), 3, "month");

    expect(format(dueDate, "yyyy-MM-dd")).toBe("0001-04-01");
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
