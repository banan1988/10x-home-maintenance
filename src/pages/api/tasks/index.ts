import { format } from "date-fns";
import type { APIRoute } from "astro";
import { createClient } from "@/lib/supabase";
import { requireUser } from "@/lib/auth";
import { addTaskSchema } from "@/lib/task-schema";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const user = requireUser(context);
  if (user instanceof Response) return user;

  const form = await context.request.formData();
  const parsed = addTaskSchema.safeParse(Object.fromEntries(form));

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid task data";
    return context.redirect(`/dashboard?error=${encodeURIComponent(message)}`);
  }

  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return context.redirect(`/dashboard?error=${encodeURIComponent("Supabase is not configured")}`);
  }

  const { error } = await supabase.from("maintenance_tasks").insert({
    ...parsed.data,
    last_done_date: format(parsed.data.last_done_date, "yyyy-MM-dd"),
    user_id: user.id,
  });

  if (error) {
    return context.redirect(`/dashboard?error=${encodeURIComponent(error.message)}`);
  }

  return context.redirect("/dashboard?success=task-added");
};
