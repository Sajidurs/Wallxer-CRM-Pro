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

    // The positive path, for the same reason as attachments: only checking who
    // is *refused* a soft delete leaves the case where nobody can perform one.
    const managerProjectDelete = await user
      .from("projects")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", projectId);
    check(
      "manager or above can soft-delete a project",
      !managerProjectDelete.error,
      managerProjectDelete.error?.message ?? "ok",
    );

    const restoreProject = await user
      .from("projects")
      .update({ deleted_at: null })
      .eq("id", projectId);
    check(
      "a soft-deleted project can be restored",
      !restoreProject.error,
      restoreProject.error?.message ?? "ok",
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

    // --- attachments and storage -----------------------------------------
    const otherWorkspaceId = "00000000-0000-0000-0000-0000000000ff";

    // The storage policy matches on the first path segment being the caller's
    // workspace. This is what stops a valid user reading another workspace's
    // files by guessing an object name.
    const foreignUpload = await member.storage
      .from("project-files")
      .upload(
        `${otherWorkspaceId}/project/${projectId}/probe.txt`,
        new Blob(["nope"], { type: "text/plain" }),
      );
    check(
      "cannot upload outside your own workspace prefix",
      !!foreignUpload.error,
      foreignUpload.error?.message ?? "NO ERROR — workspace isolation is broken",
    );

    const ownPath = `${workspaceId}/project/${projectId}/probe-${Date.now()}.txt`;
    const ownUpload = await member.storage
      .from("project-files")
      .upload(ownPath, new Blob(["hello"], { type: "text/plain" }));
    check(
      "can upload inside your own workspace prefix",
      !ownUpload.error,
      ownUpload.error?.message ?? "ok",
    );

    if (!ownUpload.error) {
      const attachmentInsert = await member
        .from("attachments")
        .insert({
          workspace_id: workspaceId,
          entity_type: "project",
          entity_id: projectId,
          bucket: "project-files",
          storage_path: ownPath,
          file_name: "probe.txt",
          mime_type: "text/plain",
          size_bytes: 5,
          created_by: memberId,
        })
        .select("id")
        .single();
      check(
        "member can record an attachment",
        !attachmentInsert.error,
        attachmentInsert.error?.message ?? "ok",
      );

      const forgedAuthor = await member.from("attachments").insert({
        workspace_id: workspaceId,
        entity_type: "project",
        entity_id: projectId,
        bucket: "project-files",
        storage_path: ownPath + ".forged",
        file_name: "forged.txt",
        created_by: signIn.user.id,
      });
      check(
        "cannot claim someone else uploaded a file",
        !!forgedAuthor.error,
        forgedAuthor.error?.message ?? "NO ERROR — authorship is forgeable",
      );

      if (!attachmentInsert.error) {
        const attachmentId = attachmentInsert.data.id;

        const rewriteAuthor = await member
          .from("attachments")
          .update({ created_by: signIn.user.id })
          .eq("id", attachmentId);
        check(
          "uploader cannot be rewritten after the fact",
          !!rewriteAuthor.error,
          rewriteAuthor.error?.message ?? "NO ERROR — authorship is transferable",
        );

        // An attachment must not be repointed at a different object: that would
        // let someone swap a file's contents while keeping its name and history.
        const repoint = await member
          .from("attachments")
          .update({ storage_path: `${workspaceId}/project/${projectId}/other.txt` })
          .eq("id", attachmentId);
        check(
          "an attachment cannot be repointed at another file",
          !!repoint.error,
          repoint.error?.message ?? "NO ERROR — file contents are swappable",
        );

        // The delete path, which shipped broken and was found by a user
        // rather than by this file.
        //
        // PostgreSQL requires the row an UPDATE produces to still satisfy the
        // SELECT policy. A soft delete sets deleted_at, so a SELECT policy that
        // ends in `deleted_at is null` makes the new row invisible to itself
        // and rejects the write. Every soft-deletable table needs a check that
        // actually performs the delete, not just one that checks who may.
        const softDelete = await member
          .from("attachments")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", attachmentId);
        check(
          "the uploader can soft-delete their own attachment",
          !softDelete.error,
          softDelete.error?.message ?? "ok",
        );

        const { data: afterDelete } = await admin
          .from("attachments")
          .select("deleted_at")
          .eq("id", attachmentId)
          .single();
        check(
          "the attachment is actually marked deleted",
          afterDelete?.deleted_at !== null,
          String(afterDelete?.deleted_at),
        );

        // Put it back so the checks below still have a live row.
        await admin
          .from("attachments")
          .update({ deleted_at: null })
          .eq("id", attachmentId);

        // Anonymous access must be refused even with the exact object path.
        const anonDownload = await anon.storage
          .from("project-files")
          .download(ownPath);
        check(
          "anon cannot download a stored file",
          !!anonDownload.error,
          anonDownload.error?.message ?? "NO ERROR — files are public",
        );

        // A signed URL is the only way in, and it expires.
        const signed = await member.storage
          .from("project-files")
          .createSignedUrl(ownPath, 60);
        check(
          "a signed URL can be issued",
          !signed.error && !!signed.data?.signedUrl,
          signed.error?.message ?? "ok",
        );

        await admin.from("attachments").delete().eq("id", attachmentId);
      }

      await admin.storage.from("project-files").remove([ownPath]);
    }

    // --- tasks -------------------------------------------------------------
    // Section 4 says a member may edit only tasks assigned to them. Until
    // 0011 that rule lived solely in lib/permissions.ts, which decides whether
    // to render a button and stops nothing. These checks are the difference.

    const { data: unassignedTask } = await admin
      .from("tasks")
      .insert({
        workspace_id: workspaceId,
        title: `RLS probe: not yours ${Date.now()}`,
        status: "todo",
        priority: "medium",
      })
      .select("id")
      .single();

    const { data: assignedTask } = await admin
      .from("tasks")
      .insert({
        workspace_id: workspaceId,
        title: `RLS probe: yours ${Date.now()}`,
        status: "todo",
        priority: "medium",
      })
      .select("id")
      .single();

    await admin.from("task_assignees").insert({
      task_id: assignedTask.id,
      user_id: memberId,
      workspace_id: workspaceId,
    });

    const editNotMine = await member
      .from("tasks")
      .update({ title: "hijacked" })
      .eq("id", unassignedTask.id);
    check(
      "member cannot edit a task that is not theirs",
      !!editNotMine.error,
      editNotMine.error?.message ?? "NO ERROR — members can edit anything",
    );

    const editMine = await member
      .from("tasks")
      .update({ status: "in_progress" })
      .eq("id", assignedTask.id);
    check(
      "member can edit a task assigned to them",
      !editMine.error,
      editMine.error?.message ?? "ok",
    );

    // The escalation this design has to refuse: assigning yourself someone
    // else's task would otherwise be a one-step route to editing everything.
    const selfAssign = await member.from("task_assignees").insert({
      task_id: unassignedTask.id,
      user_id: memberId,
      workspace_id: workspaceId,
    });
    check(
      "member cannot assign themselves another task",
      !!selfAssign.error,
      selfAssign.error?.message ?? "NO ERROR — edit rights are self-grantable",
    );

    const memberDeleteTask = await member
      .from("tasks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", assignedTask.id);
    check(
      "member cannot delete even their own task",
      !!memberDeleteTask.error,
      memberDeleteTask.error?.message ?? "NO ERROR — members can delete tasks",
    );

    // Positive soft-delete path, the check whose absence hid the attachment bug.
    const managerDeleteTask = await user
      .from("tasks")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", assignedTask.id);
    check(
      "manager can soft-delete a task",
      !managerDeleteTask.error,
      managerDeleteTask.error?.message ?? "ok",
    );

    const { data: deletedTask } = await admin
      .from("tasks")
      .select("deleted_at")
      .eq("id", assignedTask.id)
      .single();
    check(
      "the task is actually marked deleted",
      deletedTask?.deleted_at !== null,
      String(deletedTask?.deleted_at),
    );

    // completed_at is maintained by the database, not the app.
    await admin.from("tasks").update({ deleted_at: null }).eq("id", assignedTask.id);
    await user.from("tasks").update({ status: "done" }).eq("id", assignedTask.id);
    const { data: doneTask } = await admin
      .from("tasks")
      .select("completed_at")
      .eq("id", assignedTask.id)
      .single();
    check(
      "completing a task stamps completed_at",
      doneTask?.completed_at !== null,
      String(doneTask?.completed_at),
    );

    await user.from("tasks").update({ status: "todo" }).eq("id", assignedTask.id);
    const { data: reopened } = await admin
      .from("tasks")
      .select("completed_at")
      .eq("id", assignedTask.id)
      .single();
    check(
      "reopening a task clears completed_at",
      reopened?.completed_at === null,
      String(reopened?.completed_at),
    );

    // --- task checklists (0018) --------------------------------------------
    // A checklist inherits its task's edit rule through can_edit_task. The
    // interesting case is the member who is NOT assigned: reading is allowed
    // (the progress bar has to be explainable), writing is not.

    const checklistOnMine = await member
      .from("task_checklist_items")
      .insert({
        workspace_id: workspaceId,
        task_id: assignedTask.id,
        title: "__probe_mine__",
      })
      .select("id")
      .single();
    check(
      "member can add a subtask to their own task",
      !checklistOnMine.error && !!checklistOnMine.data,
      checklistOnMine.error?.message ?? "inserted",
    );

    const checklistOnOthers = await member
      .from("task_checklist_items")
      .insert({
        workspace_id: workspaceId,
        task_id: unassignedTask.id,
        title: "__probe_theirs__",
      })
      .select("id");
    check(
      "member cannot add a subtask to someone else's task",
      !!checklistOnOthers.error,
      checklistOnOthers.error?.message ?? "NO ERROR — members can edit any checklist",
    );

    // Planted by the admin so the member has something they may not touch.
    const { data: foreignItem } = await admin
      .from("task_checklist_items")
      .insert({
        workspace_id: workspaceId,
        task_id: unassignedTask.id,
        title: "__probe_foreign__",
      })
      .select("id")
      .single();

    const foreignToggle = await member
      .from("task_checklist_items")
      .update({ is_done: true })
      .eq("id", foreignItem.id)
      .select("id");
    check(
      "member cannot tick a subtask on someone else's task",
      (foreignToggle.data?.length ?? 0) === 0,
      foreignToggle.error?.message ?? `rows affected: ${foreignToggle.data?.length}`,
    );

    const foreignDelete = await member
      .from("task_checklist_items")
      .delete()
      .eq("id", foreignItem.id)
      .select("id");
    check(
      "member cannot delete a subtask on someone else's task",
      (foreignDelete.data?.length ?? 0) === 0,
      foreignDelete.error?.message ?? `rows affected: ${foreignDelete.data?.length}`,
    );

    const foreignRead = await member
      .from("task_checklist_items")
      .select("id")
      .eq("id", foreignItem.id);
    check(
      "member can still read that subtask",
      (foreignRead.data?.length ?? 0) === 1,
      foreignRead.error?.message ?? `rows: ${foreignRead.data?.length}`,
    );

    // completed_at is stamped by the database, exactly as on tasks.
    await member
      .from("task_checklist_items")
      .update({ is_done: true })
      .eq("id", checklistOnMine.data.id);
    const { data: tickedItem } = await admin
      .from("task_checklist_items")
      .select("completed_at")
      .eq("id", checklistOnMine.data.id)
      .single();
    check(
      "ticking a subtask stamps completed_at",
      tickedItem?.completed_at !== null,
      String(tickedItem?.completed_at),
    );

    await member
      .from("task_checklist_items")
      .update({ is_done: false })
      .eq("id", checklistOnMine.data.id);
    const { data: untickedItem } = await admin
      .from("task_checklist_items")
      .select("completed_at")
      .eq("id", checklistOnMine.data.id)
      .single();
    check(
      "unticking a subtask clears completed_at",
      untickedItem?.completed_at === null,
      String(untickedItem?.completed_at),
    );

    const anonChecklist = await anon.from("task_checklist_items").select("*");
    check(
      "anon cannot read subtasks",
      (anonChecklist.data?.length ?? 0) === 0,
      anonChecklist.error
        ? anonChecklist.error.message
        : `rows: ${anonChecklist.data?.length}`,
    );

    await admin
      .from("task_checklist_items")
      .delete()
      .in("task_id", [unassignedTask.id, assignedTask.id]);

    await admin.from("tasks").delete().in("id", [unassignedTask.id, assignedTask.id]);

    // --- pipeline ----------------------------------------------------------
    const { data: pipeline } = await admin
      .from("pipelines")
      .select("id")
      .limit(1)
      .maybeSingle();

    if (pipeline) {
      const { data: stages } = await admin
        .from("pipeline_stages")
        .select("id, name, position, is_won, is_lost")
        .eq("pipeline_id", pipeline.id)
        .order("position");

      const first = stages[0];
      const second = stages[1];
      const wonStage = stages.find((s) => s.is_won);

      const { data: deal } = await admin
        .from("deals")
        .insert({
          workspace_id: workspaceId,
          pipeline_id: pipeline.id,
          stage_id: first.id,
          title: `RLS probe deal ${Date.now()}`,
        })
        .select("id, status")
        .single();

      // The insert is a move too: a deal entering the pipeline starts its
      // history, or every duration calculation begins from the wrong point.
      const { count: initialHistory } = await admin
        .from("deal_stage_history")
        .select("id", { count: "exact", head: true })
        .eq("deal_id", deal.id);
      check(
        "creating a deal records its first stage",
        initialHistory === 1,
        `${initialHistory} history row(s)`,
      );

      const memberMove = await member
        .from("deals")
        .update({ stage_id: second.id, position: 2000 })
        .eq("id", deal.id);
      check(
        "member can move a deal",
        !memberMove.error,
        memberMove.error?.message ?? "ok",
      );

      const { count: afterMove } = await admin
        .from("deal_stage_history")
        .select("id", { count: "exact", head: true })
        .eq("deal_id", deal.id);
      check(
        "moving a deal writes exactly one history row",
        afterMove === 2,
        `${initialHistory} -> ${afterMove}`,
      );

      // A no-op update must not manufacture history.
      await member.from("deals").update({ title: "renamed by probe" }).eq("id", deal.id);
      const { count: afterRename } = await admin
        .from("deal_stage_history")
        .select("id", { count: "exact", head: true })
        .eq("deal_id", deal.id);
      check(
        "editing a deal without moving it writes no history",
        afterRename === 2,
        `${afterRename} rows`,
      );

      // History is the record of what happened. Nobody rewrites it.
      const historyWrite = await member.from("deal_stage_history").insert({
        workspace_id: workspaceId,
        deal_id: deal.id,
        to_stage_id: first.id,
      });
      check(
        "stage history cannot be forged",
        !!historyWrite.error,
        historyWrite.error?.message ?? "NO ERROR — history is writable",
      );

      const historyDelete = await user
        .from("deal_stage_history")
        .delete()
        .eq("deal_id", deal.id);
      const { count: historyStill } = await admin
        .from("deal_stage_history")
        .select("id", { count: "exact", head: true })
        .eq("deal_id", deal.id);
      check(
        "stage history cannot be erased",
        (historyStill ?? 0) === 2,
        historyDelete.error?.message ?? `${historyStill} rows survived`,
      );

      // Dropping into a won stage closes the deal, decided by the database.
      if (wonStage) {
        await member.from("deals").update({ stage_id: wonStage.id }).eq("id", deal.id);
        const { data: wonDeal } = await admin
          .from("deals")
          .select("status, closed_at")
          .eq("id", deal.id)
          .single();
        check(
          "moving a deal to a won stage marks it won",
          wonDeal?.status === "won",
          String(wonDeal?.status),
        );
        check(
          "winning a deal stamps closed_at",
          wonDeal?.closed_at !== null,
          String(wonDeal?.closed_at),
        );

        // And moving it back reopens it, rather than leaving a stale outcome.
        await member.from("deals").update({ stage_id: second.id }).eq("id", deal.id);
        const { data: reopened } = await admin
          .from("deals")
          .select("status, closed_at")
          .eq("id", deal.id)
          .single();
        check(
          "moving a deal back out reopens it",
          reopened?.status === "open" && reopened?.closed_at === null,
          `${reopened?.status}, closed_at ${reopened?.closed_at}`,
        );
      }

      const memberDeleteDeal = await member
        .from("deals")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", deal.id);
      check(
        "member cannot delete a deal",
        !!memberDeleteDeal.error,
        memberDeleteDeal.error?.message ?? "NO ERROR — members can delete deals",
      );

      // Positive path, the check whose absence hid the attachment bug.
      const managerDeleteDeal = await user
        .from("deals")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", deal.id);
      check(
        "manager can soft-delete a deal",
        !managerDeleteDeal.error,
        managerDeleteDeal.error?.message ?? "ok",
      );

      const memberStage = await member
        .from("pipeline_stages")
        .update({ name: "hijacked" })
        .eq("id", first.id);
      const { data: stageAfter } = await admin
        .from("pipeline_stages")
        .select("name")
        .eq("id", first.id)
        .single();
      check(
        "member cannot rename a stage",
        stageAfter?.name === first.name,
        memberStage.error?.message ?? `still ${stageAfter?.name}`,
      );

      await admin.from("deals").delete().eq("id", deal.id);
    }

    await admin.from("projects").delete().eq("id", projectId);

    // --- dashboard views ---------------------------------------------------
    // A Postgres view runs as its OWNER by default, which silently bypasses the
    // RLS of whoever queries it. A dashboard built that way would show one
    // workspace's numbers to another's users and look entirely correct doing
    // it. Every view is security_invoker; these checks are what prove it.

    const memberCounts = await member.from("v_dashboard_counts").select("*").maybeSingle();
    check(
      "member can read the dashboard counts",
      !memberCounts.error && !!memberCounts.data,
      memberCounts.error?.message ?? "ok",
    );

    const adminCounts = await user.from("v_dashboard_counts").select("*").maybeSingle();
    check(
      "member and admin see the same counts",
      JSON.stringify(memberCounts.data) === JSON.stringify(adminCounts.data),
      `member ${JSON.stringify(memberCounts.data)}`,
    );

    const anonCounts = await anon.from("v_dashboard_counts").select("*");
    check(
      "anon cannot read the dashboard counts",
      !!anonCounts.error || (anonCounts.data?.length ?? 0) === 0,
      anonCounts.error?.message ?? `rows: ${anonCounts.data?.length}`,
    );

    const anonActivity = await anon.from("v_recent_activity").select("*");
    check(
      "anon cannot read the activity feed",
      !!anonActivity.error || (anonActivity.data?.length ?? 0) === 0,
      anonActivity.error?.message ?? `rows: ${anonActivity.data?.length}`,
    );

    // The counts must agree with what the modules list, or the dashboard is
    // lying. Section 8.1 is the reason these are views over the same tables.
    const { count: contactRows } = await member
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null);
    check(
      "the contacts count matches the contacts list",
      Number(memberCounts.data?.contacts ?? -1) === (contactRows ?? -2),
      `view ${memberCounts.data?.contacts}, list ${contactRows}`,
    );

    // --- activity log ------------------------------------------------------
    const { data: loggedContact } = await member
      .from("contacts")
      .insert({
        workspace_id: workspaceId,
        type: "person",
        first_name: "Activity",
        last_name: `Probe ${Date.now()}`,
        status: "lead",
      })
      .select("id")
      .single();

    const { data: logRows } = await admin
      .from("activity_log")
      .select("action, entity_type, actor_id, changes")
      .eq("entity_id", loggedContact.id);
    check(
      "creating a record writes an activity row",
      logRows?.length === 1 && logRows[0].action === "created",
      JSON.stringify(logRows?.[0]),
    );
    check(
      "the activity row names the actor",
      logRows?.[0]?.actor_id === memberId,
      String(logRows?.[0]?.actor_id),
    );
    check(
      "the activity row carries a label to render",
      typeof logRows?.[0]?.changes?.label === "string",
      String(logRows?.[0]?.changes?.label),
    );

    await member
      .from("contacts")
      .update({ status: "active" })
      .eq("id", loggedContact.id);
    const { data: statusRows } = await admin
      .from("activity_log")
      .select("action, changes")
      .eq("entity_id", loggedContact.id)
      .eq("action", "status_changed");
    check(
      "a status change is logged as such, with both values",
      statusRows?.[0]?.changes?.from === "lead" && statusRows?.[0]?.changes?.to === "active",
      JSON.stringify(statusRows?.[0]?.changes),
    );

    // An audit trail that can be edited is not one.
    const forgeActivity = await member.from("activity_log").insert({
      workspace_id: workspaceId,
      entity_type: "contact",
      entity_id: loggedContact.id,
      action: "created",
    });
    check(
      "activity cannot be forged",
      !!forgeActivity.error,
      forgeActivity.error?.message ?? "NO ERROR — the audit trail is writable",
    );

    const eraseActivity = await user
      .from("activity_log")
      .delete()
      .eq("entity_id", loggedContact.id);
    const { count: activityStill } = await admin
      .from("activity_log")
      .select("id", { count: "exact", head: true })
      .eq("entity_id", loggedContact.id);
    check(
      "activity cannot be erased",
      (activityStill ?? 0) > 0,
      eraseActivity.error?.message ?? `${activityStill} rows survived`,
    );

    await admin.from("activity_log").delete().eq("entity_id", loggedContact.id);
    await admin.from("contacts").delete().eq("id", loggedContact.id);

    // --- finance (0019) -----------------------------------------------------
    // Finance is a per-user grant rather than a role, so the interesting
    // questions are different from everywhere else: can someone without it see
    // anything, and can they give it to themselves.

    const { data: probeTxn } = await admin
      .from("transactions")
      .insert({
        workspace_id: workspaceId,
        kind: "income",
        amount_poisha: 500000,
        occurred_on: "2026-09-01",
        description: "__finance_probe__",
      })
      .select("id")
      .single();

    const anonTxns = await anon.from("transactions").select("*");
    check(
      "anon reads no transactions",
      (anonTxns.data?.length ?? 0) === 0,
      anonTxns.error ? anonTxns.error.message : `rows: ${anonTxns.data?.length}`,
    );

    const ungrantedRead = await member.from("transactions").select("id");
    check(
      "member without the finance grant reads nothing",
      (ungrantedRead.data?.length ?? 0) === 0,
      ungrantedRead.error?.message ?? `rows: ${ungrantedRead.data?.length}`,
    );

    const ungrantedHelper = await member.rpc("has_finance_access");
    check(
      "has_finance_access() is false without the grant",
      ungrantedHelper.data === false,
      String(ungrantedHelper.data),
    );

    // The attack the column exists to stop: profiles_update_self_or_admin lets
    // anyone edit their own row, so without the guard this is a one-line
    // privilege escalation into the company's books.
    const selfGrant = await member
      .from("profiles")
      .update({ finance_access: true })
      .eq("id", memberId)
      .select("id");
    check(
      "member cannot grant themselves finance access",
      !!selfGrant.error,
      selfGrant.error?.message ?? "NO ERROR — a member self-granted finance",
    );

    const { data: stillFalse } = await admin
      .from("profiles")
      .select("finance_access")
      .eq("id", memberId)
      .single();
    check(
      "and the flag really is still false",
      stillFalse?.finance_access === false,
      String(stillFalse?.finance_access),
    );

    const ungrantedWrite = await member.from("transactions").insert({
      workspace_id: workspaceId,
      kind: "expense",
      amount_poisha: 100,
      occurred_on: "2026-09-02",
      description: "__finance_probe_denied__",
    });
    check(
      "member without the grant cannot write to the ledger",
      !!ungrantedWrite.error,
      ungrantedWrite.error?.message ?? "NO ERROR — ungranted member wrote a transaction",
    );

    // A dedicated admin rather than `user`. The self-demote check above leaves
    // the signed-in runner a member whenever a second super admin exists, and
    // an ungranted member obviously cannot grant anything — which would make
    // this check report a hole that is not there.
    const grantAdminEmail = `finance-grantor-${Date.now()}@example.com`;
    const grantAdminPassword = `Probe!${Math.random().toString(36).slice(2)}Aa1`;
    const { data: grantAdmin } = await admin.auth.admin.createUser({
      email: grantAdminEmail,
      password: grantAdminPassword,
      email_confirm: true,
      user_metadata: { full_name: "Finance Grantor", role: "admin" },
    });
    await admin
      .from("profiles")
      .update({ role: "admin", status: "active", must_change_password: false })
      .eq("id", grantAdmin.user.id);

    const grantor = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    await grantor.auth.signInWithPassword({
      email: grantAdminEmail,
      password: grantAdminPassword,
    });

    const grant = await grantor
      .from("profiles")
      .update({ finance_access: true })
      .eq("id", memberId)
      .select("finance_access");
    check(
      "an admin can grant finance access",
      !grant.error && grant.data?.[0]?.finance_access === true,
      grant.error?.message ?? JSON.stringify(grant.data),
    );

    const grantedRead = await member.from("transactions").select("id");
    check(
      "the granted member now reads the ledger",
      (grantedRead.data?.length ?? 0) >= 1,
      grantedRead.error?.message ?? `rows: ${grantedRead.data?.length}`,
    );

    // The report functions are deliberately not security definer. If they were,
    // they would hand the whole ledger to anyone who could call them.
    await grantor.from("profiles").update({ finance_access: false }).eq("id", memberId);
    const revokedReport = await member.rpc("finance_series", {
      p_from: "2026-01-01",
      p_to: "2026-12-31",
      p_bucket: "month",
    });
    check(
      "revoking the grant closes the report functions too",
      (revokedReport.data?.length ?? 0) === 0,
      revokedReport.error?.message ?? `rows: ${revokedReport.data?.length}`,
    );

    const hardDeleteTxn = await user
      .from("transactions")
      .delete()
      .eq("id", probeTxn.id)
      .select("id");
    check(
      "not even an admin can hard delete a transaction",
      (hardDeleteTxn.data?.length ?? 0) === 0,
      hardDeleteTxn.error?.message ?? `rows deleted: ${hardDeleteTxn.data?.length}`,
    );

    const negativeAmount = await admin.from("transactions").insert({
      workspace_id: workspaceId,
      kind: "income",
      amount_poisha: -5,
      occurred_on: "2026-09-01",
      description: "__finance_probe_negative__",
    });
    check(
      "a negative amount is refused",
      !!negativeAmount.error,
      negativeAmount.error?.message ?? "NO ERROR — negative amount accepted",
    );

    await admin.from("transactions").delete().like("description", "__finance_probe%");
    await admin.auth.admin.deleteUser(grantAdmin.user.id);

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
