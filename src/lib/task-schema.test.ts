import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { format } from "date-fns";

import { addTaskSchema, createTaskJsonSchema, updateTaskJsonSchema } from "@/lib/task-schema";

describe("addTaskSchema", () => {
  const validPayload = {
    name: "Replace furnace filter",
    category: "hvac",
    importance: "medium",
    frequency_value: "3",
    frequency_unit: "month",
    last_done_date: "2026-01-01",
  };

  it("should accept a fully valid payload", () => {
    const result = addTaskSchema.safeParse(validPayload);

    expect(result.success).toBe(true);
  });

  it("should reject a blank name", () => {
    const result = addTaskSchema.safeParse({ ...validPayload, name: "  " });

    expect(result.success).toBe(false);
  });

  it("should reject a name longer than 200 characters", () => {
    const result = addTaskSchema.safeParse({ ...validPayload, name: "a".repeat(201) });

    expect(result.success).toBe(false);
  });

  it("should reject a non-positive frequency_value", () => {
    const result = addTaskSchema.safeParse({ ...validPayload, frequency_value: "0" });

    expect(result.success).toBe(false);
  });

  it("should reject a frequency_value above 1000, guarding computeDueDate against Date-range overflow", () => {
    const result = addTaskSchema.safeParse({ ...validPayload, frequency_value: "1001" });

    expect(result.success).toBe(false);
  });

  it("should accept a frequency_value of exactly 1000 (the upper boundary)", () => {
    const result = addTaskSchema.safeParse({ ...validPayload, frequency_value: "1000" });

    expect(result.success).toBe(true);
  });

  it("should reject an invalid enum value with a user-friendly message", () => {
    const result = addTaskSchema.safeParse({ ...validPayload, category: "landscaping" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Select a valid category");
    }
  });

  it("should reject a missing last_done_date with a user-friendly message", () => {
    const result = addTaskSchema.safeParse({ ...validPayload, last_done_date: undefined });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("Pick a last-done date");
    }
  });

  it("should reject a last_done_date beyond the 1-day timezone grace window", () => {
    const dayAfterTomorrow = new Date();
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

    const result = addTaskSchema.safeParse({
      ...validPayload,
      last_done_date: dayAfterTomorrow.toISOString().slice(0, 10),
    });

    expect(result.success).toBe(false);
  });

  it("should accept a last_done_date of tomorrow (within the timezone grace window)", () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const result = addTaskSchema.safeParse({
      ...validPayload,
      last_done_date: tomorrow.toISOString().slice(0, 10),
    });

    expect(result.success).toBe(true);
  });
});

describe("addTaskSchema last_done_date timezone handling", () => {
  const originalTz = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = "America/New_York";
  });

  afterAll(() => {
    process.env.TZ = originalTz;
  });

  it("should round-trip the exact calendar date regardless of the server's local timezone offset", () => {
    const result = addTaskSchema.safeParse({
      name: "Task",
      category: "hvac",
      importance: "medium",
      frequency_value: "1",
      frequency_unit: "month",
      last_done_date: "2026-01-01",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(format(result.data.last_done_date, "yyyy-MM-dd")).toBe("2026-01-01");
    }
  });
});

describe("addTaskSchema last_done_date future-date grace window (exact boundary)", () => {
  const validPayload = {
    name: "Replace furnace filter",
    category: "hvac",
    importance: "medium",
    frequency_value: "3",
    frequency_unit: "month",
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 0, 0, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should accept a last_done_date exactly at the 1-day grace-window boundary", () => {
    const result = addTaskSchema.safeParse({ ...validPayload, last_done_date: "2026-06-16" });

    expect(result.success).toBe(true);
  });

  it("should reject a last_done_date one day beyond the grace-window boundary", () => {
    const result = addTaskSchema.safeParse({ ...validPayload, last_done_date: "2026-06-17" });

    expect(result.success).toBe(false);
  });
});

describe("createTaskJsonSchema", () => {
  const validPayload = {
    name: "Replace furnace filter",
    category: "hvac",
    importance: "medium",
    frequency_value: 3,
    frequency_unit: "month",
    last_done_date: "2026-01-01",
  };

  it("should accept a fully valid payload with a real number for frequency_value", () => {
    const result = createTaskJsonSchema.safeParse(validPayload);

    expect(result.success).toBe(true);
  });

  it("should reject a string frequency_value instead of silently coercing it", () => {
    const result = createTaskJsonSchema.safeParse({ ...validPayload, frequency_value: "3" });

    expect(result.success).toBe(false);
  });

  it("should reject a non-positive frequency_value", () => {
    const result = createTaskJsonSchema.safeParse({ ...validPayload, frequency_value: 0 });

    expect(result.success).toBe(false);
  });

  it("should reject a frequency_value above 1000, guarding computeDueDate against Date-range overflow", () => {
    const result = createTaskJsonSchema.safeParse({ ...validPayload, frequency_value: 1001 });

    expect(result.success).toBe(false);
  });

  it("should accept a frequency_value of exactly 1000 (the upper boundary)", () => {
    const result = createTaskJsonSchema.safeParse({ ...validPayload, frequency_value: 1000 });

    expect(result.success).toBe(true);
  });

  it("should reject a blank name", () => {
    const result = createTaskJsonSchema.safeParse({ ...validPayload, name: "  " });

    expect(result.success).toBe(false);
  });
});

describe("createTaskJsonSchema last_done_date future-date grace window (exact boundary)", () => {
  const validPayload = {
    name: "Replace furnace filter",
    category: "hvac",
    importance: "medium",
    frequency_value: 3,
    frequency_unit: "month",
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 0, 0, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should accept a last_done_date exactly at the 1-day grace-window boundary", () => {
    const result = createTaskJsonSchema.safeParse({ ...validPayload, last_done_date: "2026-06-16" });

    expect(result.success).toBe(true);
  });

  it("should reject a last_done_date one day beyond the grace-window boundary", () => {
    const result = createTaskJsonSchema.safeParse({ ...validPayload, last_done_date: "2026-06-17" });

    expect(result.success).toBe(false);
  });
});

describe("updateTaskJsonSchema", () => {
  it("should reject an empty body", () => {
    const result = updateTaskJsonSchema.safeParse({});

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("At least one field must be provided");
    }
  });

  it("should accept a single valid field", () => {
    const result = updateTaskJsonSchema.safeParse({ name: "New name" });

    expect(result.success).toBe(true);
  });

  it("should reject a single invalid field", () => {
    const result = updateTaskJsonSchema.safeParse({ frequency_value: -1 });

    expect(result.success).toBe(false);
  });
});
