import { afterEach, describe, expect, it, vi } from "vitest";
import type { APIContext } from "astro";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: createClientMock,
}));

const { POST } = await import("./complete");

function makeContext(user: { id: string } | null) {
  return {
    locals: { user },
    request: {},
    cookies: {},
    params: { id: "task-1" },
    redirect: (path: string) => new Response(null, { status: 302, headers: { Location: path } }),
  } as unknown as APIContext;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/tasks/[id]/complete", () => {
  it("should redirect to /auth/signin and never call update when there is no authenticated user", async () => {
    const context = makeContext(null);

    const response = await POST(context);

    expect(response.headers.get("Location")).toBe("/auth/signin");
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("should redirect with a success param and set last_done_date to today when the update affects a row", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T12:00:00Z"));

    const selectMock = vi.fn().mockResolvedValue({ data: [{ id: "task-1" }], error: null });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    createClientMock.mockReturnValue({ from: vi.fn().mockReturnValue({ update: updateMock }) });

    const context = makeContext({ id: "user-1" });

    const response = await POST(context);

    expect(response.headers.get("Location")).toBe("/tasks?success=task-completed");
    expect(updateMock).toHaveBeenCalledWith({ last_done_date: "2026-03-01" });
    expect(eqMock).toHaveBeenCalledWith("id", "task-1");
  });

  it("should compute the date fresh on each call rather than capturing it once", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-07-15T12:00:00Z"));

    const selectMock = vi.fn().mockResolvedValue({ data: [{ id: "task-1" }], error: null });
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
});
