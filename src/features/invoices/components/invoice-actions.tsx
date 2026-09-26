"use client";

import { Check, Ban, Pencil, Printer, Send, Trash2, Undo2 } from "lucide-react";
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

import { setInvoiceDeleted, setInvoiceStatus } from "../actions";
import type { InvoiceStatus } from "../schema";

interface InvoiceActionsProps {
  invoiceId: string;
  number: string;
  status: InvoiceStatus;
}

/**
 * Where an invoice can go from here.
 *
 * Only the moves that make sense are offered: a draft can be sent, a sent one
 * paid or cancelled, and anything can go back to draft to be corrected. A
 * status picker listing all four would invite marking a draft paid.
 */
export function InvoiceActions({ invoiceId, number, status }: InvoiceActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function move(next: InvoiceStatus, message: string) {
    startTransition(async () => {
      const result = await setInvoiceStatus({ id: invoiceId, status: next });
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
      const result = await setInvoiceDeleted({ id: invoiceId, deleted: true });
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
              const undo = await setInvoiceDeleted({ id: invoiceId, deleted: false });
              if (undo.ok) {
                toast.success(`${number} restored.`);
                router.refresh();
              } else {
                toast.error(undo.error);
              }
            }),
        },
      });
      router.push("/invoices");
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer />
          Print / PDF
        </Button>

        {status === "draft" && (
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`/invoices/${invoiceId}/edit`}>
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
            <Button size="sm" disabled={isPending} onClick={() => move("paid", "Marked as paid.")}>
              <Check />
              Mark as paid
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={() => move("cancelled", "Invoice cancelled.")}
            >
              <Ban />
              Cancel
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
      </div>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove {number}?</DialogTitle>
            <DialogDescription>
              It leaves the list, but nothing is destroyed and the number is not
              reused — a later invoice still counts on from here.
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
