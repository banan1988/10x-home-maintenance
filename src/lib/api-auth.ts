import type { APIContext } from "astro";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase";
import { jsonError } from "@/lib/api-response";

export function requireApiUser(context: APIContext): User | Response {
  if (!context.locals.user) {
    return jsonError(401, "Authentication required");
  }
  return context.locals.user;
}

export function requireApiClient(context: APIContext): ReturnType<typeof createClient> | Response {
  const supabase = createClient(context.request.headers, context.cookies);
  if (!supabase) {
    return jsonError(503, "Supabase is not configured");
  }
  return supabase;
}
