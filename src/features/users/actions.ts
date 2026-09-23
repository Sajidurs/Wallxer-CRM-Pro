"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { fieldErrorsFromZod, firstIssueMessage } from "@/lib/zod";
import { getCurrentUser } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { atLeast } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";

import {
  changeRoleSchema,
  inviteUserSchema,
  resetPasswordSchema,
  setStatusSchema,
  updateOwnProfileSchema,
} from "./schema";

type Profile = Tables<"profiles">;

/**
 * Every action in this file re-derives the caller from the session cookie.
 *
 * A server action is a public HTTP endpoint. Nothing about the button that
 * rendered it constrains what reaches the function, so the role check has to
 * happen here, not in the component that decided whether to show the button.
 */
async function requireActor(
  minimum: "admin" | "super_admin",
): Promise<{ actor: Profile } | { error: string }> {
  const actor = await getCurrentUser();

  if (!actor || actor.status !== "active") {
    return { error: "Your session has expired. Sign in again." };
  }

  if (!atLeast(actor.role, minimum)) {
    return { error: "You do not have permission to do that." };
  }

  return { actor };
}

/** base64url so the password survives being pasted out of any chat client. */
function generatePassword() {
  return randomBytes(18).toString("base64url");
}

export interface InviteResult {
  email: string;
  delivery: "email" | "password";
  /** Only present for the password delivery method. Shown once, never stored. */
  temporaryPassword?: string;
}

export async function inviteUser(
  input: unknown,
): Promise<ActionResult<InviteResult>> {
  const guard = await requireActor("admin");
  if ("error" in guard) return fail(guard.error);

  const parsed = inviteUserSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      firstIssueMessage(parsed.error),
      fieldErrorsFromZod(parsed.error),
    );
  }

  const { email, fullName, role, jobTitle, delivery } = parsed.data;

  // Privilege escalation guard. The role travels in user metadata and
  // handle_new_user trusts it, and that trigger fires on INSERT where the
  // privileged-column trigger does not apply. Without this check an admin could
  // mint a super admin and then be promoted by them.
  if (role === "super_admin" && guard.actor.role !== "super_admin") {
    return fail("Only a super admin can create another super admin.");
  }

  const admin = createAdminClient();

  // Cheap pre-check for a clearer message than the Auth API's duplicate error.
  const { data: existing } = await admin
    .from("profiles")
    .select("id, email, status")
    .ilike("email", email)
    .maybeSingle();

  if (existing) {
    return fail(`${email} already has an account.`);
  }

  const metadata = {
    full_name: fullName,
    role,
    workspace_id: guard.actor.workspace_id,
  };

  let userId: string;
  let temporaryPassword: string | undefined;

  if (delivery === "email") {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: metadata,
      redirectTo: `${publicEnv.appUrl()}/auth/callback?next=/set-password`,
    });

    if (error) {
      // The built-in Supabase mailer allows two messages an hour and, on a new
      // project, only to addresses on the Supabase org. Say so, rather than
      // surfacing a bare "email rate limit exceeded".
      if (/rate limit|429/i.test(error.message)) {
        return fail(
          "Supabase's built-in mailer is rate limited to 2 emails per hour. Configure custom SMTP, or create the account with a temporary password instead.",
        );
      }
      return fail(`Could not send the invite: ${error.message}`);
    }

    userId = data.user.id;
  } else {
    temporaryPassword = generatePassword();

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: temporaryPassword,
      // Confirmed on creation: there is no email round trip to confirm it with.
      email_confirm: true,
      user_metadata: metadata,
    });

    if (error) {
      return fail(`Could not create the account: ${error.message}`);
    }

    userId = data.user.id;
  }

  // handle_new_user already created the profile. Fill in what the trigger
  // cannot know, and force a password change for the handed-over password.
  const { error: profileError } = await admin
    .from("profiles")
    .update({
      full_name: fullName,
      role,
      job_title: jobTitle ?? null,
      invited_by: guard.actor.id,
      invited_at: new Date().toISOString(),
      must_change_password: true,
    })
    .eq("id", userId);

  if (profileError) {
    return fail(`Account created, but the profile update failed: ${profileError.message}`);
  }

  revalidatePath("/settings/users");
  return ok({ email, delivery, temporaryPassword });
}

export async function changeUserRole(
  input: unknown,
): Promise<ActionResult<undefined>> {
  // Deliberately stricter than the rest of this module: SYSTEM_DESIGN 7.2 makes
  // role changes super-admin-only, and the database trigger enforces the same.
  const guard = await requireActor("super_admin");
  if ("error" in guard) return fail(guard.error);

  const parsed = changeRoleSchema.safeParse(input);
  if (!parsed.success) return fail("That role is not valid.");

  const { userId, role } = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role })
    .eq("id", userId);

  if (error) {
    // The last-super-admin guard raises here. Its message is already written
    // for a human, so pass it through rather than flattening it.
    return fail(error.message);
  }

  revalidatePath("/settings/users");
  return ok();
}

export async function setUserStatus(
  input: unknown,
): Promise<ActionResult<undefined>> {
  const guard = await requireActor("admin");
  if ("error" in guard) return fail(guard.error);

  const parsed = setStatusSchema.safeParse(input);
  if (!parsed.success) return fail("That status is not valid.");

  const { userId, status } = parsed.data;

  if (userId === guard.actor.id && status !== "active") {
    return fail("You cannot suspend your own account.");
  }

  // Through the user-scoped client on purpose, so the guard trigger sees the
  // real auth.uid() and can apply the last-super-admin and self-suspend rules.
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ status })
    .eq("id", userId);

  if (error) return fail(error.message);

  revalidatePath("/settings/users");
  return ok();
}

/**
 * Generates a new temporary password and hands it back to the admin once.
 *
 * Not an emailed reset link, because the built-in mailer cannot be relied on.
 * The user is forced to change it on their next page load.
 */
export async function resetUserPassword(
  input: unknown,
): Promise<ActionResult<{ temporaryPassword: string; email: string }>> {
  const guard = await requireActor("admin");
  if ("error" in guard) return fail(guard.error);

  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return fail("That user is not valid.");

  const admin = createAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("id, email, role")
    .eq("id", parsed.data.userId)
    .maybeSingle();

  if (!target) return fail("That user no longer exists.");

  // Resetting a super admin's password is a takeover of the highest role in the
  // workspace. Only a peer may do it.
  if (target.role === "super_admin" && guard.actor.role !== "super_admin") {
    return fail("Only a super admin can reset another super admin's password.");
  }

  const temporaryPassword = generatePassword();

  const { error } = await admin.auth.admin.updateUserById(target.id, {
    password: temporaryPassword,
  });

  if (error) return fail(`Could not reset the password: ${error.message}`);

  await admin
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", target.id);

  revalidatePath("/settings/users");
  return ok({ temporaryPassword, email: target.email });
}

export async function updateOwnProfile(
  input: unknown,
): Promise<ActionResult<undefined>> {
  const actor = await getCurrentUser();

  if (!actor || actor.status !== "active") {
    return fail("Your session has expired. Sign in again.");
  }

  const parsed = updateOwnProfileSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      firstIssueMessage(parsed.error),
      fieldErrorsFromZod(parsed.error),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone,
      job_title: parsed.data.jobTitle,
      timezone: parsed.data.timezone,
    })
    .eq("id", actor.id);

  if (error) return fail(error.message);

  revalidatePath("/", "layout");
  return ok();
}
