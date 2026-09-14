import type { MaintenanceFrequencyUnit } from "@/types";

const FREQUENCY_UNITS: MaintenanceFrequencyUnit[] = ["day", "week", "month", "year"];

export function isFrequencyUnit(value: string | null): value is MaintenanceFrequencyUnit {
  return FREQUENCY_UNITS.includes(value as MaintenanceFrequencyUnit);
}

export function formatCompletionMessage(frequencyValue: number, frequencyUnit: MaintenanceFrequencyUnit): string {
  const unitLabel = frequencyValue === 1 ? frequencyUnit : `${frequencyUnit}s`;
  return `Task completed — see you in ${frequencyValue} ${unitLabel}`;
}
