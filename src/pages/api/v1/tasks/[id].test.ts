import { beforeEach, describe, expect, it, vi } from "vitest";
import type { APIContext } from "astro";

import { assertRequiresApiAuth } from "@/test-utils/api-auth-contract";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/supabase-admin", () => ({
  createAdminClient: vi.fn(),
}));

const { GET, PATCH, DELETE } = await import("./[id]");

beforeEach(() => {
  createClientMock.mockClear();
});

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_TASK_ID = "22222222-2222-4222-8222-222222222222";
const NONEXISTENT_TASK_ID = "33333333-3333-4333-8333-333333333333";
const MALFORMED_ID = "not-a-uuid";

function makeTaskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TASK_ID,
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

function makeContext(overrides: { user: { id: string } | null; id?: string; body?: unknown }) {
  return {
    locals: { user: overrides.user },
    request: {
      headers: new Headers(),
      json: () => Promise.resolve(overrides.body),
    },
    cookies: {},
    params: { id: "id" in overrides ? overrides.id : TASK_ID },
  } as unknown as APIContext;
}

describe("GET /api/v1/tasks/[id]", () => {
  it("should return a 401 JSON error and never call the Supabase client when unauthenticated", async () => {
    await assertRequiresApiAuth(GET, (user) => makeContext({ user }), createClientMock);
  });

  it("should return the task serialized with computed due_date and status on success", async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: makeTaskRow(), error: null });
    const eqMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    createClientMock.mockReturnValue({ from: vi.fn().mockReturnValue({ select: selectMock }) });

    const response = await GET(makeContext({ user: { id: "user-1" } }));
    const body = (await response.json()) as { data: { id: string; due_date: string } };

    expect(response.status).toBe(200);
    expect(eqMock).toHaveBeenCalledWith("id", TASK_ID);
    expect(body.data).toMatchObject({ id: TASK_ID, due_date: "2026-04-01" });
  });

  it("should return 404 when the task does not exist", async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const eqMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    createClientMock.mockReturnValue({ from: vi.fn().mockReturnValue({ select: selectMock }) });

    const response = await GET(makeContext({ user: { id: "user-1" }, id: NONEXISTENT_TASK_ID }));

    expect(response.status).toBe(404);
  });

  it("should produce the same 404 for another user's task as for a nonexistent one", async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const eqMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    createClientMock.mockReturnValue({ from: vi.fn().mockReturnValue({ select: selectMock }) });

    const response = await GET(makeContext({ user: { id: "user-1" }, id: OTHER_TASK_ID }));

    expect(response.status).toBe(404);
    expect(eqMock).toHaveBeenCalledWith("id", OTHER_TASK_ID);
  });

  it("should return 400 when params.id is missing", async () => {
    const response = await GET(makeContext({ user: { id: "user-1" }, id: undefined }));

    expect(response.status).toBe(400);
  });

  it("should return the same 404 for a malformed id as a nonexistent one, without calling Supabase", async () => {
    const response = await GET(makeContext({ user: { id: "user-1" }, id: MALFORMED_ID }));

    expect(response.status).toBe(404);
    expect(createClientMock).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/v1/tasks/[id]", () => {
  it("should return a 401 JSON error and never call the Supabase client when unauthenticated", async () => {
    await assertRequiresApiAuth(PATCH, (user) => makeContext({ user, body: { name: "New name" } }), createClientMock);
  });

  it("should update only the sent field and reach the database with just that field", async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: makeTaskRow({ name: "New name" }), error: null });
    const selectMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    createClientMock.mockReturnValue({ from: vi.fn().mockReturnValue({ update: updateMock }) });

    const response = await PATCH(makeContext({ user: { id: "user-1" }, body: { name: "New name" } }));

    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith({ name: "New name" });
  });

  it("should format a last_done_date field before sending it to the database", async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: makeTaskRow(), error: null });
    const selectMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    createClientMock.mockReturnValue({ from: vi.fn().mockReturnValue({ update: updateMock }) });

    await PATCH(makeContext({ user: { id: "user-1" }, body: { last_done_date: "2026-02-01" } }));

    expect(updateMock).toHaveBeenCalledWith({ last_done_date: "2026-02-01" });
  });

  it("should return 400 with a message when the body is empty", async () => {
    createClientMock.mockReturnValue({ from: vi.fn() });

    const response = await PATCH(makeContext({ user: { id: "user-1" }, body: {} }));
    const body = (await response.json()) as { error: { message: string } };

    expect(response.status).toBe(400);
    expect(body.error.message).toBe("At least one field must be provided");
  });

  it("should return 400 when a sent field is invalid", async () => {
    createClientMock.mockReturnValue({ from: vi.fn() });

    const response = await PATCH(makeContext({ user: { id: "user-1" }, body: { frequency_value: -1 } }));

    expect(response.status).toBe(400);
  });

  it("should return 404 when zero rows match", async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const selectMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    createClientMock.mockReturnValue({ from: vi.fn().mockReturnValue({ update: updateMock }) });

    const response = await PATCH(
      makeContext({ user: { id: "user-1" }, id: OTHER_TASK_ID, body: { name: "New name" } }),
    );

    expect(response.status).toBe(404);
  });

  it("should return 400 when params.id is missing", async () => {
    const response = await PATCH(makeContext({ user: { id: "user-1" }, id: undefined, body: { name: "New name" } }));

    expect(response.status).toBe(400);
  });

  it("should return the same 404 for a malformed id as a nonexistent one, without calling Supabase", async () => {
    const response = await PATCH(makeContext({ user: { id: "user-1" }, id: MALFORMED_ID, body: { name: "New name" } }));

    expect(response.status).toBe(404);
    expect(createClientMock).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/tasks/[id]", () => {
  it("should return a 401 JSON error and never call the Supabase client when unauthenticated", async () => {
    await assertRequiresApiAuth(DELETE, (user) => makeContext({ user }), createClientMock);
  });

  it("should return 204 when the task is deleted", async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: makeTaskRow(), error: null });
    const selectMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const deleteMock = vi.fn().mockReturnValue({ eq: eqMock });
    createClientMock.mockReturnValue({ from: vi.fn().mockReturnValue({ delete: deleteMock }) });

    const response = await DELETE(makeContext({ user: { id: "user-1" } }));

    expect(response.status).toBe(204);
  });

  it("should return the same 404 for another user's task as for a nonexistent one", async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const selectMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const deleteMock = vi.fn().mockReturnValue({ eq: eqMock });
    createClientMock.mockReturnValue({ from: vi.fn().mockReturnValue({ delete: deleteMock }) });

    const response = await DELETE(makeContext({ user: { id: "user-1" }, id: OTHER_TASK_ID }));

    expect(response.status).toBe(404);
    expect(eqMock).toHaveBeenCalledWith("id", OTHER_TASK_ID);
  });

  it("should return 400 when params.id is missing", async () => {
    const response = await DELETE(makeContext({ user: { id: "user-1" }, id: undefined }));

    expect(response.status).toBe(400);
  });

  it("should return the same 404 for a malformed id as a nonexistent one, without calling Supabase", async () => {
    const response = await DELETE(makeContext({ user: { id: "user-1" }, id: MALFORMED_ID }));

    expect(response.status).toBe(404);
    expect(createClientMock).not.toHaveBeenCalled();
  });
});
