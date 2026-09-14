import { describe, expect, it, vi } from "vitest";
import type { AstroCookies } from "astro";

const { createClientMock, signUpMock } = vi.hoisted(() => {
  const signUpMock = vi.fn();
  return {
    createClientMock: vi.fn((): { auth: { signUp: typeof signUpMock } } | null => ({ auth: { signUp: signUpMock } })),
    signUpMock,
  };
});

vi.mock("@/lib/supabase", () => ({
  createClient: createClientMock,
}));

const { POST } = await import("@/pages/api/auth/signup");

type PostContext = Parameters<typeof POST>[0];

function buildContext() {
  const body = new FormData();
  body.append("email", "user@example.com");
  body.append("password", "correct-horse-battery-staple");

  return {
    request: {
      headers: new Headers(),
      formData: () => Promise.resolve(body),
    },
    cookies: {} as AstroCookies,
    redirect: vi.fn((path: string) => new Response(null, { status: 302, headers: { Location: path } })),
  } as unknown as PostContext;
}

describe("POST /api/auth/signup", () => {
  it("should redirect straight to the dashboard when signUp already returns an active session", async () => {
    signUpMock.mockResolvedValueOnce({ data: { session: { access_token: "token" } }, error: null });

    const response = await POST(buildContext());

    expect(response.headers.get("Location")).toBe("/dashboard");
  });

  it("should redirect to the confirm-email page when signUp returns no session", async () => {
    signUpMock.mockResolvedValueOnce({ data: { session: null }, error: null });

    const response = await POST(buildContext());

    expect(response.headers.get("Location")).toBe("/auth/confirm-email");
  });

  it("should redirect back to the signup form with an error message on failure", async () => {
    signUpMock.mockResolvedValueOnce({ data: { session: null }, error: { message: "Email already registered" } });

    const response = await POST(buildContext());

    expect(response.headers.get("Location")).toBe(
      `/auth/signup?error=${encodeURIComponent("Email already registered")}`,
    );
  });

  it("should redirect with an error when Supabase is not configured", async () => {
    createClientMock.mockReturnValueOnce(null);

    const response = await POST(buildContext());

    expect(response.headers.get("Location")).toBe(
      `/auth/signup?error=${encodeURIComponent("Supabase is not configured")}`,
    );
  });
});
