import "server-only";

import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database.types";

import { redactString } from "./redact";

export type Db = SupabaseClient<Database>;

/**
 * A user-scoped client for the profile a bot key is linked to.
 *
 * Supabase Auth mints the JWT (`generateLink` does not send email). PostgREST
 * then sees that profile as `auth.uid()`, which is what RLS, finance RPCs,
 * and the stage-history trigger already trust. The access token stays in
 * this process's memory and is never logged or returned.
 *
 * One session is created per cold start of this process, then reused until
 * the token is close to expiry. A dedicated profile for the bot keeps those
 * sessions off a person's day-to-day login list.
 */

const REFRESH_SKEW_MS = 60_000;

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

const cache = new Map<string, CachedToken>();
const inflight = new Map<string, Promise<string>>();

function expiryMs(token: string): number {
  try {
    const part = token.split(".")[1];
    if (!part) return Date.now() + 10 * 60 * 1000;
    const payload = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as {
      exp?: unknown;
    };
    if (typeof payload.exp !== "number") return Date.now() + 10 * 60 * 1000;
    return payload.exp * 1000;
  } catch {
    return Date.now() + 10 * 60 * 1000;
  }
}

async function mint(profileId: string, email: string): Promise<string> {
  const admin = createAdminClient();
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    throw new Error("Could not open a session for the linked profile.");
  }

  // A separate client: the admin client is the service role, and verifyOtp
  // has to run as the anon key so the session it returns is the user's.
  const anon = createSupabaseClient<Database>(
    publicEnv.supabaseUrl(),
    publicEnv.supabaseAnonKey(),
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );

  const { data: verified, error: verifyError } = await anon.auth.verifyOtp({
    type: "magiclink",
    token_hash: tokenHash,
  });

  const accessToken = verified.session?.access_token;
  if (verifyError || !accessToken) {
    throw new Error("Could not open a session for the linked profile.");
  }

  cache.set(profileId, { accessToken, expiresAtMs: expiryMs(accessToken) });
  return accessToken;
}

export async function accessTokenForProfile(profileId: string, email: string): Promise<string> {
  const hit = cache.get(profileId);
  if (hit && hit.expiresAtMs - Date.now() > REFRESH_SKEW_MS) return hit.accessToken;

  const pending = inflight.get(profileId);
  if (pending) return pending;

  const job = mint(profileId, email).finally(() => {
    inflight.delete(profileId);
  });
  inflight.set(profileId, job);
  return job;
}

export async function clientForProfile(profileId: string, email: string): Promise<Db> {
  let accessToken: string;
  try {
    accessToken = await accessTokenForProfile(profileId, email);
  } catch (error) {
    const message = error instanceof Error ? error.message : "impersonation failed";
    console.error("mcp impersonation failed", redactString(message));
    throw new Error("Could not act as the profile linked to this key.");
  }

  return createSupabaseClient<Database>(publicEnv.supabaseUrl(), publicEnv.supabaseAnonKey(), {
    accessToken: async () => accessToken,
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
