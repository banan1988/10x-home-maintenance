import { useEffect, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EditTaskDialog } from "@/components/tasks/EditTaskDialog";
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
}

export default function TaskList({ tasks, success, error }: TaskListProps) {
  const [errorMessage] = useState(error ?? null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  useEffect(() => {
    if (success) {
      toast.success(SUCCESS_MESSAGES[success] ?? "Success");
    }
    if (success || error) {
      const url = new URL(window.location.href);
      url.searchParams.delete("success");
      url.searchParams.delete("error");
      window.history.replaceState({}, "", url);
    }
  }, [success, error]);

  return (
    <div className="space-y-4">
      {errorMessage && (
        <p className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-900/30 px-3 py-2 text-sm text-red-300">
          {errorMessage}
        </p>
      )}
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
                <TableCell>
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
    </div>
  );
}
