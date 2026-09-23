/**
 * Creates the first super admin.
 *
 *   npm run bootstrap:admin -- --email you@example.com --name "Your Name"
 *
 * Password is read from ADMIN_PASSWORD, or generated and printed once.
 *
 * Run `supabase/seed.sql` first: handle_new_user needs a workspace to exist.
 * Safe to re-run — an existing user is promoted rather than duplicated.
 *
 * This is the one place outside a server action that uses the service role key.
 */

import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";

import { createClient } from "@supabase/supabase-js";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
  },
});

const email = values.email ?? process.env.ADMIN_EMAIL;
const fullName = values.name ?? process.env.ADMIN_NAME ?? "Super Admin";

if (!email) {
  console.error(
    'Missing email. Usage: npm run bootstrap:admin -- --email you@example.com --name "Your Name"',
  );
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Fill in .env.local.",
  );
  process.exit(1);
}

// base64url so the printed password survives a copy-paste out of any terminal.
const generatedPassword = randomBytes(18).toString("base64url");
const password = process.env.ADMIN_PASSWORD ?? generatedPassword;

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/** The Admin API has no get-by-email, so page through until we find them. */
async function findUserByEmail(target) {
  const needle = target.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === needle);
    if (match) return match;
    if (data.users.length < 200) return null;
  }
  return null;
}

const { count: workspaceCount, error: workspaceError } = await admin
  .from("workspaces")
  .select("id", { count: "exact", head: true });

if (workspaceError) {
  console.error("Could not read workspaces:", workspaceError.message);
  process.exit(1);
}

if (!workspaceCount) {
  console.error(
    "No workspace exists. Run supabase/seed.sql before creating the first admin.",
  );
  process.exit(1);
}

let user = await findUserByEmail(email);
let createdNow = false;

if (user) {
  console.log(`User ${email} already exists. Promoting.`);
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    // Confirmed on creation: this is the founding account, there is nobody to
    // send the invite to it.
    email_confirm: true,
    user_metadata: { full_name: fullName, role: "super_admin" },
  });
  if (error) {
    console.error("Could not create user:", error.message);
    process.exit(1);
  }
  user = data.user;
  createdNow = true;
}

// The trigger already made the profile. Make the role and status explicit
// rather than trusting metadata to have been read correctly.
const { error: profileError } = await admin
  .from("profiles")
  .update({ role: "super_admin", status: "active", full_name: fullName })
  .eq("id", user.id);

if (profileError) {
  console.error("Could not promote profile:", profileError.message);
  process.exit(1);
}

console.log(`\nSuper admin ready: ${email}`);
if (createdNow && !process.env.ADMIN_PASSWORD) {
  console.log(`Password (shown once, save it now): ${password}`);
}
console.log("Sign in at /login.\n");
