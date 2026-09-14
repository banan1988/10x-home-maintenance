import { describe, expect, it } from "vitest";
import { formatCompletionMessage, isFrequencyUnit } from "@/lib/format-completion-message";

describe("formatCompletionMessage", () => {
  it("should use singular unit when frequency value is 1", () => {
    expect(formatCompletionMessage(1, "week")).toBe("Task completed — see you in 1 week");
  });

  it("should pluralize the unit when frequency value is greater than 1", () => {
    expect(formatCompletionMessage(2, "week")).toBe("Task completed — see you in 2 weeks");
  });

  it("should format the day unit", () => {
    expect(formatCompletionMessage(3, "day")).toBe("Task completed — see you in 3 days");
  });

  it("should format the month unit", () => {
    expect(formatCompletionMessage(6, "month")).toBe("Task completed — see you in 6 months");
  });

  it("should format the year unit", () => {
    expect(formatCompletionMessage(1, "year")).toBe("Task completed — see you in 1 year");
  });
});

describe("isFrequencyUnit", () => {
  it.each(["day", "week", "month", "year"])("should accept %s as a valid frequency unit", (unit) => {
    expect(isFrequencyUnit(unit)).toBe(true);
  });

  it("should reject null", () => {
    expect(isFrequencyUnit(null)).toBe(false);
  });

  it("should reject an unrelated string", () => {
    expect(isFrequencyUnit("fortnight")).toBe(false);
  });
});
