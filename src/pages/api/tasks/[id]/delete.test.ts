import { describe, expect, it, vi } from "vitest";
import type { APIContext } from "astro";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: createClientMock,
}));

const { POST } = await import("./delete");

function makeContext(user: { id: string } | null) {
  return {
    locals: { user },
    request: {},
    cookies: {},
    params: { id: "task-1" },
    redirect: (path: string) => new Response(null, { status: 302, headers: { Location: path } }),
  } as unknown as APIContext;
}

describe("POST /api/tasks/[id]/delete", () => {
  it("should redirect to /auth/signin and never call delete when there is no authenticated user", async () => {
    const context = makeContext(null);

    const response = await POST(context);

    expect(response.headers.get("Location")).toBe("/auth/signin");
    expect(createClientMock).not.toHaveBeenCalled();
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
});
