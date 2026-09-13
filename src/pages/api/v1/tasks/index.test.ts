import { beforeEach, describe, expect, it, vi } from "vitest";
import type { APIContext } from "astro";

import { assertRequiresApiAuth } from "@/test-utils/api-auth-contract";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: createClientMock,
}));

const { GET, POST } = await import("@/pages/api/v1/tasks/index");

beforeEach(() => {
  createClientMock.mockClear();
});

function makeTaskRow(overrides: Record<string, unknown> = {}) {
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

function validJsonBody() {
  return {
    name: "Replace furnace filter",
    category: "hvac",
    importance: "medium",
    frequency_value: 3,
    frequency_unit: "month",
    last_done_date: "2026-01-01",
  };
}

function makeContext(overrides: { user: { id: string } | null; body?: unknown }) {
  return {
    locals: { user: overrides.user },
    request: {
      headers: new Headers(),
      json: () => Promise.resolve(overrides.body),
    },
    cookies: {},
  } as unknown as APIContext;
}

describe("GET /api/v1/tasks", () => {
  it("should return a 401 JSON error and never call the Supabase client when unauthenticated", async () => {
    await assertRequiresApiAuth(GET, (user) => makeContext({ user }), createClientMock);
  });

  it("should return the caller's tasks serialized with computed due_date and status", async () => {
    const selectMock = vi.fn().mockResolvedValue({ data: [makeTaskRow()], error: null });
    createClientMock.mockReturnValue({ from: vi.fn().mockReturnValue({ select: selectMock }) });

    const response = await GET(makeContext({ user: { id: "user-1" } }));
    const body = (await response.json()) as { data: { id: string; due_date: string; status: string }[] };

    expect(response.status).toBe(200);
    expect(selectMock).toHaveBeenCalledWith("*");
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({ id: "task-1", due_date: "2026-04-01", status: "OVERDUE" });
  });
});

describe("POST /api/v1/tasks", () => {
  it("should return a 401 JSON error and never call the Supabase client when unauthenticated", async () => {
    await assertRequiresApiAuth(POST, (user) => makeContext({ user, body: validJsonBody() }), createClientMock);
  });

  it("should insert scoped to the authenticated user and ignore a client-supplied user_id", async () => {
    const singleMock = vi.fn().mockResolvedValue({ data: makeTaskRow(), error: null });
    const selectMock = vi.fn().mockReturnValue({ single: singleMock });
    const insertMock = vi.fn().mockReturnValue({ select: selectMock });
    createClientMock.mockReturnValue({ from: vi.fn().mockReturnValue({ insert: insertMock }) });

    const context = makeContext({ user: { id: "user-1" }, body: { ...validJsonBody(), user_id: "user-2" } });

    const response = await POST(context);

    expect(response.status).toBe(201);
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ user_id: "user-1" }));
  });

  it("should return a 400 with the first validation issue on invalid input", async () => {
    createClientMock.mockReturnValue({ from: vi.fn() });

    const response = await POST(makeContext({ user: { id: "user-1" }, body: { ...validJsonBody(), name: "" } }));
    const body = (await response.json()) as { error: { message: string; issues: string[] } };

    expect(response.status).toBe(400);
    expect(body.error.message).toBe("Name is required");
  });

  it("should reject a JSON string frequency_value instead of coercing it", async () => {
    createClientMock.mockReturnValue({ from: vi.fn() });

    const response = await POST(
      makeContext({ user: { id: "user-1" }, body: { ...validJsonBody(), frequency_value: "3" } }),
    );

    expect(response.status).toBe(400);
  });

  it("should return 201 with the created task's DTO on success", async () => {
    const singleMock = vi.fn().mockResolvedValue({ data: makeTaskRow(), error: null });
    const selectMock = vi.fn().mockReturnValue({ single: singleMock });
    const insertMock = vi.fn().mockReturnValue({ select: selectMock });
    createClientMock.mockReturnValue({ from: vi.fn().mockReturnValue({ insert: insertMock }) });

    const response = await POST(makeContext({ user: { id: "user-1" }, body: validJsonBody() }));
    const body = (await response.json()) as { data: { id: string; due_date: string; status: string } };

    expect(response.status).toBe(201);
    expect(body.data).toMatchObject({ id: "task-1", due_date: "2026-04-01", status: "OVERDUE" });
  });
});
