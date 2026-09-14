import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { MaintenanceTaskWithStatus } from "@/types";

interface ConfirmCompleteDialogProps {
  task: MaintenanceTaskWithStatus | null;
  onOpenChange: () => void;
}

export function ConfirmCompleteDialog({ task, onOpenChange }: ConfirmCompleteDialogProps) {
  if (!task) return null;

  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Mark as done early?</AlertDialogTitle>
          <AlertDialogDescription>
            &quot;{task.name}&quot; isn&apos;t due until {format(task.dueDate, "yyyy-MM-dd")}. Are you sure you want to
            mark it done now?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <form method="POST" action={`/api/tasks/${task.id}/complete`}>
            <Button type="submit" variant="secondary">
              Mark done
            </Button>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
