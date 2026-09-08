import type { APIRoute } from "astro";
import { format } from "date-fns";
import { createClient } from "@/lib/supabase";

export const prerender = false;

const NOT_FOUND_REDIRECT = `/tasks?error=${encodeURIComponent("Task not found")}`;

export const POST: APIRoute = async (context) => {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }

  if (!context.params.id) {
    return context.redirect(NOT_FOUND_REDIRECT);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/tasks?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const today = format(new Date(), "yyyy-MM-dd");

  const { data, error } = await supabase
    .from("maintenance_tasks")
    .update({ last_done_date: today })
    .eq("id", context.params.id)
    .select();

  if (error || data.length === 0) {
    return context.redirect(NOT_FOUND_REDIRECT);
  }

  return context.redirect("/tasks?success=task-completed");
};
