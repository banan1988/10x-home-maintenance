import { beforeEach, describe, expect, it, vi } from "vitest";
import type { APIContext } from "astro";

import { assertRequiresApiAuth } from "@/test-utils/api-auth-contract";

const { createClientMock, createAdminClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  createAdminClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/supabase-admin", () => ({
  createAdminClient: createAdminClientMock,
}));

const { DELETE } = await import("@/pages/api/v1/account");

beforeEach(() => {
  createClientMock.mockClear();
  createAdminClientMock.mockClear();
});

function makeContext(overrides: { user: { id: string; email?: string } | null; body?: unknown }) {
  return {
    locals: { user: overrides.user },
    request: {
      headers: new Headers(),
      json: () => Promise.resolve(overrides.body),
    },
    cookies: {},
  } as unknown as APIContext;
}

describe("DELETE /api/v1/account", () => {
  it("should return a 401 JSON error and never call the Supabase client when unauthenticated", async () => {
    await assertRequiresApiAuth(DELETE, (user) => makeContext({ user, body: {} }), createClientMock);
  });

  it("should return 400 when the body is missing confirmEmail", async () => {
    createClientMock.mockReturnValue({ auth: { signOut: vi.fn() } });

    const response = await DELETE(makeContext({ user: { id: "user-1", email: "user@example.com" }, body: {} }));
    const body = (await response.json()) as { error: { message: string } };

    expect(response.status).toBe(400);
    expect(body.error.message).toBeTruthy();
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("should return 400 when confirmEmail does not match the authenticated user's email", async () => {
    createClientMock.mockReturnValue({ auth: { signOut: vi.fn() } });

    const response = await DELETE(
      makeContext({ user: { id: "user-1", email: "user@example.com" }, body: { confirmEmail: "wrong@example.com" } }),
    );
    const body = (await response.json()) as { error: { message: string } };

    expect(response.status).toBe(400);
    expect(body.error.message).toBe("Email confirmation does not match");
    expect(createAdminClientMock).not.toHaveBeenCalled();
  });

  it("should match confirmEmail case-insensitively and ignoring surrounding whitespace", async () => {
    const signOutMock = vi.fn().mockResolvedValue({ error: null });
    createClientMock.mockReturnValue({ auth: { signOut: signOutMock } });
    const deleteUserMock = vi.fn().mockResolvedValue({ error: null });
    createAdminClientMock.mockReturnValue({ auth: { admin: { deleteUser: deleteUserMock } } });

    const response = await DELETE(
      makeContext({
        user: { id: "user-1", email: "user@example.com" },
        body: { confirmEmail: "  USER@EXAMPLE.COM  " },
      }),
    );

    expect(response.status).toBe(204);
  });

  it("should return a 503 JSON error when the admin Supabase client is not configured", async () => {
    createClientMock.mockReturnValue({ auth: { signOut: vi.fn() } });
    createAdminClientMock.mockReturnValue(null);

    const response = await DELETE(
      makeContext({ user: { id: "user-1", email: "user@example.com" }, body: { confirmEmail: "user@example.com" } }),
    );

    expect(response.status).toBe(503);
  });

  it("should return 502 and leave the session intact when deleteUser fails", async () => {
    const signOutMock = vi.fn();
    createClientMock.mockReturnValue({ auth: { signOut: signOutMock } });
    const deleteUserMock = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    createAdminClientMock.mockReturnValue({ auth: { admin: { deleteUser: deleteUserMock } } });

    const response = await DELETE(
      makeContext({ user: { id: "user-1", email: "user@example.com" }, body: { confirmEmail: "user@example.com" } }),
    );
    const body = (await response.json()) as { error: { message: string } };

    expect(response.status).toBe(502);
    expect(body.error.message).toBeTruthy();
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it("should delete the account, sign out the request-scoped session, and return 204 on success", async () => {
    const signOutMock = vi.fn().mockResolvedValue({ error: null });
    createClientMock.mockReturnValue({ auth: { signOut: signOutMock } });
    const deleteUserMock = vi.fn().mockResolvedValue({ error: null });
    createAdminClientMock.mockReturnValue({ auth: { admin: { deleteUser: deleteUserMock } } });

    const response = await DELETE(
      makeContext({ user: { id: "user-1", email: "user@example.com" }, body: { confirmEmail: "user@example.com" } }),
    );

    expect(response.status).toBe(204);
    expect(deleteUserMock).toHaveBeenCalledWith("user-1");
    expect(signOutMock).toHaveBeenCalledOnce();
  });
});
