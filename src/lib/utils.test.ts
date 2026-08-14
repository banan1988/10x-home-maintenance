import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("should join truthy class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("should drop falsy values", () => {
    expect(cn("a", false, undefined, null, "b")).toBe("a b");
  });

  it("should merge conflicting Tailwind classes, keeping the last one", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
