import { formatDistanceToNow } from "date-fns";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { atLeast, type Role } from "@/lib/permissions";

import { FinanceAccessToggle } from "@/features/finance/components/finance-access-toggle";

import type { UserRow } from "../queries";
import { ROLE_LABELS, STATUS_LABELS } from "../schema";
import { UserRowActions } from "./user-row-actions";

interface UsersTableProps {
  users: UserRow[];
  actorId: string;
  actorRole: Role;
  activeSuperAdmins: number;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "secondary",
  invited: "outline",
  suspended: "destructive",
};

function lastSeenLabel(user: UserRow) {
  if (user.status === "suspended") return "Suspended";
  if (!user.last_seen_at) return "Never signed in";
  return `${formatDistanceToNow(new Date(user.last_seen_at))} ago`;
}

export function UsersTable({
  users,
  actorId,
  actorRole,
  activeSuperAdmins,
}: UsersTableProps) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="hidden sm:table-cell">Role</TableHead>
            <TableHead className="hidden md:table-cell">Status</TableHead>
            <TableHead className="hidden lg:table-cell">Last seen</TableHead>
            <TableHead className="hidden sm:table-cell">Finance</TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id} data-suspended={user.status === "suspended"}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar className="size-8">
                    {user.avatar_url && <AvatarImage src={user.avatar_url} alt="" />}
                    <AvatarFallback className="text-xs">
                      {initials(user.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{user.full_name}</span>
                      {user.id === actorId && (
                        <span className="text-xs text-muted-foreground">You</span>
                      )}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {user.email}
                      {user.job_title ? ` · ${user.job_title}` : ""}
                    </div>
                  </div>
                </div>
              </TableCell>

              <TableCell className="hidden sm:table-cell">
                {ROLE_LABELS[user.role]}
              </TableCell>

              <TableCell className="hidden md:table-cell">
                <div className="flex flex-col items-start gap-1">
                  <Badge variant={STATUS_VARIANT[user.status] ?? "outline"}>
                    {STATUS_LABELS[user.status] ?? user.status}
                  </Badge>
                  {user.must_change_password && user.status === "active" && (
                    <span className="text-xs text-muted-foreground">
                      Must set a password
                    </span>
                  )}
                </div>
              </TableCell>

              <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                {lastSeenLabel(user)}
              </TableCell>

              {/* The grant that lets one manager into Finance without making
                  them an admin. Only an admin sees a working switch; the
                  database refuses the write from anyone else regardless. */}
              <TableCell className="hidden sm:table-cell">
                <FinanceAccessToggle
                  userId={user.id}
                  name={user.full_name}
                  granted={user.finance_access}
                  implicit={atLeast(user.role, "admin")}
                  disabled={
                    !atLeast(actorRole, "admin") || user.status === "suspended"
                  }
                />
              </TableCell>

              <TableCell>
                <UserRowActions
                  user={user}
                  actorId={actorId}
                  actorRole={actorRole}
                  activeSuperAdmins={activeSuperAdmins}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
