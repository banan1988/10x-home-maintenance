import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/db/database.types";

// Real-RLS integration tier (test-plan.md §3 Phase 1) — proves the database itself blocks
// cross-user access, not just the mocked route-level unit tests. Requires local Supabase:
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
  const client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data, error } = await client.auth.signInWithPassword(credentials);
  if (error) {
    throw new Error(`Failed to sign in as ${credentials.email}: ${error.message}`);
  }
  return { client, userId: data.user.id };
}

describe("maintenance_tasks RLS isolation (real Supabase)", () => {
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

  it("lets a user read their own task", async () => {
    const { data, error } = await clientA.from("maintenance_tasks").select("*").eq("id", USER_A.taskId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("lets a user update their own task", async () => {
    const { data, error } = await clientA
      .from("maintenance_tasks")
      .update({ name: "Updated by owner" })
      .eq("id", USER_A.taskId)
      .select();

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("lets a user delete their own task", async () => {
    const { data: inserted, error: insertError } = await clientA
      .from("maintenance_tasks")
      .insert({
        name: "Throwaway task for delete test",
        category: "other",
        importance: "low",
        frequency_value: 1,
        frequency_unit: "day",
        last_done_date: "2026-01-01",
        user_id: userIdA,
      })
      .select();
    expect(insertError).toBeNull();
    const disposableTaskId = inserted?.[0]?.id;
    if (!disposableTaskId) {
      throw new Error("Insert did not return an id for the disposable task");
    }

    const { data, error } = await clientA.from("maintenance_tasks").delete().eq("id", disposableTaskId).select();

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("produces zero affected rows reading another user's task, exactly like a nonexistent one", async () => {
    const { data, error } = await clientA.from("maintenance_tasks").select("*").eq("id", USER_B.taskId);

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("produces zero affected rows updating another user's task, exactly like a nonexistent one", async () => {
    const { data, error } = await clientA
      .from("maintenance_tasks")
      .update({ name: "Should never apply" })
      .eq("id", USER_B.taskId)
      .select();

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("produces zero affected rows deleting another user's task, exactly like a nonexistent one", async () => {
    const { data, error } = await clientA.from("maintenance_tasks").delete().eq("id", USER_B.taskId).select();

    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });

  it("rejects an insert with a user_id spoofed to another user's id", async () => {
    const { data, error } = await clientA
      .from("maintenance_tasks")
      .insert({
        name: "Spoofed insert",
        category: "other",
        importance: "low",
        frequency_value: 1,
        frequency_unit: "day",
        last_done_date: "2026-01-01",
        user_id: userIdB,
      })
      .select();

    expect(data).toBeNull();
    expect(error).not.toBeNull();
  });
});
