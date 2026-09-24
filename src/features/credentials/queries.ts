import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * Credential metadata only.
 *
 * SYSTEM_DESIGN 7.3, non-negotiable: "The secret is never included in a list
 * query." That is enforced twice over — this query names its columns, and the
 * database does not grant `authenticated` select on the ciphertext columns at
 * all, so asking for them fails rather than silently returning bytes.
 */
const LIST_COLUMNS =
  "id, project_id, contact_id, label, category, url, username, created_at, updated_at, created_by";

export interface CredentialListItem {
  id: string;
  project_id: string | null;
  contact_id: string | null;
  label: string;
  category: string;
  url: string | null;
  username: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface CredentialAccess {
  credential_id: string;
  user_id: string;
  action: string;
  created_at: string;
}

export async function listProjectCredentials(
  projectId: string,
): Promise<CredentialListItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("credentials")
    .select(LIST_COLUMNS)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("category", { ascending: true })
    .order("label", { ascending: true });

  if (error) throw new Error(`Could not load credentials: ${error.message}`);

  return (data ?? []) as CredentialListItem[];
}

/**
 * The most recent reveal per credential, for the "Last viewed by Rahim, 2 hours
 * ago" line the design asks for on the card. That line is what turns the log
 * from an archive nobody opens into visible accountability.
 */
export async function lastRevealsByCredential(
  credentialIds: string[],
): Promise<Map<string, CredentialAccess>> {
  if (credentialIds.length === 0) return new Map();

  const supabase = await createClient();

  const { data } = await supabase
    .from("credential_access_log")
    .select("credential_id, user_id, action, created_at")
    .in("credential_id", credentialIds)
    .eq("action", "reveal")
    .order("created_at", { ascending: false })
    .limit(500);

  const latest = new Map<string, CredentialAccess>();
  for (const row of data ?? []) {
    // Ordered newest first, so the first one seen per credential wins.
    if (!latest.has(row.credential_id)) latest.set(row.credential_id, row);
  }

  return latest;
}

/** Full history for one credential. */
export async function credentialHistory(
  credentialId: string,
): Promise<CredentialAccess[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("credential_access_log")
    .select("credential_id, user_id, action, created_at")
    .eq("credential_id", credentialId)
    .order("created_at", { ascending: false })
    .limit(100);

  return data ?? [];
}
