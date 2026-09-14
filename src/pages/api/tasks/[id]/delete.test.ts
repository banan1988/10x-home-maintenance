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

describe("POST /api/tasks/[id]/delete", () => {
  it("should redirect to /auth/signin and never call delete when there is no authenticated user", async () => {
    await assertRequiresAuth(POST, makeContext, createClientMock);
  });

  it("should redirect with a success param when the delete affects a row", async () => {
    const selectMock = vi.fn().mockResolvedValue({ data: [{ id: TASK_ID }], error: null });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const deleteMock = vi.fn().mockReturnValue({ eq: eqMock });
    createClientMock.mockReturnValue({ from: vi.fn().mockReturnValue({ delete: deleteMock }) });

    const context = makeContext({ id: "user-1" });

    const response = await POST(context);

    expect(response.headers.get("Location")).toBe("/tasks?success=task-deleted");
    expect(deleteMock).toHaveBeenCalled();
    expect(eqMock).toHaveBeenCalledWith("id", TASK_ID);
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
