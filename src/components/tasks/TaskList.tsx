import { useEffect, useState, type SubmitEvent } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EditTaskDialog } from "@/components/tasks/EditTaskDialog";
import { DeleteTaskAlertDialog } from "@/components/tasks/DeleteTaskAlertDialog";
import { ConfirmCompleteDialog } from "@/components/tasks/ConfirmCompleteDialog";
import { ErrorBanner } from "@/components/ErrorBanner";
import { formatCompletionMessage, isFrequencyUnit } from "@/lib/format-completion-message";
import { shouldConfirmCompletion } from "@/lib/status";
import type { MaintenanceTaskWithStatus } from "@/types";

const SUCCESS_MESSAGES: Record<string, string> = {
  "task-updated": "Task updated",
  "task-deleted": "Task deleted",
  "task-completed": "Task completed",
};

interface TaskListProps {
  tasks: MaintenanceTaskWithStatus[];
  success?: string | null;
  error?: string | null;
  editing?: string | null;
  next?: string | null;
  unit?: string | null;
}

function resolveSuccessMessage(success: string, next?: string | null, unit?: string | null): string {
  const frequencyValue = next ? Number(next) : NaN;
  const normalizedUnit = unit ?? null;
  if (success === "task-completed" && !Number.isNaN(frequencyValue) && isFrequencyUnit(normalizedUnit)) {
    return formatCompletionMessage(frequencyValue, normalizedUnit);
  }
  return SUCCESS_MESSAGES[success] ?? "Success";
}

export default function TaskList({ tasks, success, error, editing, next, unit }: TaskListProps) {
  const [errorMessage] = useState(error ?? null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(editing ?? null);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [confirmingTaskId, setConfirmingTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (success) {
      toast.success(resolveSuccessMessage(success, next, unit));
    }
    if (success || error || editing) {
      const url = new URL(window.location.href);
      url.searchParams.delete("success");
      url.searchParams.delete("error");
      url.searchParams.delete("editing");
      url.searchParams.delete("next");
      url.searchParams.delete("unit");
      window.history.replaceState({}, "", url);
    }
  }, [success, error, editing, next, unit]);

  return (
    <div className="space-y-4">
      <ErrorBanner message={errorMessage} />
      {tasks.length === 0 ? (
        <p className="text-blue-100/80">No maintenance tasks yet.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Importance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Due date</TableHead>
              <TableHead>Last done</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tasks.map((task) => (
              <TableRow key={task.id}>
                <TableCell>{task.name}</TableCell>
                <TableCell>{task.category}</TableCell>
                <TableCell>{task.importance}</TableCell>
                <TableCell>{task.status}</TableCell>
                <TableCell>{format(task.dueDate, "yyyy-MM-dd")}</TableCell>
                <TableCell>{task.last_done_date}</TableCell>
                <TableCell className="space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingTaskId(task.id);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      setDeletingTaskId(task.id);
                    }}
                  >
                    Delete
                  </Button>
                  <form
                    method="POST"
                    action={`/api/tasks/${task.id}/complete`}
                    className="inline"
                    onSubmit={(event: SubmitEvent<HTMLFormElement>) => {
                      if (shouldConfirmCompletion(task.status)) {
                        event.preventDefault();
                        setConfirmingTaskId(task.id);
                      }
                    }}
                  >
                    <Button type="submit" variant="secondary" size="sm">
                      Mark done
                    </Button>
                  </form>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <EditTaskDialog
        task={tasks.find((task) => task.id === editingTaskId) ?? null}
        onOpenChange={() => {
          setEditingTaskId(null);
        }}
      />
      <DeleteTaskAlertDialog
        task={tasks.find((task) => task.id === deletingTaskId) ?? null}
        onOpenChange={() => {
          setDeletingTaskId(null);
        }}
      />
      <ConfirmCompleteDialog
        task={tasks.find((task) => task.id === confirmingTaskId) ?? null}
        onOpenChange={() => {
          setConfirmingTaskId(null);
        }}
      />
    </div>
  );
}
