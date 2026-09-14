import { afterEach, describe, expect, it, vi } from "vitest";
import type { APIContext } from "astro";
import { assertRequiresAuth } from "@/test-utils/auth-contract";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: createClientMock,
}));

const { POST } = await import("./complete");

const TASK_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_TASK_ID = "22222222-2222-4222-8222-222222222222";
const MALFORMED_ID = "not-a-uuid";

function makeContext(user: { id: string } | null, id = TASK_ID) {
  return {
    locals: { user },
    request: {},
    cookies: {},
    params: { id },
    redirect: (path: string) => new Response(null, { status: 302, headers: { Location: path } }),
  } as unknown as APIContext;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/tasks/[id]/complete", () => {
  it("should redirect to /auth/signin and never call update when there is no authenticated user", async () => {
    await assertRequiresAuth(POST, makeContext, createClientMock);
  });

  it("should redirect with a success param and set last_done_date to today when the update affects a row", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T12:00:00Z"));

    const selectMock = vi
      .fn()
      .mockResolvedValue({ data: [{ id: TASK_ID, frequency_value: 2, frequency_unit: "week" }], error: null });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    createClientMock.mockReturnValue({ from: vi.fn().mockReturnValue({ update: updateMock }) });

    const context = makeContext({ id: "user-1" });

    const response = await POST(context);

    expect(response.headers.get("Location")).toBe("/tasks?success=task-completed&next=2&unit=week");
    expect(updateMock).toHaveBeenCalledWith({ last_done_date: "2026-03-01" });
    expect(eqMock).toHaveBeenCalledWith("id", TASK_ID);
  });

  it("should forward the updated row's frequency value and unit in the redirect", async () => {
    const selectMock = vi
      .fn()
      .mockResolvedValue({ data: [{ id: "task-1", frequency_value: 1, frequency_unit: "year" }], error: null });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    createClientMock.mockReturnValue({ from: vi.fn().mockReturnValue({ update: updateMock }) });

    const context = makeContext({ id: "user-1" });

    const response = await POST(context);

    expect(response.headers.get("Location")).toBe("/tasks?success=task-completed&next=1&unit=year");
  });

  it("should compute the date fresh on each call rather than capturing it once", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-07-15T12:00:00Z"));

    const selectMock = vi.fn().mockResolvedValue({ data: [{ id: TASK_ID }], error: null });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    createClientMock.mockReturnValue({ from: vi.fn().mockReturnValue({ update: updateMock }) });

    const context = makeContext({ id: "user-1" });

    await POST(context);

    expect(updateMock).toHaveBeenCalledWith({ last_done_date: "2027-07-15" });
  });

  it("should redirect with a generic not-found error when the update affects no row", async () => {
    const selectMock = vi.fn().mockResolvedValue({ data: [], error: null });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    createClientMock.mockReturnValue({ from: vi.fn().mockReturnValue({ update: updateMock }) });

    const context = makeContext({ id: "user-1" });

    const response = await POST(context);

    expect(response.headers.get("Location")).toBe(`/tasks?error=${encodeURIComponent("Task not found")}`);
  });

  it("should produce the same generic not-found redirect for another user's task as for a nonexistent one", async () => {
    const selectMock = vi.fn().mockResolvedValue({ data: [], error: null });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    createClientMock.mockReturnValue({ from: vi.fn().mockReturnValue({ update: updateMock }) });

    const context = makeContext({ id: "user-1" }, OTHER_TASK_ID);

    const response = await POST(context);

    expect(response.headers.get("Location")).toBe(`/tasks?error=${encodeURIComponent("Task not found")}`);
    expect(eqMock).toHaveBeenCalledWith("id", OTHER_TASK_ID);
  });

  it("should redirect with the same generic not-found error for a malformed id, without calling Supabase", async () => {
    createClientMock.mockClear();

    const context = makeContext({ id: "user-1" }, MALFORMED_ID);

    const response = await POST(context);

    expect(response.headers.get("Location")).toBe(`/tasks?error=${encodeURIComponent("Task not found")}`);
    expect(createClientMock).not.toHaveBeenCalled();
  });
});
