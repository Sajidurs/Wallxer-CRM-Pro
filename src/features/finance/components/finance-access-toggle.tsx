"use client";

import { Check, Minus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import { setFinanceAccess } from "../actions";

interface FinanceAccessToggleProps {
  userId: string;
  name: string;
  granted: boolean;
  /** Admins hold the module by role, so there is nothing to grant them. */
  implicit: boolean;
  disabled: boolean;
}

/**
 * The switch that makes "I can give this to someone later" true without a
 * deploy.
 *
 * Admins show as implicitly granted and cannot be toggled — revoking a flag
 * that their role grants anyway would be a lie. The database refuses this write
 * from anyone who is not an admin, which is what actually enforces it.
 */
export function FinanceAccessToggle({
  userId,
  name,
  granted,
  implicit,
  disabled,
}: FinanceAccessToggleProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(granted);

  if (implicit) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check className="size-3.5" />
        By role
      </span>
    );
  }

  function toggle() {
    const next = !optimistic;
    startTransition(async () => {
      setOptimistic(next);
      const result = await setFinanceAccess({ id: userId, granted: next });

      if (!result.ok) {
        toast.error(result.error);
        return;
      }

      toast.success(
        next ? `${name} can now open Finance.` : `${name} no longer sees Finance.`,
      );
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={optimistic}
      aria-label={`Finance access for ${name}`}
      disabled={disabled || isPending}
      onClick={toggle}
      className={cn(
        "inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors",
        optimistic
          ? "border-transparent bg-primary"
          : "border-border bg-muted",
        (disabled || isPending) && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        className={cn(
          "flex size-4 items-center justify-center rounded-full bg-background shadow-xs transition-transform",
          optimistic ? "translate-x-[18px]" : "translate-x-[2px]",
        )}
      >
        {optimistic ? (
          <Check className="size-2.5 text-primary" />
        ) : (
          <Minus className="size-2.5 text-muted-foreground" />
        )}
      </span>
    </button>
  );
}
