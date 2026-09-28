"use client";

import { CheckCircle2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
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

import { markRenewed, setRenewalDeleted } from "../actions";
import type { RenewalStatus } from "../schema";

interface RenewalRowActionsProps {
  renewal: { id: string; name: string; status: RenewalStatus };
  canEdit: boolean;
  canDelete: boolean;
}

export function RenewalRowActions({
  renewal,
  canEdit,
  canDelete,
}: RenewalRowActionsProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function renew() {
    startTransition(async () => {
      const result = await markRenewed({ id: renewal.id });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      // Says the new date out loud, because the whole value of the button is
      // that it worked out the next one for you.
      toast.success(`${renewal.name} renewed. Next due ${result.data.nextRenewalOn}.`);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await setRenewalDeleted({ id: renewal.id, deleted: true });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setConfirming(false);
      toast.success(`${renewal.name} removed.`, {
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              const undo = await setRenewalDeleted({ id: renewal.id, deleted: false });
              if (undo.ok) {
                toast.success(`${renewal.name} restored.`);
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
            aria-label={`Actions for ${renewal.name}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {/* Cancelled things do not renew; offering it would only invite a
              mistake that then has to be undone by hand. */}
          {canEdit && renewal.status !== "cancelled" && (
            <DropdownMenuItem onSelect={renew}>
              <CheckCircle2 />
              Mark renewed
            </DropdownMenuItem>
          )}

          <DropdownMenuItem asChild disabled={!canEdit}>
            <Link href={`/renewals/${renewal.id}/edit`}>
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
                Remove
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove {renewal.name}?</DialogTitle>
            <DialogDescription>
              It leaves the list and stops being counted, but nothing is
              destroyed and it can be restored. If the client simply stopped
              paying, marking it cancelled keeps the history instead.
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
