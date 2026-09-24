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
  // Deliberately `>= 1`, not `=== 1`. Asserting an exact count here couples the
  // security check to how many teammates happen to exist, so it starts failing
  // the moment someone is hired. What matters is that the read is permitted.
  "signed-in user reads workspace profiles",
  (userProfiles.data?.length ?? 0) >= 1,
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

// ---------------------------------------------------------------------------
// 7. A member account, created and torn down here.
// ---------------------------------------------------------------------------
// Everything above proves a super admin can act. These prove the restrictions
// actually restrict, which is the half that fails silently when a policy is
// wrong. Needs the service role to create the throwaway account.
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceKey) {
  console.log(
    "\nSkipping member-role checks: SUPABASE_SERVICE_ROLE_KEY is not set.\n",
  );
} else {
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const memberEmail = `rls-probe-${Date.now()}@my-boost.ca`;
  const memberPassword = `Probe!${Math.random().toString(36).slice(2)}Aa1`;
  let memberId = null;

  try {
    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email: memberEmail,
        password: memberPassword,
        email_confirm: true,
        user_metadata: { full_name: "RLS Probe", role: "member" },
      });

    if (createError) throw new Error(createError.message);
    memberId = created.user.id;

    // handle_new_user reads the role from metadata; make it explicit anyway.
    await admin
      .from("profiles")
      .update({ role: "member", status: "active", must_change_password: false })
      .eq("id", memberId);

    const member = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error: memberSignInError } = await member.auth.signInWithPassword({
      email: memberEmail,
      password: memberPassword,
    });
    check(
      "member can sign in",
      !memberSignInError,
      memberSignInError?.message ?? "ok",
    );

    const memberRole = await member.rpc("auth_role");
    check(
      "member auth_role() returns member",
      memberRole.data === "member",
      memberRole.error?.message ?? String(memberRole.data),
    );

    const memberIsAdmin = await member.rpc("is_admin");
    check(
      "member is_admin() returns false",
      memberIsAdmin.data === false,
      memberIsAdmin.error?.message ?? String(memberIsAdmin.data),
    );

    // The escalation that matters most: promoting yourself.
    const selfPromote = await member
      .from("profiles")
      .update({ role: "super_admin" })
      .eq("id", memberId);
    check(
      "member cannot promote themselves",
      !!selfPromote.error,
      selfPromote.error?.message ?? "NO ERROR — a member just became super admin",
    );

    // Attacking someone else's row.
    //
    // Assert the target is UNCHANGED, not that the statement errored. RLS
    // filters rows rather than raising, so a blocked write returns success with
    // zero rows affected. Checking for an error here would have reported a
    // failure while the database was behaving perfectly — and, worse, checking
    // only the error would pass just as happily if the write had succeeded.
    async function targetRow() {
      const { data } = await admin
        .from("profiles")
        .select("role, status")
        .eq("id", signIn.user.id)
        .single();
      return data;
    }

    const before = await targetRow();

    await member.from("profiles").update({ role: "member" }).eq("id", signIn.user.id);
    const afterRole = await targetRow();
    check(
      "member cannot change another user's role",
      afterRole.role === before.role && before.role === "super_admin",
      `target role still ${afterRole.role}`,
    );

    await member
      .from("profiles")
      .update({ status: "suspended" })
      .eq("id", signIn.user.id);
    const afterStatus = await targetRow();
    check(
      "member cannot suspend an admin",
      afterStatus.status === "active",
      `target status still ${afterStatus.status}`,
    );

    // must_change_password is server-set. A user clearing it would skip a
    // forced password change.
    const clearFlag = await member
      .from("profiles")
      .update({ must_change_password: true })
      .eq("id", memberId);
    check(
      "member cannot set must_change_password",
      !!clearFlag.error,
      clearFlag.error?.message ?? "NO ERROR — the flag is client-writable",
    );

    const memberBrandInsert = await member
      .from("brands")
      .insert({
        workspace_id: (await member.from("workspaces").select("id")).data[0].id,
        name: "__member_probe__",
      })
      .select();
    check(
      "member cannot create a brand",
      !!memberBrandInsert.error,
      memberBrandInsert.error?.message ?? "NO ERROR — members can edit settings",
    );

    // Reading colleagues is allowed, and the app depends on it.
    const memberReadsProfiles = await member.from("profiles").select("email");
    check(
      "member can read workspace profiles",
      (memberReadsProfiles.data?.length ?? 0) >= 2,
      memberReadsProfiles.error?.message ??
        `rows: ${memberReadsProfiles.data?.length}`,
    );

    // --- contacts --------------------------------------------------------
    const workspaceId = (await member.from("workspaces").select("id")).data[0].id;

    const memberContact = await member
      .from("contacts")
      .insert({
        workspace_id: workspaceId,
        type: "person",
        first_name: "RLS",
        last_name: "Probe",
        status: "lead",
      })
      .select("id")
      .single();
    check(
      "member can create a contact",
      !memberContact.error,
      memberContact.error?.message ?? "ok",
    );

    if (!memberContact.error) {
      const contactId = memberContact.data.id;

      const edit = await member
        .from("contacts")
        .update({ phone: "+880000000000" })
        .eq("id", contactId);
      check("member can edit a contact", !edit.error, edit.error?.message ?? "ok");

      // Soft delete is an UPDATE, so the policy alone cannot stop a member.
      // The trigger has to.
      const softDelete = await member
        .from("contacts")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", contactId);
      check(
        "member cannot soft-delete a contact",
        !!softDelete.error,
        softDelete.error?.message ?? "NO ERROR — members can delete clients",
      );

      // No DELETE policy exists at all, by design.
      const hardDelete = await member.from("contacts").delete().eq("id", contactId);
      const { data: stillThere } = await admin
        .from("contacts")
        .select("id")
        .eq("id", contactId)
        .maybeSingle();
      check(
        "hard delete is impossible for a member",
        !!stillThere,
        hardDelete.error?.message ?? "row survived",
      );

      // The super admin is a manager-or-above, so deletion must work for them.
      const adminDelete = await user
        .from("contacts")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", contactId);
      check(
        "manager or above can soft-delete a contact",
        !adminDelete.error,
        adminDelete.error?.message ?? "ok",
      );

      // A deleted contact must drop out of a member's view entirely.
      const memberSees = await member
        .from("contacts")
        .select("id")
        .eq("id", contactId);
      check(
        "member cannot see a deleted contact",
        (memberSees.data?.length ?? 0) === 0,
        `rows: ${memberSees.data?.length}`,
      );

      // A manager still can, which is what makes Undo and a trash view work.
      const adminSees = await user
        .from("contacts")
        .select("id")
        .eq("id", contactId);
      check(
        "manager can still see a deleted contact",
        (adminSees.data?.length ?? 0) === 1,
        `rows: ${adminSees.data?.length}`,
      );

      await admin.from("contacts").delete().eq("id", contactId);
    }

    // The name check constraint is what stops blank rows reaching the UI.
    const namelessContact = await member.from("contacts").insert({
      workspace_id: workspaceId,
      type: "person",
      status: "lead",
    });
    check(
      "a person with no name is rejected",
      !!namelessContact.error,
      namelessContact.error?.message ?? "NO ERROR — blank contacts are allowed",
    );

    // --- projects and credentials ----------------------------------------
    const { data: projectRow } = await admin
      .from("projects")
      .insert({
        workspace_id: workspaceId,
        name: `RLS Probe Project ${Date.now()}`,
        status: "active",
      })
      .select("id")
      .single();

    const projectId = projectRow.id;

    const memberProjectEdit = await member
      .from("projects")
      .update({ description: "member edit" })
      .eq("id", projectId);
    check(
      "member can edit a project",
      !memberProjectEdit.error,
      memberProjectEdit.error?.message ?? "ok",
    );

    const memberProjectDelete = await member
      .from("projects")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", projectId);
    check(
      "member cannot delete a project",
      !!memberProjectDelete.error,
      memberProjectDelete.error?.message ?? "NO ERROR — members can delete projects",
    );

    // The secret columns must not be selectable at all. RLS filters rows, not
    // columns, so this is enforced by column-level grants.
    const rawSecretRead = await member.from("credentials").select("secret_encrypted");
    check(
      "ciphertext column is not selectable",
      !!rawSecretRead.error,
      rawSecretRead.error?.message ?? "NO ERROR — the ciphertext is readable",
    );

    const keyRead = await member.rpc("credential_key");
    check(
      "credential_key() is not callable by a user",
      !!keyRead.error,
      keyRead.error?.message ?? "NO ERROR — the encryption key is reachable",
    );

    const memberCreateCred = await member.rpc("create_credential", {
      p_project_id: projectId,
      p_label: "Member attempt",
      p_category: "other",
      p_url: null,
      p_username: "u",
      p_secret: "s3cret",
      p_notes: null,
      p_contact_id: null,
    });
    check(
      "member cannot create a credential",
      !!memberCreateCred.error,
      memberCreateCred.error?.message ?? "NO ERROR — members can add credentials",
    );

    const SECRET = `probe-secret-${Date.now()}`;
    const createdCred = await user.rpc("create_credential", {
      p_project_id: projectId,
      p_label: "Probe cPanel",
      p_category: "hosting",
      p_url: "https://example.test",
      p_username: "probe-user",
      p_secret: SECRET,
      p_notes: "recovery-code-42",
      p_contact_id: null,
    });
    check(
      "manager can create a credential",
      !createdCred.error,
      createdCred.error?.message ?? "ok",
    );

    const credentialId = createdCred.data;

    if (credentialId) {
      // The point of the whole exercise: what is on disk is not the secret.
      const { data: storedRows } = await admin
        .from("credentials")
        .select("secret_encrypted, notes_encrypted")
        .eq("id", credentialId);
      const stored = JSON.stringify(storedRows?.[0] ?? {});
      check(
        "stored secret is ciphertext, not plaintext",
        !stored.includes(SECRET) && !stored.includes("recovery-code-42"),
        stored.slice(0, 60) + "...",
      );

      const beforeReveals = await admin
        .from("credential_access_log")
        .select("id", { count: "exact", head: true })
        .eq("credential_id", credentialId)
        .eq("action", "reveal");

      // A member may reveal: every active role can, by decision.
      const memberReveal = await member.rpc("reveal_credential", {
        p_credential_id: credentialId,
      });
      const revealedSecret = memberReveal.data?.[0]?.secret;
      check(
        "member can reveal, and gets the original secret back",
        revealedSecret === SECRET,
        memberReveal.error?.message ?? `got ${String(revealedSecret).slice(0, 12)}...`,
      );

      const afterReveals = await admin
        .from("credential_access_log")
        .select("id", { count: "exact", head: true })
        .eq("credential_id", credentialId)
        .eq("action", "reveal");

      check(
        "revealing writes exactly one access-log row",
        (afterReveals.count ?? 0) === (beforeReveals.count ?? 0) + 1,
        `${beforeReveals.count} -> ${afterReveals.count}`,
      );

      // The log is an audit trail. Nobody edits or deletes it, admins included.
      const logDelete = await user
        .from("credential_access_log")
        .delete()
        .eq("credential_id", credentialId);
      const { count: logStill } = await admin
        .from("credential_access_log")
        .select("id", { count: "exact", head: true })
        .eq("credential_id", credentialId);
      check(
        "the access log cannot be erased",
        (logStill ?? 0) > 0,
        logDelete.error?.message ?? `${logStill} rows survived`,
      );

      // A direct insert would skip both encryption and the log, so there is no
      // INSERT policy on the table at all.
      const directInsert = await member.from("credentials").insert({
        workspace_id: workspaceId,
        project_id: projectId,
        label: "Direct insert",
        secret_encrypted: "not-really-encrypted",
      });
      check(
        "credentials cannot be inserted directly",
        !!directInsert.error,
        directInsert.error?.message ?? "NO ERROR — encryption is bypassable",
      );

      await admin.from("credentials").delete().eq("id", credentialId);
    }

    await admin.from("projects").delete().eq("id", projectId);

    // Suspension must deny immediately, without deleting anything.
    await admin.from("profiles").update({ status: "suspended" }).eq("id", memberId);

    const suspended = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await suspended.auth.signInWithPassword({
      email: memberEmail,
      password: memberPassword,
    });
    const suspendedRead = await suspended.from("brands").select("name");
    check(
      "suspended user reads nothing",
      (suspendedRead.data?.length ?? 0) === 0,
      suspendedRead.error?.message ?? `rows: ${suspendedRead.data?.length}`,
    );

    const suspendedWorkspace = await suspended.rpc("auth_workspace_id");
    check(
      "suspended user has no workspace",
      suspendedWorkspace.data === null,
      suspendedWorkspace.error?.message ?? String(suspendedWorkspace.data),
    );
  } finally {
    if (memberId) {
      await admin.from("brands").delete().eq("name", "__member_probe__");
      await admin.auth.admin.deleteUser(memberId);
    }
  }
}

console.log("");
for (const r of results) {
  console.log(`${r.passed ? "PASS" : "FAIL"}  ${r.name}\n        ${r.detail}`);
}
const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
