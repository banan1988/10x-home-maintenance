import { useState, type SubmitEvent } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Constants } from "@/db/database.types";
import { addTaskSchema } from "@/lib/task-schema";
import type { MaintenanceTaskWithStatus } from "@/types";

type FieldName = "name" | "category" | "importance" | "frequency_value" | "frequency_unit" | "last_done_date";
type FieldErrors = Partial<Record<FieldName, string>>;

interface EditTaskDialogProps {
  task: MaintenanceTaskWithStatus | null;
  onOpenChange: () => void;
}

export function EditTaskDialog({ task, onOpenChange }: EditTaskDialogProps) {
  const [taskId, setTaskId] = useState<string | null>(task?.id ?? null);
  const [name, setName] = useState(task?.name ?? "");
  const [category, setCategory] = useState(task?.category ?? "");
  const [importance, setImportance] = useState<string>(task?.importance ?? "");
  const [frequencyValue, setFrequencyValue] = useState(task ? String(task.frequency_value) : "");
  const [frequencyUnit, setFrequencyUnit] = useState<string>(task?.frequency_unit ?? "");
  const [lastDoneDate, setLastDoneDate] = useState<Date | undefined>(task ? new Date(task.last_done_date) : undefined);
  const [errors, setErrors] = useState<FieldErrors>({});

  if (task && task.id !== taskId) {
    setTaskId(task.id);
    setName(task.name);
    setCategory(task.category);
    setImportance(task.importance);
    setFrequencyValue(String(task.frequency_value));
    setFrequencyUnit(task.frequency_unit);
    setLastDoneDate(new Date(task.last_done_date));
    setErrors({});
  }

  if (!task) return null;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    const result = addTaskSchema.safeParse({
      name,
      category,
      importance,
      frequency_value: frequencyValue,
      frequency_unit: frequencyUnit,
      last_done_date: lastDoneDate ? format(lastDoneDate, "yyyy-MM-dd") : undefined,
    });

    if (!result.success) {
      event.preventDefault();
      const fieldErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && !(field in fieldErrors)) {
          fieldErrors[field as FieldName] = issue.message;
        }
      }
      setErrors(fieldErrors);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit task</DialogTitle>
        </DialogHeader>
        <form method="POST" action={`/api/tasks/${task.id}`} onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="edit-name" className="mb-1 block text-sm font-medium">
              Name
            </label>
            <Input
              id="edit-name"
              name="name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
            {errors.name && <p className="text-destructive mt-1 text-xs">{errors.name}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Category</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Constants.public.Enums.maintenance_category.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" name="category" value={category} />
            {errors.category && <p className="text-destructive mt-1 text-xs">{errors.category}</p>}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Importance</label>
            <Select value={importance} onValueChange={setImportance}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Constants.public.Enums.maintenance_importance.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input type="hidden" name="importance" value={importance} />
            {errors.importance && <p className="text-destructive mt-1 text-xs">{errors.importance}</p>}
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label htmlFor="edit-frequency-value" className="mb-1 block text-sm font-medium">
                Frequency value
              </label>
              <Input
                id="edit-frequency-value"
                name="frequency_value"
                type="number"
                min={1}
                value={frequencyValue}
                onChange={(event) => {
                  setFrequencyValue(event.target.value);
                }}
              />
              {errors.frequency_value && <p className="text-destructive mt-1 text-xs">{errors.frequency_value}</p>}
            </div>

            <div className="flex-1">
              <label className="mb-1 block text-sm font-medium">Frequency unit</label>
              <Select value={frequencyUnit} onValueChange={setFrequencyUnit}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Constants.public.Enums.maintenance_frequency_unit.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <input type="hidden" name="frequency_unit" value={frequencyUnit} />
              {errors.frequency_unit && <p className="text-destructive mt-1 text-xs">{errors.frequency_unit}</p>}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Last done date</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start font-normal">
                  <CalendarIcon />
                  {lastDoneDate ? format(lastDoneDate, "yyyy-MM-dd") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={lastDoneDate}
                  onSelect={setLastDoneDate}
                  disabled={{ after: new Date() }}
                />
              </PopoverContent>
            </Popover>
            <input type="hidden" name="last_done_date" value={lastDoneDate ? format(lastDoneDate, "yyyy-MM-dd") : ""} />
            {errors.last_done_date && <p className="text-destructive mt-1 text-xs">{errors.last_done_date}</p>}
          </div>

          <DialogFooter>
            <Button type="submit">Save changes</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
