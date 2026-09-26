import "server-only";

import { cache } from "react";

// Wrapped in `cache()`: a per-request memo. Several of these are read by a
// layout and again by the page inside it, and each call was its own round trip
// to Seoul. The first caller pays; the rest are free. Not a cross-request
// cache — every new request re-reads, so RLS and freshness are unaffected.

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
  | "finance_access"
>;

const USER_COLUMNS =
  "id, full_name, email, role, status, job_title, phone, avatar_url, last_seen_at, created_at, invited_at, must_change_password, finance_access";

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

export interface UserOption {
  id: string;
  name: string;
}

/**
 * Active teammates, for owner and assignee pickers.
 *
 * Suspended users are excluded: assigning work to an account that every policy
 * denies is a silent dead end. Existing records keep pointing at them, which is
 * the whole reason accounts are suspended rather than deleted.
 */
export const listAssignableUsers = cache(async (): Promise<UserOption[]>  =>{
  const supabase = await createClient();

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("status", "active")
    .order("full_name", { ascending: true });

  return (data ?? []).map((row) => ({ id: row.id, name: row.full_name }));
})

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
