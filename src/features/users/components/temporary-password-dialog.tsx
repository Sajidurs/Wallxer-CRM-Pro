"use client";

import { Check, Copy, TriangleAlert } from "lucide-react";
import { useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface TemporaryPasswordDialogProps {
  open: boolean;
  onClose: () => void;
  email: string;
  password: string;
  title: string;
}

/**
 * Shows a generated password exactly once.
 *
 * It is never stored anywhere readable and cannot be shown again — a reset
 * generates a new one. That is the point: a password an admin can look up later
 * is a password the audit trail cannot account for.
 */
export function TemporaryPasswordDialog({
  open,
  onClose,
  email,
  password,
  title,
}: TemporaryPasswordDialogProps) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked on insecure origins and in some browsers. The
      // password is on screen and selectable, so this is not fatal.
      setCopied(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Send this to {email} through a channel you trust. They will be asked
            to change it the moment they sign in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-3">
            <code className="flex-1 break-all font-mono text-sm">{password}</code>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={copy}
              aria-label="Copy password"
            >
              {copied ? <Check className="text-green-600" /> : <Copy />}
            </Button>
          </div>

          <Alert>
            <TriangleAlert />
            <AlertDescription>
              This is shown once. Closing this dialog discards it, and the only
              way to get another is to reset the password again.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>
            {copied ? "Done" : "I have saved it"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
