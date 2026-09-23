import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";

export type UserRow = Pick<
  Tables<"profiles">,
  | "id"
  | "full_name"
  | "email"
  | "role"
  | "status"
  | "job_title"
  | "phone"
  | "avatar_url"
  | "last_seen_at"
  | "created_at"
  | "invited_at"
  | "must_change_password"
>;

const USER_COLUMNS =
  "id, full_name, email, role, status, job_title, phone, avatar_url, last_seen_at, created_at, invited_at, must_change_password";

/**
 * Everyone in the workspace. Read through the user-scoped client, so RLS
 * decides what comes back — this is not an admin-only query by construction,
 * it is admin-only because the route requires the role.
 */
export async function listUsers(): Promise<UserRow[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select(USER_COLUMNS)
    .order("status", { ascending: true })
    .order("full_name", { ascending: true });

  if (error) {
    throw new Error(`Could not load users: ${error.message}`);
  }

  return data ?? [];
}

export async function getUserById(id: string): Promise<UserRow | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select(USER_COLUMNS)
    .eq("id", id)
    .maybeSingle();

  return data ?? null;
}

/**
 * How many active super admins remain. The UI uses this to disable the actions
 * the database would reject anyway, so the user sees a greyed-out button with a
 * reason rather than an error toast after the fact.
 */
export async function countActiveSuperAdmins(): Promise<number> {
  const supabase = await createClient();

  const { count } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "super_admin")
    .eq("status", "active");

  return count ?? 0;
}
