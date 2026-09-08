import { describe, expect, it, vi } from "vitest";
import type { APIContext } from "astro";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: createClientMock,
}));

const { POST } = await import("./[id]");

function makeFormData(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  return form;
}

function validFormFields() {
  return {
    name: "Replace furnace filter",
    category: "hvac",
    importance: "medium",
    frequency_value: "3",
    frequency_unit: "month",
    last_done_date: "2026-01-01",
  };
}

function makeContext(overrides: { user: { id: string } | null; formFields: Record<string, string> }) {
  return {
    locals: { user: overrides.user },
    request: { formData: () => Promise.resolve(makeFormData(overrides.formFields)) },
    cookies: {},
    params: { id: "task-1" },
    redirect: (path: string) => new Response(null, { status: 302, headers: { Location: path } }),
  } as unknown as APIContext;
}

describe("POST /api/tasks/[id]", () => {
  it("should redirect to /auth/signin and never call update when there is no authenticated user", async () => {
    const context = makeContext({ user: null, formFields: validFormFields() });

    const response = await POST(context);

    expect(response.headers.get("Location")).toBe("/auth/signin");
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it("should redirect with a success param when the update affects a row", async () => {
    const selectMock = vi.fn().mockResolvedValue({ data: [{ id: "task-1" }], error: null });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    createClientMock.mockReturnValue({ from: vi.fn().mockReturnValue({ update: updateMock }) });

    const context = makeContext({ user: { id: "user-1" }, formFields: validFormFields() });

    const response = await POST(context);

    expect(response.headers.get("Location")).toBe("/tasks?success=task-updated");
    expect(updateMock).toHaveBeenCalled();
    expect(eqMock).toHaveBeenCalledWith("id", "task-1");
  });

  it("should redirect with a generic not-found error when the update affects no row", async () => {
    const selectMock = vi.fn().mockResolvedValue({ data: [], error: null });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    createClientMock.mockReturnValue({ from: vi.fn().mockReturnValue({ update: updateMock }) });

    const context = makeContext({ user: { id: "user-1" }, formFields: validFormFields() });

    const response = await POST(context);

    expect(response.headers.get("Location")).toBe(`/tasks?error=${encodeURIComponent("Task not found")}`);
  });
});
