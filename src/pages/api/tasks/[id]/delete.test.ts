import { describe, expect, it, vi } from "vitest";
import type { APIContext } from "astro";
import { assertRequiresAuth } from "@/test-utils/auth-contract";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: createClientMock,
}));

const { POST } = await import("./delete");

function makeContext(user: { id: string } | null, id = "task-1") {
  return {
    locals: { user },
    request: {},
    cookies: {},
    params: { id },
    redirect: (path: string) => new Response(null, { status: 302, headers: { Location: path } }),
  } as unknown as APIContext;
}

describe("POST /api/tasks/[id]/delete", () => {
  it("should redirect to /auth/signin and never call delete when there is no authenticated user", async () => {
    await assertRequiresAuth(POST, makeContext, createClientMock);
  });

  it("should redirect with a success param when the delete affects a row", async () => {
    const selectMock = vi.fn().mockResolvedValue({ data: [{ id: "task-1" }], error: null });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const deleteMock = vi.fn().mockReturnValue({ eq: eqMock });
    createClientMock.mockReturnValue({ from: vi.fn().mockReturnValue({ delete: deleteMock }) });

    const context = makeContext({ id: "user-1" });

    const response = await POST(context);

    expect(response.headers.get("Location")).toBe("/tasks?success=task-deleted");
    expect(deleteMock).toHaveBeenCalled();
    expect(eqMock).toHaveBeenCalledWith("id", "task-1");
  });

  it("should redirect with a generic not-found error when the delete affects no row", async () => {
    const selectMock = vi.fn().mockResolvedValue({ data: [], error: null });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const deleteMock = vi.fn().mockReturnValue({ eq: eqMock });
    createClientMock.mockReturnValue({ from: vi.fn().mockReturnValue({ delete: deleteMock }) });

    const context = makeContext({ id: "user-1" });

    const response = await POST(context);

    expect(response.headers.get("Location")).toBe(`/tasks?error=${encodeURIComponent("Task not found")}`);
  });

  it("should produce the same generic not-found redirect for another user's task as for a nonexistent one", async () => {
    const selectMock = vi.fn().mockResolvedValue({ data: [], error: null });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const deleteMock = vi.fn().mockReturnValue({ eq: eqMock });
    createClientMock.mockReturnValue({ from: vi.fn().mockReturnValue({ delete: deleteMock }) });

    const context = makeContext({ id: "user-1" }, "other-users-task");

    const response = await POST(context);

    expect(response.headers.get("Location")).toBe(`/tasks?error=${encodeURIComponent("Task not found")}`);
    expect(eqMock).toHaveBeenCalledWith("id", "other-users-task");
  });
});
