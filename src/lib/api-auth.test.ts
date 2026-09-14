import { describe, expect, it, vi } from "vitest";
import type { APIContext } from "astro";

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

const { requireApiUser, requireApiClient, requireApiAdminClient } = await import("@/lib/api-auth");

function makeContext(user: { id: string } | null) {
  return {
    request: { headers: new Headers() },
    cookies: {},
    locals: { user },
  } as unknown as APIContext;
}

describe("requireApiUser", () => {
  it("should return the authenticated user when present", () => {
    const user = { id: "user-1" };

    expect(requireApiUser(makeContext(user))).toBe(user);
  });

  it("should return a 401 JSON error when there is no authenticated user", async () => {
    const result = requireApiUser(makeContext(null));

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toBeTruthy();
  });
});

describe("requireApiClient", () => {
  it("should return the Supabase client when configured", () => {
    const client = { from: vi.fn() };
    createClientMock.mockReturnValueOnce(client);

    expect(requireApiClient(makeContext({ id: "user-1" }))).toBe(client);
  });

  it("should return a 503 JSON error when Supabase is not configured", async () => {
    createClientMock.mockReturnValueOnce(null);

    const result = requireApiClient(makeContext({ id: "user-1" }));

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toBeTruthy();
  });
});

describe("requireApiAdminClient", () => {
  it("should return the admin Supabase client when configured", () => {
    const client = { auth: { admin: { deleteUser: vi.fn() } } };
    createAdminClientMock.mockReturnValueOnce(client);

    expect(requireApiAdminClient(makeContext({ id: "user-1" }))).toBe(client);
  });

  it("should return a 503 JSON error when Supabase is not configured", async () => {
    createAdminClientMock.mockReturnValueOnce(null);

    const result = requireApiAdminClient(makeContext({ id: "user-1" }));

    expect(result).toBeInstanceOf(Response);
    const response = result as Response;
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toBeTruthy();
  });
});
