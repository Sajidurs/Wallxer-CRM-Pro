import { Info } from "lucide-react";
import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InviteUserDialog } from "@/features/users/components/invite-user-dialog";
import { UsersTable } from "@/features/users/components/users-table";
import { countActiveSuperAdmins, listUsers } from "@/features/users/queries";
import { requireRole } from "@/lib/auth";
import { serverEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  // Admin and above. `requireRole` redirects rather than rendering an empty
  // page, and RLS would return nothing useful to anyone else anyway.
  const actor = await requireRole("admin");

  const [users, activeSuperAdmins] = await Promise.all([
    listUsers(),
    countActiveSuperAdmins(),
  ]);

  const emailAvailable = serverEnv.emailEnabled();

  return (
    <>
      <PageHeader
        title="Users"
        description="Everyone with access to this workspace. Accounts are never deleted, only suspended."
        actions={
          <InviteUserDialog
            actorRole={actor.role}
            emailAvailable={emailAvailable}
          />
        }
      />

      {!emailAvailable && (
        <Alert>
          <Info />
          <AlertDescription>
            Email invites are not configured. Supabase&apos;s built-in mailer
            allows 2 messages per hour and may not reach addresses outside your
            Supabase organisation. Until custom SMTP is set up, add people with a
            temporary password and pass it to them directly.
          </AlertDescription>
        </Alert>
      )}

      {actor.role !== "super_admin" && (
        <Alert>
          <Info />
          <AlertDescription>
            Only a super admin can change roles. You can add users, suspend them,
            and reset passwords.
          </AlertDescription>
        </Alert>
      )}

      <UsersTable
        users={users}
        actorId={actor.id}
        actorRole={actor.role}
        activeSuperAdmins={activeSuperAdmins}
      />
    </>
  );
}
