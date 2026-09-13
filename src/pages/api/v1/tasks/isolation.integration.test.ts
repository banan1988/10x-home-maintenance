import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient as createSupabaseJsClient, type SupabaseClient } from "@supabase/supabase-js";
import type { APIContext } from "astro";
import type { Database } from "@/db/database.types";

// Real-RLS integration tier for the /api/v1/tasks JSON routes (test-plan.md §3 Risk #3) — invokes the
// actual route handlers with `@/lib/supabase`'s createClient mocked to return a real, already-authenticated
// Supabase client (from a genuine signInWithPassword call), so Postgres RLS itself — not a mock — enforces
// every assertion below. Requires local Supabase:
// `npx supabase start && npx supabase db reset && npm run test:integration`.

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
// Supabase CLI's well-known local demo anon key — stable across `supabase db reset`, safe to
// hardcode as a fallback since it only ever grants access to a local, ephemeral database.
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

// SUPABASE_URL is also the name production/CI use for the real project. If a shell has it
// exported to something other than local Supabase, fail loudly here instead of silently trying
// to sign in against a real project with these fixture credentials.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(SUPABASE_URL)) {
  throw new Error(
    `isolation.integration.test.ts refuses to run against a non-local SUPABASE_URL (got "${SUPABASE_URL}"). ` +
      "Unset SUPABASE_URL or point it at your local Supabase instance before running npm run test:integration.",
  );
}

const USER_A = {
  email: "isolation-test-user-a@example.com",
  password: "isolation-test-password",
  taskId: "33333333-3333-3333-3333-333333333333",
};
const USER_B = {
  email: "isolation-test-user-b@example.com",
  password: "isolation-test-password",
  taskId: "44444444-4444-4444-4444-444444444444",
};

async function signInAs(credentials: {
  email: string;
  password: string;
}): Promise<{ client: SupabaseClient<Database>; userId: string }> {
  const client = createSupabaseJsClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await client.auth.signInWithPassword(credentials);
  if (error) {
    throw new Error(`Failed to sign in as ${credentials.email}: ${error.message}`);
  }
  return { client, userId: data.user.id };
}

const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn() }));

vi.mock("@/lib/supabase", () => ({ createClient: createClientMock }));

const { POST: createPOST } = await import("@/pages/api/v1/tasks/index");
const { GET: itemGET, PATCH: itemPATCH, DELETE: itemDELETE } = await import("./[id]");

function makeContext(overrides: { userId: string; id?: string; body?: unknown }): APIContext {
  return {
    locals: { user: { id: overrides.userId } },
    request: {
      headers: new Headers(),
      json: () => Promise.resolve(overrides.body),
    },
    cookies: {},
    params: { id: overrides.id },
  } as unknown as APIContext;
}

describe("/api/v1/tasks RLS isolation (real Supabase)", () => {
  let clientA: SupabaseClient<Database>;
  let clientB: SupabaseClient<Database>;
  let userIdA: string;
  let userIdB: string;

  beforeAll(async () => {
    const a = await signInAs(USER_A);
    const b = await signInAs(USER_B);
    clientA = a.client;
    clientB = b.client;
    userIdA = a.userId;
    userIdB = b.userId;
  });

  afterAll(async () => {
    await clientA.auth.signOut();
    await clientB.auth.signOut();
  });

  beforeEach(() => {
    createClientMock.mockReset();
  });

  it("should return 404 when user A reads user B's task via GET /api/v1/tasks/:id", async () => {
    createClientMock.mockReturnValue(clientA);

    const response = await itemGET(makeContext({ userId: userIdA, id: USER_B.taskId }));

    expect(response.status).toBe(404);
  });

  it("should return 404 when user A updates user B's task via PATCH /api/v1/tasks/:id", async () => {
    createClientMock.mockReturnValue(clientA);

    const response = await itemPATCH(
      makeContext({ userId: userIdA, id: USER_B.taskId, body: { name: "Should never apply" } }),
    );

    expect(response.status).toBe(404);
  });

  it("should return 404 when user A deletes user B's task via DELETE /api/v1/tasks/:id", async () => {
    createClientMock.mockReturnValue(clientA);

    const response = await itemDELETE(makeContext({ userId: userIdA, id: USER_B.taskId }));

    expect(response.status).toBe(404);
  });

  it("should store a POST with a spoofed user_id under the real authenticated user's id", async () => {
    createClientMock.mockReturnValue(clientA);

    const response = await createPOST(
      makeContext({
        userId: userIdA,
        body: {
          name: "Spoofed insert",
          category: "other",
          importance: "low",
          frequency_value: 1,
          frequency_unit: "day",
          last_done_date: "2026-01-01",
          user_id: userIdB,
        },
      }),
    );
    const body = (await response.json()) as { data: { id: string; user_id: string } };

    expect(response.status).toBe(201);
    expect(body.data.user_id).toBe(userIdA);

    await clientA.from("maintenance_tasks").delete().eq("id", body.data.id);
  });
});
