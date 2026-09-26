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

import { setTransactionDeleted } from "../actions";

interface TransactionRowActionsProps {
  transactionId: string;
  label: string;
  canEdit: boolean;
}

export function TransactionRowActions({
  transactionId,
  label,
  canEdit,
}: TransactionRowActionsProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await setTransactionDeleted({ id: transactionId, deleted: true });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setConfirming(false);
      toast.success("Transaction removed.", {
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              const undo = await setTransactionDeleted({
                id: transactionId,
                deleted: false,
              });
              if (undo.ok) {
                toast.success("Transaction restored.");
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
            className="size-7 text-muted-foreground"
            disabled={isPending}
            aria-label={`Actions for ${label}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild disabled={!canEdit}>
            <Link href={`/finance/${transactionId}/edit`}>
              <Pencil />
              Edit
            </Link>
          </DropdownMenuItem>

          {canEdit && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setConfirming(true)}
              >
                <Trash2 />
                Remove
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Remove this transaction?</DialogTitle>
          <DialogHeader>
            <DialogDescription>
              It leaves the ledger and every report immediately, but nothing is
              destroyed — a financial record is kept and can be restored.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove} disabled={isPending}>
              {isPending ? "Removing" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
