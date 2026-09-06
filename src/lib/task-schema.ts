import { z } from "zod";

import { Constants } from "@/db/database.types";

export const addTaskSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  category: z.enum(Constants.public.Enums.maintenance_category),
  importance: z.enum(Constants.public.Enums.maintenance_importance),
  frequency_value: z.coerce.number().int().positive("Frequency must be a positive number"),
  frequency_unit: z.enum(Constants.public.Enums.maintenance_frequency_unit),
  last_done_date: z.coerce.date().refine((date) => date <= new Date(), "Last done date cannot be in the future"),
});

export type AddTaskInput = z.infer<typeof addTaskSchema>;
