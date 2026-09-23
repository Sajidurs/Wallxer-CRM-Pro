import "server-only";

import { redirect } from "next/navigation";

import type { Role } from "@/lib/permissions";
import { atLeast } from "@/lib/permissions";
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
 */
export async function getCurrentUser(): Promise<Profile | null> {
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
}

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

  await touchLastSeen();

  return profile;
}

/**
 * Records that the user is still around, throttled to one write per five
 * minutes inside the database function so this costs nothing on a page load
 * that already happened recently.
 *
 * Never allowed to break a page render: a failed heartbeat is not worth an
 * error screen.
 */
async function touchLastSeen(): Promise<void> {
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
