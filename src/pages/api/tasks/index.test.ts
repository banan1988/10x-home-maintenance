import { describe, expect, it, vi } from "vitest";
import type { AstroCookies } from "astro";

const { createClientMock, insertMock } = vi.hoisted(() => {
  const insertMock = vi.fn().mockResolvedValue({ error: null });
  return {
    createClientMock: vi.fn(() => ({ from: () => ({ insert: insertMock }) })),
    insertMock,
  };
});

vi.mock("@/lib/supabase", () => ({
  createClient: createClientMock,
}));

const { POST } = await import("@/pages/api/tasks/index");

type PostContext = Parameters<typeof POST>[0];

function buildContext({ user, formData }: { user: { id: string } | null; formData: Record<string, string> }) {
  const body = new FormData();
  Object.entries(formData).forEach(([key, value]) => {
    body.append(key, value);
  });

  return {
    request: {
      headers: new Headers(),
      formData: () => Promise.resolve(body),
    },
    cookies: {} as AstroCookies,
    locals: { user },
    redirect: vi.fn((path: string) => new Response(null, { status: 302, headers: { Location: path } })),
  } as unknown as PostContext;
}

describe("POST /api/tasks", () => {
  it("should redirect to sign-in and never insert when there is no authenticated user", async () => {
    const context = buildContext({
      user: null,
      formData: {
        name: "Replace furnace filter",
        category: "hvac",
        importance: "medium",
        frequency_value: "3",
        frequency_unit: "month",
        last_done_date: "2026-01-01",
      },
    });

    await POST(context);

    expect(context.redirect).toHaveBeenCalledWith("/auth/signin");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("should insert the parsed task scoped to the user and redirect to the dashboard on success", async () => {
    const context = buildContext({
      user: { id: "user-1" },
      formData: {
        name: "Replace furnace filter",
        category: "hvac",
        importance: "medium",
        frequency_value: "3",
        frequency_unit: "month",
        last_done_date: "2026-01-01",
      },
    });

    await POST(context);

    expect(insertMock).toHaveBeenCalledWith({
      name: "Replace furnace filter",
      category: "hvac",
      importance: "medium",
      frequency_value: 3,
      frequency_unit: "month",
      last_done_date: "2026-01-01",
      user_id: "user-1",
    });
    expect(context.redirect).toHaveBeenCalledWith("/dashboard?success=task-added");
  });
});
