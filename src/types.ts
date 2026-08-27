import type { Database } from "@/db/database.types";

export type MaintenanceTask = Database["public"]["Tables"]["maintenance_tasks"]["Row"];
export type MaintenanceTaskInsert = Database["public"]["Tables"]["maintenance_tasks"]["Insert"];
export type MaintenanceTaskUpdate = Database["public"]["Tables"]["maintenance_tasks"]["Update"];

export type MaintenanceCategory = Database["public"]["Enums"]["maintenance_category"];
export type MaintenanceImportance = Database["public"]["Enums"]["maintenance_importance"];
export type MaintenanceFrequencyUnit = Database["public"]["Enums"]["maintenance_frequency_unit"];
