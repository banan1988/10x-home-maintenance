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

interface DeleteTaskAlertDialogProps {
  task: MaintenanceTaskWithStatus | null;
  onOpenChange: () => void;
}

export function DeleteTaskAlertDialog({ task, onOpenChange }: DeleteTaskAlertDialogProps) {
  if (!task) return null;

  return (
    <AlertDialog open onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete task</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to permanently delete &quot;{task.name}&quot;? This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <form method="POST" action={`/api/tasks/${task.id}/delete`}>
            <Button type="submit" variant="destructive">
              Delete
            </Button>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
