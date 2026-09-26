import "server-only";

import { notFound, redirect } from "next/navigation";
import { cache } from "react";

import type { Role } from "@/lib/permissions";
import { atLeast, canAccessFinance } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";

export type Profile = Tables<"profiles">;

/**
 * The logged-in user's profile, or null.
 *
 * `auth.getUser()` validates the JWT against the auth server rather than
 * trusting the cookie, which is why this is not simply read from the session.
 *
 * The profile read goes through the user-scoped client, so it is subject to RLS
 * — a suspended user gets null here for the same reason they get null from
 * auth_workspace_id(), and every caller below then sends them to /login.
 *
 * **Wrapped in `cache()`**, which deduplicates it for the lifetime of one
 * request. The (app) layout calls `requireUser()` and so does every page inside
 * it, and each call was making its own round trip to the auth server and its
 * own profile query — two of each, on every single page load, to the database
 * in Seoul. Now the first call pays and the rest are free.
 *
 * This is a per-request memo, not a cache across requests: a suspended user is
 * still denied on their very next navigation.
 */
export const getCurrentUser = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return profile ?? null;
});

/**
 * For any page inside the (app) group. Returns the profile or redirects.
 *
 * The proxy already bounced anonymous requests; this catches the cases it
 * cannot see — a valid session whose profile was suspended, or deleted out
 * from under it.
 */
export async function requireUser(): Promise<Profile> {
  const profile = await getCurrentUser();

  if (!profile || profile.status !== "active") {
    redirect("/login");
  }

  // An account created with a handed-over password, or one an admin has just
  // reset, cannot go anywhere else until that password is replaced. Checking it
  // here covers every page in the (app) group at once.
  if (profile.must_change_password) {
    redirect("/set-password");
  }

  await touchLastSeen(profile);

  return profile;
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/**
 * Records that the user is still around.
 *
 * The database function throttles the write to once per five minutes, but the
 * RPC was still a network round trip on every page load — to Seoul, before the
 * page could render. The profile we already hold says when it last happened, so
 * the call is skipped entirely unless it would actually write something.
 *
 * Never allowed to break a page render: a failed heartbeat is not worth an
 * error screen.
 */
async function touchLastSeen(profile: Profile): Promise<void> {
  const lastSeen = profile.last_seen_at ? Date.parse(profile.last_seen_at) : 0;

  if (Date.now() - lastSeen < FIVE_MINUTES_MS) return;

  try {
    const supabase = await createClient();
    await supabase.rpc("touch_last_seen");
  } catch {
    // Intentionally swallowed.
  }
}

/** For pages only some roles may open, such as Settings. */
export async function requireRole(minimum: Role): Promise<Profile> {
  const profile = await requireUser();

  if (!atLeast(profile.role, minimum)) {
    redirect("/dashboard");
  }

  return profile;
}

/**
 * For the Finance module, which is a grant rather than a rank.
 *
 * 404 rather than a redirect to the dashboard: someone without the grant should
 * not learn that the module exists from the way they are turned away. RLS would
 * return them an empty ledger regardless; this stops the page rendering at all.
 */
export async function requireFinanceAccess(): Promise<Profile> {
  const profile = await requireUser();

  if (!canAccessFinance(profile)) {
    notFound();
  }

  return profile;
}
