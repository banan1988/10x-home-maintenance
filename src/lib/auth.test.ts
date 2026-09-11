import { describe, expect, it, vi } from "vitest";
import type { APIContext } from "astro";
import { requireUser } from "@/lib/auth";

function makeContext(user: { id: string } | null) {
  return {
    locals: { user },
    redirect: vi.fn((path: string) => new Response(null, { status: 302, headers: { Location: path } })),
  } as unknown as APIContext;
}

describe("requireUser", () => {
  it("should return the authenticated user when present", () => {
    const user = { id: "user-1" };
    const context = makeContext(user);

    expect(requireUser(context)).toBe(user);
    expect(context.redirect).not.toHaveBeenCalled();
  });

  it("should return a redirect to /auth/signin when there is no authenticated user", () => {
    const context = makeContext(null);

    const result = requireUser(context);

    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get("Location")).toBe("/auth/signin");
  });
});
