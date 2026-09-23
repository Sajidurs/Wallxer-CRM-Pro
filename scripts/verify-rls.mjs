/**
 * Proves the security boundary actually holds, against the real database.
 *
 *   CHECK_EMAIL=you@example.com CHECK_PASSWORD=... npm run verify:rls
 *
 * RLS is the only thing standing between a valid user token and someone else's
 * data, and a policy that silently fails open looks exactly like one that
 * works. Run this after every migration that adds a table or changes a policy,
 * and extend it in the same commit as the migration.
 *
 * It signs in as a real user, so it needs that user's password. It cleans up
 * anything it creates.
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const email = process.env.CHECK_EMAIL;
const password = process.env.CHECK_PASSWORD;

if (!url || !anonKey) {
  console.error("Missing Supabase URL or anon key. Check .env.local.");
  process.exit(1);
}

if (!email || !password) {
  console.error(
    "Set CHECK_EMAIL and CHECK_PASSWORD to an active super admin, then re-run.",
  );
  process.exit(1);
}

const results = [];
function check(name, passed, detail) {
  results.push({ name, passed, detail });
}

// 1. Anonymous, no session at all.
const anon = createClient(url, anonKey, { auth: { persistSession: false } });

const anonBrands = await anon.from("brands").select("*");
check(
  "anon cannot read brands",
  (anonBrands.data?.length ?? 0) === 0,
  anonBrands.error ? anonBrands.error.message : `rows: ${anonBrands.data?.length}`,
);

const anonProfiles = await anon.from("profiles").select("*");
check(
  "anon cannot read profiles",
  (anonProfiles.data?.length ?? 0) === 0,
  anonProfiles.error ? anonProfiles.error.message : `rows: ${anonProfiles.data?.length}`,
);

// 2. Authenticated as the super admin.
const user = createClient(url, anonKey, { auth: { persistSession: false } });
const { data: signIn, error: signInError } = await user.auth.signInWithPassword({
  email,
  password,
});

check("super admin can sign in", !signInError && !!signIn?.user, signInError?.message ?? signIn.user.email);

if (signInError) {
  console.table(results);
  process.exit(1);
}

const userBrands = await user.from("brands").select("name");
check(
  "signed-in user reads all 5 brands",
  userBrands.data?.length === 5,
  userBrands.error?.message ?? `rows: ${userBrands.data?.length}`,
);

const userProfiles = await user.from("profiles").select("email,role");
check(
  "signed-in user reads workspace profiles",
  userProfiles.data?.length === 1,
  userProfiles.error?.message ?? `rows: ${userProfiles.data?.length}`,
);

const workspace = await user.from("workspaces").select("name,slug");
check(
  "signed-in user reads own workspace",
  workspace.data?.length === 1,
  workspace.error?.message ?? `rows: ${workspace.data?.length}`,
);

// 3. Helper functions answer correctly through the user's JWT.
const role = await user.rpc("auth_role");
check("auth_role() returns super_admin", role.data === "super_admin", role.error?.message ?? String(role.data));

const isAdmin = await user.rpc("is_admin");
check("is_admin() returns true", isAdmin.data === true, isAdmin.error?.message ?? String(isAdmin.data));

// 4. Privileged-column guard: the last super admin cannot demote themselves.
const demote = await user
  .from("profiles")
  .update({ role: "member" })
  .eq("id", signIn.user.id);
check(
  "last super admin cannot self-demote",
  !!demote.error,
  demote.error?.message ?? "NO ERROR — guard did not fire",
);

// 5. An ordinary column on your own profile still updates.
const rename = await user
  .from("profiles")
  .update({ job_title: "Founder" })
  .eq("id", signIn.user.id);
check("user can edit own non-privileged fields", !rename.error, rename.error?.message ?? "ok");

// 6. A member-level table write that RLS should allow for an admin.
const brandInsert = await user
  .from("brands")
  .insert({ workspace_id: (await user.from("workspaces").select("id")).data[0].id, name: "__rls_probe__" })
  .select();
check("admin can insert a brand", !brandInsert.error, brandInsert.error?.message ?? "ok");

if (!brandInsert.error) {
  await user.from("brands").delete().eq("name", "__rls_probe__");
}

console.log("");
for (const r of results) {
  console.log(`${r.passed ? "PASS" : "FAIL"}  ${r.name}\n        ${r.detail}`);
}
const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
