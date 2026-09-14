import { afterAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";
import type { Database } from "@/db/database.types";

// Real-Supabase integration tier — proves the maintenance_tasks ON DELETE CASCADE FK actually
// fires when a user is deleted via the admin client. Uses a self-contained disposable user rather
// than the shared isolation.integration.test.ts fixtures, so the two suites can run in either
// order without one deleting state the other depends on.
//
// The maintenance_tasks table intentionally grants no privileges to service_role (see
// supabase/migrations/20260827194321_create_maintenance_tasks.sql:50-53) — RLS bypass and base
// table privileges are separate Postgres mechanisms, and this app's admin client never needs to
// touch that table at runtime. So verification here connects directly to Postgres as the
// superuser (bypassing PostgREST/RLS/grants entirely) rather than querying via the admin
// Supabase client, and rather than adding a migration grant solely for this test's benefit.
//
// Requires local Supabase: `npx supabase start && npx supabase db reset && npm run test:integration`.

const SUPABASE_URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
// Supabase CLI's well-known local demo anon key — stable across `supabase db reset`, safe to
// hardcode as a fallback since it only ever grants access to a local, ephemeral database.
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Supabase CLI's well-known local demo Postgres superuser connection string — same well-known
// local-only convention as SUPABASE_ANON_KEY above.
const SUPABASE_DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// SUPABASE_URL is also the name production/CI use for the real project. If a shell has it
// exported to something other than local Supabase, fail loudly here instead of silently trying
// to run this destructive test against a real project.
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(SUPABASE_URL)) {
  throw new Error(
    `account.integration.test.ts refuses to run against a non-local SUPABASE_URL (got "${SUPABASE_URL}"). ` +
      "Unset SUPABASE_URL or point it at your local Supabase instance before running npm run test:integration.",
  );
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    "account.integration.test.ts requires SUPABASE_SERVICE_ROLE_KEY in the environment. " +
      "Run `npx supabase status` to get your local service_role key and export it before running npm run test:integration.",
  );
}

const adminClient: SupabaseClient<Database> = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

async function countMaintenanceTasks(userId: string): Promise<number> {
  const pg = new PgClient({ connectionString: SUPABASE_DB_URL });
  await pg.connect();
  try {
    const result = await pg.query<{ count: string }>(
      "select count(*) from public.maintenance_tasks where user_id = $1",
      [userId],
    );
    return Number(result.rows[0]?.count ?? 0);
  } finally {
    await pg.end();
  }
}

describe("account deletion cascade (real Supabase)", () => {
  const email = `account-deletion-test-${Date.now()}@example.com`;
  const password = "account-deletion-test-password";
  let userId: string | undefined;

  afterAll(async () => {
    if (!userId) return;
    // Idempotent: a successful test run already deleted this user, so this is a no-op cleanup
    // for the case where an earlier assertion threw before the delete step ran.
    await adminClient.auth.admin.deleteUser(userId);
  });

  it("should remove a user's maintenance_tasks rows when their account is deleted via the admin client", async () => {
    const { data: createData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(createError).toBeNull();
    userId = createData.user?.id;
    if (!userId) {
      throw new Error("auth.admin.createUser did not return a user id");
    }

    const anonClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { error: signInError } = await anonClient.auth.signInWithPassword({ email, password });
    expect(signInError).toBeNull();

    const { error: insertError } = await anonClient.from("maintenance_tasks").insert({
      name: "Disposable task for cascade-delete test",
      category: "other",
      importance: "low",
      frequency_value: 1,
      frequency_unit: "day",
      last_done_date: "2026-01-01",
      user_id: userId,
    });
    expect(insertError).toBeNull();
    await anonClient.auth.signOut();

    await expect(countMaintenanceTasks(userId)).resolves.toBe(1);

    const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(userId);
    expect(deleteUserError).toBeNull();

    await expect(countMaintenanceTasks(userId)).resolves.toBe(0);

    const { data: getUserData, error: getUserError } = await adminClient.auth.admin.getUserById(userId);
    expect(getUserData.user).toBeNull();
    expect(getUserError).not.toBeNull();
  });
});
