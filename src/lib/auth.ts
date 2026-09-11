import type { APIContext } from "astro";
import type { User } from "@supabase/supabase-js";

export function requireUser(context: APIContext): User | Response {
  if (!context.locals.user) {
    return context.redirect("/auth/signin");
  }
  return context.locals.user;
}
