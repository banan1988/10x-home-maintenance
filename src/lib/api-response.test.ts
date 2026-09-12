import { describe, expect, it } from "vitest";

import { jsonData, jsonError } from "@/lib/api-response";

describe("jsonData", () => {
  it("should wrap the payload in a data envelope with the given status and JSON content type", async () => {
    const response = jsonData(201, { id: "task-1" });

    expect(response.status).toBe(201);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    await expect(response.json()).resolves.toEqual({ data: { id: "task-1" } });
  });
});

describe("jsonError", () => {
  it("should wrap the message in an error envelope without an issues field when none is given", async () => {
    const response = jsonError(401, "Authentication required");

    expect(response.status).toBe(401);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    await expect(response.json()).resolves.toEqual({ error: { message: "Authentication required" } });
  });

  it("should include the issues array in the error envelope when provided", async () => {
    const response = jsonError(400, "Name is required", ["Name is required"]);

    await expect(response.json()).resolves.toEqual({
      error: { message: "Name is required", issues: ["Name is required"] },
    });
  });
});
