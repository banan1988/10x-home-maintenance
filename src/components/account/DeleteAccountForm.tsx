import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface DeleteAccountFormProps {
  email: string;
}

export function DeleteAccountForm({ email }: DeleteAccountFormProps) {
  const [confirmEmail, setConfirmEmail] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMatch = confirmEmail.trim().toLowerCase() === email.trim().toLowerCase();

  async function handleConfirmDelete() {
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/v1/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail }),
      });

      if (response.status === 204) {
        window.location.href = "/account-deleted";
        return;
      }

      const body = (await response.json()) as { error?: { message?: string } };
      setError(body.error?.message ?? "Failed to delete account");
      setDialogOpen(false);
    } catch {
      setError("Failed to delete account");
      setDialogOpen(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm-email">Type your email to confirm</Label>
        <Input
          id="confirm-email"
          type="email"
          value={confirmEmail}
          onChange={(event) => {
            setConfirmEmail(event.target.value);
          }}
          placeholder={email}
          autoComplete="off"
        />
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Button
        variant="destructive"
        size="sm"
        className="self-start"
        disabled={!isMatch || submitting}
        onClick={() => {
          setDialogOpen(true);
        }}
      >
        Delete my account
      </Button>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes your account and all your data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmDelete();
              }}
              disabled={submitting}
            >
              Delete my account
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
