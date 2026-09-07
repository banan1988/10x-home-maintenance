import { useState, type SyntheticEvent } from "react";
import { useFormStatus } from "react-dom";
import { format } from "date-fns";
import { CalendarIcon, CircleAlert, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Constants } from "@/db/database.types";
import { addTaskSchema } from "@/lib/task-schema";

interface Props {
  serverError?: string | null;
}

type FieldName = "name" | "category" | "importance" | "frequency_value" | "frequency_unit" | "last_done_date";
type FieldErrors = Partial<Record<FieldName, string>>;

function AddTaskSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Adding..." : "Add task"}
    </Button>
  );
}

export default function AddTaskDialog({ serverError }: Props) {
  const [open, setOpen] = useState(Boolean(serverError));
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [importance, setImportance] = useState("");
  const [frequencyValue, setFrequencyValue] = useState("");
  const [frequencyUnit, setFrequencyUnit] = useState("");
  const [lastDoneDate, setLastDoneDate] = useState<Date | undefined>(undefined);
  const [errors, setErrors] = useState<FieldErrors>({});

  function handleSubmit(event: SyntheticEvent<HTMLFormElement>) {
    const result = addTaskSchema.safeParse({
      name,
      category,
      importance,
      frequency_value: frequencyValue,
      frequency_unit: frequencyUnit,
      last_done_date: lastDoneDate,
    });

    if (!result.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as FieldName;
        nextErrors[field] ??= issue.message;
      }
      setErrors(nextErrors);
      event.preventDefault();
      return;
    }

    setErrors({});
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Add task
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a maintenance task</DialogTitle>
          <DialogDescription>Track a task and let its status update automatically.</DialogDescription>
        </DialogHeader>
        <form method="POST" action="/api/tasks" className="space-y-4" onSubmit={handleSubmit} noValidate>
          {serverError ? (
            <p className="border-destructive/30 bg-destructive/10 text-destructive flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <CircleAlert className="size-4 shrink-0" />
              {serverError}
            </p>
          ) : null}

          <div>
            <label htmlFor="name" className="mb-1 block text-sm">
              Name
            </label>
            <input
              id="name"
              name="name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
              className="w-full rounded-md border px-3 py-2 text-sm"
            />
            {errors.name ? <p className="text-destructive mt-1 text-xs">{errors.name}</p> : null}
          </div>

          <div>
            <label htmlFor="category" className="mb-1 block text-sm">
              Category
            </label>
            <Select name="category" value={category || undefined} onValueChange={setCategory}>
              <SelectTrigger id="category" className="w-full">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {Constants.public.Enums.maintenance_category.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category ? <p className="text-destructive mt-1 text-xs">{errors.category}</p> : null}
          </div>

          <div>
            <label htmlFor="importance" className="mb-1 block text-sm">
              Importance
            </label>
            <Select name="importance" value={importance || undefined} onValueChange={setImportance}>
              <SelectTrigger id="importance" className="w-full">
                <SelectValue placeholder="Select importance" />
              </SelectTrigger>
              <SelectContent>
                {Constants.public.Enums.maintenance_importance.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.importance ? <p className="text-destructive mt-1 text-xs">{errors.importance}</p> : null}
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label htmlFor="frequency_value" className="mb-1 block text-sm">
                Frequency
              </label>
              <input
                id="frequency_value"
                name="frequency_value"
                type="number"
                min={1}
                value={frequencyValue}
                onChange={(event) => {
                  setFrequencyValue(event.target.value);
                }}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
              {errors.frequency_value ? (
                <p className="text-destructive mt-1 text-xs">{errors.frequency_value}</p>
              ) : null}
            </div>

            <div className="flex-1">
              <label htmlFor="frequency_unit" className="mb-1 block text-sm">
                Unit
              </label>
              <Select name="frequency_unit" value={frequencyUnit || undefined} onValueChange={setFrequencyUnit}>
                <SelectTrigger id="frequency_unit" className="w-full">
                  <SelectValue placeholder="Select unit" />
                </SelectTrigger>
                <SelectContent>
                  {Constants.public.Enums.maintenance_frequency_unit.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.frequency_unit ? <p className="text-destructive mt-1 text-xs">{errors.frequency_unit}</p> : null}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm">Last done</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" className="w-full justify-start font-normal">
                  <CalendarIcon className="size-4" />
                  {lastDoneDate ? format(lastDoneDate, "PPP") : "Pick a date"}
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
            {errors.last_done_date ? <p className="text-destructive mt-1 text-xs">{errors.last_done_date}</p> : null}
          </div>

          <DialogFooter>
            <AddTaskSubmitButton />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
