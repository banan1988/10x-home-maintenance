import { describe, expect, it, vi } from "vitest";
import type { SetAllCookies } from "@supabase/ssr";
import type { AstroCookies } from "astro";

const { createServerClientMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
}));

vi.mock("astro:env/server", () => ({
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_KEY: "test-anon-key",
}));

vi.mock("@supabase/ssr", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@supabase/ssr")>();
  return {
    ...actual,
    createServerClient: createServerClientMock,
  };
});

const { createClient } = await import("@/lib/supabase");

describe("createClient", () => {
  it("should force Secure and HttpOnly on every cookie set via setAll, without dropping Supabase's other options", () => {
    createServerClientMock.mockImplementation(
      (_url: string, _key: string, { cookies }: { cookies: { setAll: SetAllCookies } }) => {
        void cookies.setAll([{ name: "sb-session", value: "abc", options: { path: "/", sameSite: "lax" } }]);
        return {};
      },
    );

    const set = vi.fn();
    const cookies = { set } as unknown as AstroCookies;

    createClient(new Headers(), cookies);

    expect(set).toHaveBeenCalledWith("sb-session", "abc", {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: true,
    });
  });
});
