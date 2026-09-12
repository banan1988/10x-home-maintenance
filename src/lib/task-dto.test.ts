import { describe, expect, it } from "vitest";

import { toTaskDto } from "@/lib/task-dto";
import type { MaintenanceTask } from "@/types";

function makeTask(overrides: Partial<MaintenanceTask> = {}): MaintenanceTask {
  return {
    id: "task-1",
    user_id: "user-1",
    name: "Replace furnace filter",
    category: "hvac",
    importance: "medium",
    frequency_value: 3,
    frequency_unit: "month",
    last_done_date: "2026-01-01",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("toTaskDto", () => {
  it("should compute due_date from last_done_date, frequency_value, and frequency_unit", () => {
    const dto = toTaskDto(makeTask());

    expect(dto.due_date).toBe("2026-04-01");
  });

  it("should compute status identically to src/lib/status.ts's OVERDUE/DUE_SOON/OK ranking", () => {
    const overdueDto = toTaskDto(makeTask({ last_done_date: "2020-01-01" }));

    expect(overdueDto.status).toBe("OVERDUE");
  });

  it("should preserve every raw column from the row alongside the computed fields", () => {
    const task = makeTask();

    const dto = toTaskDto(task);

    expect(dto).toMatchObject(task);
  });
});
