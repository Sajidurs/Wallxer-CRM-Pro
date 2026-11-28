import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Role, UserStatus } from "@/lib/permissions";

import {
  hashApiKey,
  knownScopes,
  rejectionForKey,
  type BotScope,
} from "./auth";
import { clientForProfile, type Db } from "./impersonate";

export class McpAuthError extends Error {
  readonly status: 401 | 403;

  constructor(message: string, status: 401 | 403 = 401) {
    super(message);
    this.name = "McpAuthError";
    this.status = status;
  }
}

export interface BotProfile {
  id: string;
  workspace_id: string;
  email: string;
  full_name: string;
  role: Role;
  status: UserStatus;
  finance_access: boolean;
}

/**
 * What a tool is allowed to see. No raw key, no access token: those stay in
 * the lookup and in the Supabase client respectively.
 */
export interface McpContext {
  keyId: string;
  keyPrefix: string;
  scopes: BotScope[];
  profile: BotProfile;
  db: Db;
}

const contexts = new WeakMap<Request, McpContext>();

export function bindContext(request: Request, ctx: McpContext) {
  contexts.set(request, ctx);
}

export function contextFrom(request: Request | undefined): McpContext {
  if (!request) {
    throw new McpAuthError("This MCP request is not authenticated.");
  }
  const ctx = contexts.get(request);
  if (!ctx) throw new McpAuthError("This MCP request is not authenticated.");
  return ctx;
}

const touchedAt = new Map<string, number>();

async function touchLastUsed(keyId: string) {
  const now = Date.now();
  const previous = touchedAt.get(keyId) ?? 0;
  if (now - previous < 60_000) return;
  touchedAt.set(keyId, now);

  const { error } = await createAdminClient()
    .from("bot_api_keys")
    .update({ last_used_at: new Date(now).toISOString() })
    .eq("id", keyId);

  if (error) {
    touchedAt.delete(keyId);
    console.error("mcp last_used update failed", error.code);
  }
}

/**
 * Resolve a bearer token to the profile it acts as.
 *
 * The key table is not readable without already being an admin, and this
 * caller is not a user yet, so the lookup uses the service role. Everything
 * after that uses the profile's own client.
 */
export async function openContext(token: string): Promise<McpContext> {
  const admin = createAdminClient();
  const { data: key, error } = await admin
    .from("bot_api_keys")
    .select("id, workspace_id, profile_id, key_prefix, scopes, revoked_at")
    .eq("secret_hash", hashApiKey(token))
    .maybeSingle();

  if (error) {
    console.error("mcp key lookup failed", error.code);
    throw new McpAuthError("Could not check this API key.", 401);
  }

  if (!key) {
    throw new McpAuthError(rejectionForKey({
      found: false,
      revokedAt: null,
      profileStatus: null,
      workspaceMatch: false,
    }) ?? "Invalid API key.");
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, workspace_id, email, full_name, role, status, finance_access")
    .eq("id", key.profile_id)
    .maybeSingle();

  if (profileError) {
    console.error("mcp profile lookup failed", profileError.code);
    throw new McpAuthError("Could not check this API key.", 401);
  }

  const rejection = rejectionForKey({
    found: true,
    revokedAt: key.revoked_at,
    profileStatus: profile?.status ?? null,
    workspaceMatch: profile?.workspace_id === key.workspace_id,
  });
  if (rejection) {
    const status = key.revoked_at || profile?.status !== "active" ? 403 : 401;
    throw new McpAuthError(rejection, status);
  }

  if (!profile?.email) {
    throw new McpAuthError("The profile linked to this key has no email.", 403);
  }

  let db;
  try {
    db = await clientForProfile(profile.id, profile.email);
  } catch (error) {
    if (error instanceof McpAuthError) throw error;
    throw new McpAuthError("Could not act as the profile linked to this key.", 403);
  }
  await touchLastUsed(key.id);

  return {
    keyId: key.id,
    keyPrefix: key.key_prefix,
    scopes: knownScopes(key.scopes),
    profile,
    db,
  };
}
