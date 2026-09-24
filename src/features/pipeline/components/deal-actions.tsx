"use client";

import { Pencil, Trash2 } from "lucide-react";
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

import { setDealDeleted } from "../actions";

interface DealActionsProps {
  dealId: string;
  title: string;
  canEdit: boolean;
  canDelete: boolean;
}

export function DealActions({
  dealId,
  title,
  canEdit,
  canDelete,
}: DealActionsProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await setDealDeleted({ id: dealId, deleted: true });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setConfirming(false);

      toast.success(`${title} deleted.`, {
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              const undo = await setDealDeleted({ id: dealId, deleted: false });
              if (undo.ok) {
                toast.success(`${title} restored.`);
                router.refresh();
              } else {
                toast.error(undo.error);
              }
            }),
        },
      });

      router.replace("/pipeline");
      router.refresh();
    });
  }

  if (!canEdit && !canDelete) return null;

  return (
    <>
      <div className="flex items-center gap-2">
        {canEdit && (
          <Button asChild variant="outline">
            <Link href={`/pipeline/${dealId}/edit`}>
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

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {title}?</DialogTitle>
            <DialogDescription>
              Nothing is permanently destroyed. The deal is hidden from the board
              and can be restored, and its stage history is kept either way.
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
