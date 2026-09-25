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

import { setProjectDeleted } from "../actions";

interface ProjectCardActionsProps {
  projectId: string;
  name: string;
  canEdit: boolean;
  canDelete: boolean;
}

/**
 * The card's overflow menu.
 *
 * `setProjectDeleted` has existed since Phase 3 with no way to reach it from
 * the interface — the table had no actions column at all. The card design puts
 * a menu in the corner, so it finally has a home.
 */
export function ProjectCardActions({
  projectId,
  name,
  canEdit,
  canDelete,
}: ProjectCardActionsProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();

  function remove() {
    startTransition(async () => {
      const result = await setProjectDeleted({ id: projectId, deleted: true });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      setConfirming(false);

      toast.success(`${name} deleted.`, {
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              const undo = await setProjectDeleted({
                id: projectId,
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
            className="size-7 text-muted-foreground"
            disabled={isPending}
            aria-label={`Actions for ${name}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild disabled={!canEdit}>
            <Link href={`/projects/${projectId}/edit`}>
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
              Nothing is permanently destroyed. The project is hidden from lists
              and can be restored, along with its websites, credentials and
              files.
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
