"use client";

import { formatDistanceToNow } from "date-fns";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";

import { revealCredential, setCredentialDeleted } from "../actions";
import type { CredentialListItem } from "../queries";
import { CATEGORY_LABELS, REVEAL_TTL_MS, type CredentialCategory } from "../schema";

interface RevealedSecret {
  username: string | null;
  secret: string;
  notes: string | null;
}

interface CredentialCardProps {
  credential: CredentialListItem;
  lastReveal: { userName: string; at: string } | null;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: (credential: CredentialListItem) => void;
}

export function CredentialCard({
  credential,
  lastReveal,
  canEdit,
  canDelete,
  onEdit,
}: CredentialCardProps) {
  // The expiry is decided at reveal time and kept beside the value, so the
  // countdown is derived during render rather than stored as its own state.
  const [revealed, setRevealed] = useState<
    { data: RevealedSecret; expiresAt: number } | null
  >(null);
  const [now, setNow] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const remaining = revealed ? Math.max(0, revealed.expiresAt - now) : 0;

  /**
   * SYSTEM_DESIGN 7.3: a revealed value lives in component state and clears
   * after 30 seconds. The countdown is visible so the clearing reads as
   * deliberate rather than as the UI having lost the value.
   *
   * Both setState calls happen inside the interval callback, never in the
   * effect body — a synchronous setState there renders once with the stale
   * value and then immediately again.
   */
  useEffect(() => {
    if (!revealed) return;

    const id = setInterval(() => {
      if (Date.now() >= revealed.expiresAt) {
        setRevealed(null);
      } else {
        setNow(Date.now());
      }
    }, 250);

    return () => clearInterval(id);
  }, [revealed]);

  function reveal() {
    startTransition(async () => {
      const result = await revealCredential({ id: credential.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      // Set from an event handler, so the first render already has the full
      // countdown rather than flashing zero.
      setNow(Date.now());
      setRevealed({ data: result.data, expiresAt: Date.now() + REVEAL_TTL_MS });
    });
  }

  function hide() {
    setRevealed(null);
  }

  async function copy(value: string, what: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error("Your browser blocked the clipboard. Select and copy manually.");
    }
  }

  function remove() {
    startTransition(async () => {
      const result = await setCredentialDeleted({ id: credential.id, deleted: true });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${credential.label} deleted.`, {
        action: {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              const undo = await setCredentialDeleted({
                id: credential.id,
                deleted: false,
              });
              toast[undo.ok ? "success" : "error"](
                undo.ok ? "Restored." : undo.error,
              );
            }),
        },
      });
    });
  }

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate font-medium">{credential.label}</span>
              <Badge variant="outline">
                {CATEGORY_LABELS[credential.category as CredentialCategory] ??
                  credential.category}
              </Badge>
            </div>
            {credential.url && (
              <a
                href={credential.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate text-xs text-muted-foreground hover:underline"
              >
                {credential.url}
              </a>
            )}
          </div>

          {(canEdit || canDelete) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Actions for ${credential.label}`}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canEdit && (
                  <DropdownMenuItem onSelect={() => onEdit(credential)}>
                    <Pencil />
                    Edit
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={remove}>
                      <Trash2 />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <dl className="grid gap-1 text-sm">
          <div className="flex items-center gap-2">
            <dt className="w-20 shrink-0 text-xs text-muted-foreground">Username</dt>
            <dd className="min-w-0 flex-1 truncate font-mono text-xs">
              {credential.username || <span className="text-muted-foreground">—</span>}
            </dd>
            {credential.username && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={() => copy(credential.username!, "username")}
                aria-label="Copy username"
              >
                {copied === "username" ? <Check className="text-green-600" /> : <Copy />}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <dt className="w-20 shrink-0 text-xs text-muted-foreground">Password</dt>
            <dd className="min-w-0 flex-1 truncate font-mono text-xs">
              {revealed ? (
                revealed.data.secret
              ) : (
                <span className="tracking-widest text-muted-foreground">••••••••••</span>
              )}
            </dd>

            {revealed ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => copy(revealed.data.secret, "secret")}
                  aria-label="Copy password"
                >
                  {copied === "secret" ? <Check className="text-green-600" /> : <Copy />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={hide}
                  aria-label="Hide password"
                >
                  <EyeOff />
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-7"
                onClick={reveal}
                disabled={isPending}
              >
                {isPending ? <Loader2 className="animate-spin" /> : <Eye />}
                Reveal
              </Button>
            )}
          </div>

          {revealed?.data.notes && (
            <div className="flex items-start gap-2">
              <dt className="w-20 shrink-0 text-xs text-muted-foreground">Notes</dt>
              <dd className="min-w-0 flex-1 whitespace-pre-wrap font-mono text-xs">
                {revealed.data.notes}
              </dd>
            </div>
          )}
        </dl>

        {revealed && (
          <div className="space-y-1">
            <Progress value={(remaining / REVEAL_TTL_MS) * 100} className="h-1" />
            <p className="text-xs text-muted-foreground">
              Hiding in {Math.ceil(remaining / 1000)}s. This reveal has been logged.
            </p>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {lastReveal
            ? `Last viewed by ${lastReveal.userName}, ${formatDistanceToNow(new Date(lastReveal.at))} ago`
            : "Never revealed"}
        </p>
      </CardContent>
    </Card>
  );
}
