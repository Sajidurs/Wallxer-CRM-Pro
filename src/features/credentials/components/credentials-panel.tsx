"use client";

import { KeyRound, Plus } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";

import type { CredentialListItem } from "../queries";
import { CredentialCard } from "./credential-card";
import { CredentialDialog } from "./credential-dialog";

interface CredentialsPanelProps {
  projectId: string;
  credentials: CredentialListItem[];
  /** credentialId -> who revealed it last and when. */
  lastReveals: Record<string, { userName: string; at: string }>;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export function CredentialsPanel({
  projectId,
  credentials,
  lastReveals,
  canCreate,
  canEdit,
  canDelete,
}: CredentialsPanelProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CredentialListItem | null>(null);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(credential: CredentialListItem) {
    setEditing(credential);
    setDialogOpen(true);
  }

  return (
    <div className="space-y-4">
      {credentials.length > 0 && canCreate && (
        <div className="flex justify-end">
          <Button size="sm" onClick={openCreate}>
            <Plus />
            Add credential
          </Button>
        </div>
      )}

      {credentials.length === 0 ? (
        <EmptyState
          icon={KeyRound}
          title="No credentials yet"
          description="Store the logins this project needs. Passwords are encrypted, the whole team can reveal them, and every reveal is recorded."
          action={
            canCreate && (
              <Button onClick={openCreate}>
                <Plus />
                Add credential
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {credentials.map((credential) => (
            <CredentialCard
              key={credential.id}
              credential={credential}
              lastReveal={lastReveals[credential.id] ?? null}
              canEdit={canEdit}
              canDelete={canDelete}
              onEdit={openEdit}
            />
          ))}
        </div>
      )}

      <CredentialDialog
        projectId={projectId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
      />
    </div>
  );
}
