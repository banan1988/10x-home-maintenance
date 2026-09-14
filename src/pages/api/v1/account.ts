import { z } from "zod";
import type { APIRoute } from "astro";

import { requireApiAdminClient, requireApiClient, requireApiUser } from "@/lib/api-auth";
import { jsonError, parseJsonBody } from "@/lib/api-response";

export const prerender = false;

const deleteAccountSchema = z.object({
  confirmEmail: z.string().trim().min(1).max(255),
});

export const DELETE: APIRoute = async (context) => {
  const user = requireApiUser(context);
  if (user instanceof Response) return user;

  const supabase = requireApiClient(context);
  if (supabase instanceof Response) return supabase;

  const body = await parseJsonBody(context.request);
  if (body instanceof Response) return body;

  const parsed = deleteAccountSchema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message);
    return jsonError(400, issues[0], issues);
  }

  const userEmail = (user.email ?? "").trim().toLowerCase();
  if (parsed.data.confirmEmail.trim().toLowerCase() !== userEmail) {
    return jsonError(400, "Email confirmation does not match");
  }

  console.log(`Deleting account ${user.id} at ${new Date().toISOString()}`);

  const adminClient = requireApiAdminClient(context);
  if (adminClient instanceof Response) return adminClient;

  const { error } = await adminClient.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("Failed to delete account:", error);
    return jsonError(502, "Failed to delete account");
  }

  await supabase.auth.signOut();

  return new Response(null, { status: 204 });
};
