import { addDays, parseISO } from "date-fns";
import { z } from "zod";

import { Constants } from "@/db/database.types";

export const addTaskSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200, "Name must be 200 characters or less"),
  category: z.enum(Constants.public.Enums.maintenance_category, "Select a valid category"),
  importance: z.enum(Constants.public.Enums.maintenance_importance, "Select a valid importance"),
  frequency_value: z.coerce
    .number()
    .int()
    .positive("Frequency must be a positive number")
    // Bounds frequency_value far below the ~100,000,000-day threshold where computeDueDate's addDays/
    // addMonths/addYears silently overflow into an Invalid Date, which crashes downstream format() calls
    // (TaskList.tsx, task-dto.ts) with "Invalid time value".
    .max(1000, "Frequency must be 1000 or less"),
  frequency_unit: z.enum(Constants.public.Enums.maintenance_frequency_unit, "Select a valid frequency unit"),
  last_done_date: z
    .string("Pick a last-done date")
    .max(10, "Invalid date")
    .transform((value) => parseISO(value))
    .refine((date) => !isNaN(date.getTime()), "Invalid date")
    // A 1-day grace window absorbs timezone skew between the user's local "today" and the
    // server's UTC clock (e.g. a user east of UTC can have their genuine today parsed as
    // still-future relative to the server) without tracking each user's timezone.
    .refine((date) => date <= addDays(new Date(), 1), "Last done date cannot be in the future"),
});

export type AddTaskInput = z.infer<typeof addTaskSchema>;

// A JSON body carries a real number, unlike a form field — a strict JSON API rejects a string like "3"
// rather than silently coercing it the way `addTaskSchema.frequency_value` does.
export const createTaskJsonSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200, "Name must be 200 characters or less"),
  category: z.enum(Constants.public.Enums.maintenance_category, "Select a valid category"),
  importance: z.enum(Constants.public.Enums.maintenance_importance, "Select a valid importance"),
  frequency_value: z
    .number()
    .int()
    .positive("Frequency must be a positive number")
    // See addTaskSchema's frequency_value comment: same Date-range overflow guard.
    .max(1000, "Frequency must be 1000 or less"),
  frequency_unit: z.enum(Constants.public.Enums.maintenance_frequency_unit, "Select a valid frequency unit"),
  last_done_date: z
    .string("Pick a last-done date")
    .max(10, "Invalid date")
    .transform((value) => parseISO(value))
    .refine((date) => !isNaN(date.getTime()), "Invalid date")
    // See addTaskSchema's last_done_date comment: same 1-day timezone grace window.
    .refine((date) => date <= addDays(new Date(), 1), "Last done date cannot be in the future"),
});

export type CreateTaskJsonInput = z.infer<typeof createTaskJsonSchema>;

export const updateTaskJsonSchema = createTaskJsonSchema
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, "At least one field must be provided");

export type UpdateTaskJsonInput = z.infer<typeof updateTaskJsonSchema>;
