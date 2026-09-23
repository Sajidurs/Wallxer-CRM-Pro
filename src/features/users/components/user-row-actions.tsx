"use client";

import { KeyRound, MoreHorizontal, ShieldCheck, UserCheck, UserX } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Role } from "@/lib/permissions";

import { changeUserRole, resetUserPassword, setUserStatus } from "../actions";
import { ROLE_LABELS, USER_ROLES } from "../schema";
import type { UserRow } from "../queries";
import { TemporaryPasswordDialog } from "./temporary-password-dialog";

interface UserRowActionsProps {
  user: UserRow;
  actorId: string;
  actorRole: Role;
  /** Used to grey out actions the database would reject, with a reason. */
  activeSuperAdmins: number;
}

export function UserRowActions({
  user,
  actorId,
  actorRole,
  activeSuperAdmins,
}: UserRowActionsProps) {
  const [isPending, startTransition] = useTransition();
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(
    null,
  );

  const isSelf = user.id === actorId;
  const canChangeRole = actorRole === "super_admin";
  const isLastSuperAdmin =
    user.role === "super_admin" && user.status === "active" && activeSuperAdmins <= 1;

  // Only a super admin may take over another super admin's account.
  const canResetPassword =
    user.role !== "super_admin" || actorRole === "super_admin";

  function run(label: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        toast.success(label);
      } else {
        toast.error(result.error ?? "That did not work.");
      }
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
            aria-label={`Actions for ${user.full_name}`}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
            {user.email}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={!canChangeRole || isLastSuperAdmin}>
              <ShieldCheck />
              Change role
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={user.role}
                onValueChange={(role) => {
                  if (role === user.role) return;
                  run("Role updated.", () =>
                    changeUserRole({ userId: user.id, role }),
                  );
                }}
              >
                {USER_ROLES.map((role) => (
                  <DropdownMenuRadioItem key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuItem
            disabled={!canResetPassword}
            onSelect={() =>
              startTransition(async () => {
                const result = await resetUserPassword({ userId: user.id });
                if (result.ok) {
                  setIssued({
                    email: result.data.email,
                    password: result.data.temporaryPassword,
                  });
                } else {
                  toast.error(result.error);
                }
              })
            }
          >
            <KeyRound />
            Reset password
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {user.status === "suspended" ? (
            <DropdownMenuItem
              onSelect={() =>
                run("User reactivated.", () =>
                  setUserStatus({ userId: user.id, status: "active" }),
                )
              }
            >
              <UserCheck />
              Reactivate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              variant="destructive"
              disabled={isSelf || isLastSuperAdmin}
              onSelect={() =>
                run("User suspended.", () =>
                  setUserStatus({ userId: user.id, status: "suspended" }),
                )
              }
            >
              <UserX />
              Suspend
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {issued && (
        <TemporaryPasswordDialog
          open
          onClose={() => setIssued(null)}
          email={issued.email}
          password={issued.password}
          title="Password reset"
        />
      )}
    </>
  );
}
