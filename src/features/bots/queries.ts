import "server-only";

import { createClient } from "@/lib/supabase/server";

const KEY_COLUMNS =
  "id, name, key_prefix, scopes, profile_id, created_at, last_used_at, revoked_at, created_by";

export interface BotKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  profile_id: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  created_by: string | null;
}

/** Active and revoked keys. The hash column is not selected and not granted. */
export async function listBotKeys(): Promise<BotKeyRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bot_api_keys")
    .select(KEY_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Could not load API keys: ${error.message}`);
  return (data ?? []) as BotKeyRow[];
}
