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

import { setContactDeleted } from "../actions";

interface ContactRowActionsProps {
  contactId: string;
  name: string;
  canEdit: boolean;
  canDelete: boolean;
}

export function ContactRowActions({
  contactId,
  name,
  canEdit,
  canDelete,
}: ContactRowActionsProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await setContactDeleted({ id: contactId, deleted: true });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setConfirming(false);

      // Deleting is reversible by design, so offer the reversal rather than
      // making the user hunt for it. Managers can see deleted rows, which is
      // what makes this possible without the service role.
      toast.success(`${name} deleted.`, {
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              const undo = await setContactDeleted({
                id: contactId,
                deleted: false,
              });
              if (undo.ok) {
                toast.success(`${name} restored.`);
                router.refresh();
              } else {
                toast.error(undo.error);
              }
            }),
        },
      });

      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={isPending}
            aria-label={`Actions for ${name}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild disabled={!canEdit}>
            <Link href={`/contacts/${contactId}/edit`}>
              <Pencil />
              Edit
            </Link>
          </DropdownMenuItem>

          {canDelete && (
            <>
              <DropdownMenuSeparator />
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

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              Nothing is permanently destroyed. The contact is hidden from lists
              and can be restored, along with everything attached to it.
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
