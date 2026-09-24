"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { setTaskDeleted } from "../actions";

interface TaskActionsProps {
  taskId: string;
  title: string;
  canEdit: boolean;
  canDelete: boolean;
  /** Where to go after deleting. Stay put in a list, leave on a detail page. */
  redirectTo?: string;
  /** A full button on a detail page, an icon in a table row. */
  variant?: "menu" | "buttons";
}

export function TaskActions({
  taskId,
  title,
  canEdit,
  canDelete,
  redirectTo,
  variant = "menu",
}: TaskActionsProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await setTaskDeleted({ id: taskId, deleted: true });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setConfirming(false);

      // Deletion is reversible by design, so offer the reversal rather than
      // making someone go looking for it. Managers can still see deleted rows,
      // which is what makes the undo possible without the service role.
      toast.success(`${title} deleted.`, {
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              const undo = await setTaskDeleted({ id: taskId, deleted: false });
              if (undo.ok) {
                toast.success(`${title} restored.`);
                router.refresh();
              } else {
                toast.error(undo.error);
              }
            }),
        },
      });

      if (redirectTo) {
        router.replace(redirectTo);
      }
      router.refresh();
    });
  }

  // Nothing to offer, so render nothing rather than an empty menu.
  if (!canEdit && !canDelete) return null;

  return (
    <>
      {variant === "buttons" ? (
        <div className="flex items-center gap-2">
          {canEdit && (
            <Button asChild variant="outline">
              <Link href={`/tasks/${taskId}/edit`}>
                <Pencil />
                Edit
              </Link>
            </Button>
          )}
          {canDelete && (
            <Button
              variant="outline"
              onClick={() => setConfirming(true)}
              disabled={isPending}
            >
              <Trash2 />
              Delete
            </Button>
          )}
        </div>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={isPending}
              aria-label={`Actions for ${title}`}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canEdit && (
              <DropdownMenuItem asChild>
                <Link href={`/tasks/${taskId}/edit`}>
                  <Pencil />
                  Edit
                </Link>
              </DropdownMenuItem>
            )}
            {canDelete && (
              <>
                {canEdit && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setConfirming(true)}
                >
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {title}?</DialogTitle>
            <DialogDescription>
              Nothing is permanently destroyed. The task is hidden from lists and
              boards, and can be restored.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove} disabled={isPending}>
              {isPending ? "Deleting" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
