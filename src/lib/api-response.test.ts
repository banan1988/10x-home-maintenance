import { describe, expect, it } from "vitest";

import { jsonData, jsonError, parseJsonBody } from "@/lib/api-response";

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

describe("parseJsonBody", () => {
  it("should return the parsed body when the request contains valid JSON", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ name: "Task" }),
    });

    await expect(parseJsonBody(request)).resolves.toEqual({ name: "Task" });
  });

  it("should return a 400 JSON error response when the request body is not valid JSON", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: "not json",
    });

    const result = await parseJsonBody(request);

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: { message: "Invalid JSON body" } });
  });
});
