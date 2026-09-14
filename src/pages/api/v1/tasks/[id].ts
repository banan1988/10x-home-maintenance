import { format } from "date-fns";
import type { APIRoute } from "astro";

import { requireApiClient, requireApiUser } from "@/lib/api-auth";
import { jsonData, jsonError, parseJsonBody } from "@/lib/api-response";
import { updateTaskJsonSchema } from "@/lib/task-schema";
import { toTaskDto } from "@/lib/task-dto";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const user = requireApiUser(context);
  if (user instanceof Response) return user;

  if (!context.params.id) return jsonError(400, "Missing task id");

  const supabase = requireApiClient(context);
  if (supabase instanceof Response) return supabase;

  // Ownership enforced by RLS, not this filter — see
  // supabase/migrations/20260827194321_create_maintenance_tasks.sql
  const { data: task, error } = await supabase
    .from("maintenance_tasks")
    .select("*")
    .eq("id", context.params.id)
    .maybeSingle();

  if (error || !task) {
    return jsonError(404, "Task not found");
  }

  return jsonData(200, toTaskDto(task));
};

export const PATCH: APIRoute = async (context) => {
  const user = requireApiUser(context);
  if (user instanceof Response) return user;

  if (!context.params.id) return jsonError(400, "Missing task id");

  const supabase = requireApiClient(context);
  if (supabase instanceof Response) return supabase;

  const body = await parseJsonBody(context.request);
  if (body instanceof Response) return body;

  const parsed = updateTaskJsonSchema.safeParse(body);

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message);
    return jsonError(400, issues[0], issues);
  }

  const { last_done_date, ...rest } = parsed.data;
  const update = {
    ...rest,
    ...(last_done_date ? { last_done_date: format(last_done_date, "yyyy-MM-dd") } : {}),
  };

  // Ownership enforced by RLS, not this filter — see
  // supabase/migrations/20260827194321_create_maintenance_tasks.sql
  const { data: task, error } = await supabase
    .from("maintenance_tasks")
    .update(update)
    .eq("id", context.params.id)
    .select()
    .maybeSingle();

  if (error || !task) {
    return jsonError(404, "Task not found");
  }

  return jsonData(200, toTaskDto(task));
};

export const DELETE: APIRoute = async (context) => {
  const user = requireApiUser(context);
  if (user instanceof Response) return user;

  if (!context.params.id) return jsonError(400, "Missing task id");

  const supabase = requireApiClient(context);
  if (supabase instanceof Response) return supabase;

  // Ownership enforced by RLS, not this filter — see
  // supabase/migrations/20260827194321_create_maintenance_tasks.sql
  const { data: task, error } = await supabase
    .from("maintenance_tasks")
    .delete()
    .eq("id", context.params.id)
    .select()
    .maybeSingle();

  if (error || !task) {
    return jsonError(404, "Task not found");
  }

  return new Response(null, { status: 204 });
};
