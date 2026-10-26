"use client";

import { Ban, Check, Mail, Pencil, Printer, Send, Trash2, Undo2 } from "lucide-react";
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

import { setProposalDeleted, setProposalStatus } from "../actions";
import type { ProposalStatus } from "../schema";

interface ProposalActionsProps {
  proposalId: string;
  number: string;
  title: string;
  status: ProposalStatus;
  /** From the client snapshot while sent, the live contact while a draft. */
  clientEmail: string | null;
  issuerName: string;
  canDelete: boolean;
}

/**
 * Where a proposal can go from here.
 *
 * Only the moves that make sense are offered: a draft can be sent, a sent one
 * accepted or declined, and anything can go back to draft to be reworked. A
 * status picker listing all four would invite marking a draft accepted.
 */
export function ProposalActions({
  proposalId,
  number,
  title,
  status,
  clientEmail,
  issuerName,
  canDelete,
}: ProposalActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function move(next: ProposalStatus, message: string) {
    startTransition(async () => {
      const result = await setProposalStatus({ id: proposalId, status: next });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(message);
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await setProposalDeleted({ id: proposalId, deleted: true });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setConfirming(false);
      toast.success(`${number} removed.`, {
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              const undo = await setProposalDeleted({
                id: proposalId,
                deleted: false,
              });
              if (undo.ok) {
                toast.success(`${number} restored.`);
                router.refresh();
              } else {
                toast.error(undo.error);
              }
            }),
        },
      });
      router.push("/proposals");
      router.refresh();
    });
  }

  /**
   * Sending, without a mail server.
   *
   * This opens the user's own mail client with the client's address, a subject
   * and an opening line already filled in; they attach the PDF they just saved
   * and send it themselves. It goes from their real address, lands in their
   * Sent folder, and threads properly when the client replies — all of which a
   * server sending on their behalf would have to work to imitate.
   */
  const mailto = clientEmail
    ? `mailto:${encodeURIComponent(clientEmail)}` +
      `?subject=${encodeURIComponent(`Proposal ${number} — ${title}`)}` +
      `&body=${encodeURIComponent(
        `Hello,\n\nPlease find our proposal for ${title} attached (${number}).\n\n` +
          `Do let us know if anything needs adjusting and we will be glad to revise it.\n\n` +
          `Best regards,\n${issuerName}`,
      )}`
    : null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer />
          Print / PDF
        </Button>

        {mailto && (
          <Button asChild variant="outline" size="sm">
            {/* Not a Next <Link>: mailto: is handed to the OS, not routed. */}
            <a href={mailto}>
              <Mail />
              Email to client
            </a>
          </Button>
        )}

        {status === "draft" && (
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`/proposals/${proposalId}/edit`}>
                <Pencil />
                Edit
              </Link>
            </Button>
            <Button
              size="sm"
              disabled={isPending}
              onClick={() =>
                move("sent", "Marked as sent. The company details are now frozen on it.")
              }
            >
              <Send />
              Mark as sent
            </Button>
          </>
        )}

        {status === "sent" && (
          <>
            <Button
              size="sm"
              disabled={isPending}
              onClick={() => move("accepted", "Accepted. Nice one.")}
            >
              <Check />
              Mark accepted
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => move("declined", "Marked as declined.")}
            >
              <Ban />
              Mark declined
            </Button>
          </>
        )}

        {status !== "draft" && (
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            className="text-muted-foreground"
            onClick={() =>
              move("draft", "Back to draft. It can be edited again, and the details unfreeze.")
            }
          >
            <Undo2 />
            Back to draft
          </Button>
        )}

        {canDelete && (
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            className="text-muted-foreground"
            onClick={() => setConfirming(true)}
          >
            <Trash2 />
            Remove
          </Button>
        )}
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove {number}?</DialogTitle>
            <DialogDescription>
              It leaves the list, but nothing is destroyed and the number is not
              reused — a later proposal still counts on from here.
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
