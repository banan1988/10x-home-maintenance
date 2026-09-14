import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";
import { taskIdSchema } from "@/lib/task-schema";

export const prerender = false;

const NOT_FOUND_REDIRECT = `/tasks?error=${encodeURIComponent("Task not found")}`;

export const POST: APIRoute = async (context) => {
  const user = requireUser(context);
  if (user instanceof Response) return user;

  if (!context.params.id) {
    return context.redirect(NOT_FOUND_REDIRECT);
  }

  if (!taskIdSchema.safeParse(context.params.id).success) {
    return context.redirect(NOT_FOUND_REDIRECT);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/tasks?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  // Ownership enforced by RLS, not this filter — see
  // supabase/migrations/20260827194321_create_maintenance_tasks.sql
  const { data, error } = await supabase.from("maintenance_tasks").delete().eq("id", context.params.id).select();

  if (error || data.length === 0) {
    return context.redirect(NOT_FOUND_REDIRECT);
  }

  return context.redirect("/tasks?success=task-deleted");
};
