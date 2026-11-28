import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BotKeysPanel } from "@/features/bots/components/bot-keys-panel";
import { listBotKeys, type BotKeyRow } from "@/features/bots/queries";
import { listUsers } from "@/features/users/queries";
import { requireRole } from "@/lib/auth";
import { canAccessFinance } from "@/lib/permissions";

export const metadata: Metadata = { title: "API keys" };

export default async function BotKeysPage() {
  await requireRole("admin");

  // The keys table does not exist until 0027 is applied. A missing relation
  // should say so here, not take the settings section down.
  const [keysResult, users] = await Promise.all([
    listBotKeys()
      .then((rows) => ({ keys: rows, error: null as string | null }))
      .catch((error: unknown) => ({
        keys: [] as BotKeyRow[],
        error: error instanceof Error ? error.message : "Could not load API keys.",
      })),
    listUsers(),
  ]);
  const { keys, error: loadError } = keysResult;
  const profiles = users
    .filter((user) => user.status === "active")
    .map((user) => ({
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      finance_access: canAccessFinance(user),
    }));

  return (
    <>
      <PageHeader
        title="API keys"
        description="Keys for an assistant to read and update the CRM over MCP, as one of these people. Apply migration 0027 before creating the first key."
      />
      {loadError && (
        <Alert>
          <AlertDescription>
            API keys are not available yet. Apply supabase/migrations/0027_bot_api_keys.sql,
            then reload this page. {loadError}
          </AlertDescription>
        </Alert>
      )}
      <BotKeysPanel keys={keys} profiles={profiles} />
    </>
  );
}
