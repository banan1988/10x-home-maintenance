import { format } from "date-fns";
import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";
import { addTaskSchema } from "@/lib/task-schema";

export const prerender = false;

const NOT_FOUND_REDIRECT = `/tasks?error=${encodeURIComponent("Task not found")}`;

export const POST: APIRoute = async (context) => {
  const user = requireUser(context);
  if (user instanceof Response) return user;

  if (!context.params.id) {
    return context.redirect(NOT_FOUND_REDIRECT);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/tasks?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const form = await context.request.formData();
  const parsed = addTaskSchema.safeParse({
    name: form.get("name"),
    category: form.get("category"),
    importance: form.get("importance"),
    frequency_value: form.get("frequency_value"),
    frequency_unit: form.get("frequency_unit"),
    last_done_date: form.get("last_done_date"),
  });

  if (!parsed.success) {
    const editing = encodeURIComponent(context.params.id);
    return context.redirect(`/tasks?error=${encodeURIComponent(parsed.error.issues[0].message)}&editing=${editing}`);
  }

  const { data, error } = await supabase
    .from("maintenance_tasks")
    .update({ ...parsed.data, last_done_date: format(parsed.data.last_done_date, "yyyy-MM-dd") })
    .eq("id", context.params.id)
    .select();

  if (error || data.length === 0) {
    return context.redirect(NOT_FOUND_REDIRECT);
  }

  return context.redirect("/tasks?success=task-updated");
};
