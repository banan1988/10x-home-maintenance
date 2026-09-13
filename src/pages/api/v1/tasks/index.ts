import { format } from "date-fns";
import type { APIRoute } from "astro";

import { requireApiClient, requireApiUser } from "@/lib/api-auth";
import { jsonData, jsonError } from "@/lib/api-response";
import { createTaskJsonSchema } from "@/lib/task-schema";
import { toTaskDto } from "@/lib/task-dto";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const user = requireApiUser(context);
  if (user instanceof Response) return user;

  const supabase = requireApiClient(context);
  if (supabase instanceof Response) return supabase;

  // RLS scopes rows to the caller automatically — no app-layer user_id filter, see
  // supabase/migrations/20260827194321_create_maintenance_tasks.sql
  const { data: tasks, error } = await supabase.from("maintenance_tasks").select("*");

  if (error) {
    return jsonError(500, error.message);
  }

  return jsonData(200, tasks.map(toTaskDto));
};

export const POST: APIRoute = async (context) => {
  const user = requireApiUser(context);
  if (user instanceof Response) return user;

  const supabase = requireApiClient(context);
  if (supabase instanceof Response) return supabase;

  const body: unknown = await context.request.json();
  const parsed = createTaskJsonSchema.safeParse(body);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message);
    return jsonError(400, issues[0], issues);
  }

  const { data: task, error } = await supabase
    .from("maintenance_tasks")
    .insert({
      ...parsed.data,
      last_done_date: format(parsed.data.last_done_date, "yyyy-MM-dd"),
      user_id: user.id,
    })
    .select()
    .single();

  if (error) {
    return jsonError(500, error.message);
  }

  return jsonData(201, toTaskDto(task));
};
