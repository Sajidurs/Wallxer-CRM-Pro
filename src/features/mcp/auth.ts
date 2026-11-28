import { createHash, randomBytes } from "node:crypto";

import type { Action, Resource } from "@/lib/permissions";
import { can, canAccessFinance } from "@/lib/permissions";
import type { Role, UserStatus } from "@/lib/permissions";

/**
 * Bearer-token rules for /api/mcp.
 *
 * Pure on purpose: the route and the tests both call these, and nothing here
 * touches the database or a secret store. The raw key is an argument, never a
 * return value, except `generateApiKey`, which is the one moment it exists.
 */

export const BOT_SCOPES = ["read", "write", "finance"] as const;
export type BotScope = (typeof BOT_SCOPES)[number];

export type ToolAccess =
  | { kind: "read" }
  | { kind: "write"; resource?: Resource; action?: Action }
  | { kind: "finance-read" }
  | { kind: "finance-write" };

export interface ScopeSubject {
  role: Role;
  status: UserStatus;
  finance_access?: boolean;
}

const KEY_PREFIX = "wxm_";

/** SHA-256 hex of the full bearer token. The database stores this, not the key. */
export function hashApiKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * A new key. `prefix` is what the settings page can show later; it is not
 * enough to authenticate. `hash` is what gets inserted.
 */
export function generateApiKey(): { token: string; hash: string; prefix: string } {
  const token = `${KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  return {
    token,
    hash: hashApiKey(token),
    prefix: token.slice(0, 12),
  };
}

export function parseBearer(
  header: string | null,
): { ok: true; token: string } | { ok: false; error: string } {
  if (!header || header.trim() === "") {
    return {
      ok: false,
      error: "Missing Authorization header. Send Authorization: Bearer <api key>.",
    };
  }

  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match?.[1]) {
    return { ok: false, error: "Authorization must be a single Bearer token." };
  }

  const token = match[1];
  if (!token.startsWith(KEY_PREFIX) || token.length < 20) {
    return { ok: false, error: "Invalid API key." };
  }

  return { ok: true, token };
}

export function isBotScope(value: string): value is BotScope {
  return (BOT_SCOPES as readonly string[]).includes(value);
}

/** Drops anything that is not a known scope, so a bad row fails closed. */
export function knownScopes(scopes: readonly string[]): BotScope[] {
  return scopes.filter(isBotScope);
}

/**
 * Why this key cannot be used, or null when it can.
 *
 * Unknown and revoked are different sentences on purpose: the holder of a
 * real key should learn that an admin turned it off. A wrong secret learns
 * only that it does not match.
 */
export function rejectionForKey(input: {
  found: boolean;
  revokedAt: string | null;
  profileStatus: UserStatus | null;
  workspaceMatch: boolean;
}): string | null {
  if (!input.found) return "Invalid API key.";
  if (input.revokedAt) return "This API key has been revoked.";
  if (input.profileStatus !== "active") {
    return "The profile linked to this key is not active.";
  }
  if (!input.workspaceMatch) return "Invalid API key.";
  return null;
}

/**
 * Scope and profile gate for one tool.
 *
 * `write` includes `read`, because a key that can change a record has to be
 * able to look at it. `finance` never includes either: money tools need the
 * finance scope and the linked profile's finance grant, both.
 */
export function scopeDenial(
  scopes: readonly string[],
  profile: ScopeSubject,
  access: ToolAccess,
): string | null {
  if (profile.status !== "active") {
    return "The profile linked to this key is not active.";
  }

  const granted = new Set(knownScopes(scopes));
  const canRead = granted.has("read") || granted.has("write");
  const canWrite = granted.has("write");

  if (access.kind === "finance-read" || access.kind === "finance-write") {
    if (!granted.has("finance")) return "This key does not have the finance scope.";
    if (!canAccessFinance(profile)) {
      return "The profile linked to this key does not have finance access.";
    }
  }

  if (access.kind === "read" || access.kind === "finance-read") {
    return canRead ? null : "This key does not have read access.";
  }

  if (!canWrite) return "This key does not have write access.";

  if (
    access.kind === "write" &&
    access.resource &&
    access.action &&
    !can(profile, access.action, access.resource)
  ) {
    return "The profile linked to this key cannot do that.";
  }

  return null;
}
