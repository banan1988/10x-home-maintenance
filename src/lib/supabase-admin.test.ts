import { afterEach, describe, expect, it, vi } from "vitest";

const { createSupabaseClientMock } = vi.hoisted(() => ({
  createSupabaseClientMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@supabase/supabase-js")>();
  return {
    ...actual,
    createClient: createSupabaseClientMock,
  };
});

async function importWithEnv(env: { SUPABASE_URL?: string; SUPABASE_SERVICE_ROLE_KEY?: string }) {
  vi.doMock("astro:env/server", () => ({
    SUPABASE_URL: undefined,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
    ...env,
  }));
  return import("@/lib/supabase-admin");
}

describe("createAdminClient", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("astro:env/server");
  });

  it("should build a session-independent client using the service-role key when both env vars are set", async () => {
    const client = { auth: { admin: { deleteUser: vi.fn() } } };
    createSupabaseClientMock.mockReturnValueOnce(client);

    const { createAdminClient } = await importWithEnv({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
    });

    const result = createAdminClient();

    expect(createSupabaseClientMock).toHaveBeenCalledWith("https://example.supabase.co", "test-service-role-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    expect(result).toBe(client);
  });

  it("should return null when SUPABASE_URL is unset", async () => {
    const { createAdminClient } = await importWithEnv({ SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key" });

    expect(createAdminClient()).toBeNull();
  });

  it("should return null when SUPABASE_SERVICE_ROLE_KEY is unset", async () => {
    const { createAdminClient } = await importWithEnv({ SUPABASE_URL: "https://example.supabase.co" });

    expect(createAdminClient()).toBeNull();
  });
});
