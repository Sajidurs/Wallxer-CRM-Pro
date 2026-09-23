"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { createClient } from "@/lib/supabase/server";

import { loginSchema, setPasswordSchema } from "./schema";

/**
 * Sign in.
 *
 * The client submits values it has already validated; this re-validates them,
 * because the client is not trustworthy and a server action is a public HTTP
 * endpoint like any other.
 *
 * Returns rather than redirects, so the form can show the error inline. The
 * caller navigates on success.
 */
export async function signIn(input: unknown): Promise<ActionResult<undefined>> {
  const parsed = loginSchema.safeParse(input);

  if (!parsed.success) {
    return fail(
      "Check the details below.",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    // Deliberately vague: distinguishing "no such account" from "wrong
    // password" tells an attacker which emails are real.
    if (error.status === 400) {
      return fail("That email and password do not match an account.");
    }
    return fail(error.message);
  }

  revalidatePath("/", "layout");
  return ok();
}

export async function signOut(): Promise<ActionResult<undefined>> {
  const supabase = await createClient();

  const { error } = await supabase.auth.signOut();
  if (error) return fail(error.message);

  revalidatePath("/", "layout");
  return ok();
}

/**
 * Used when accepting an invite, and when changing your own password.
 * Supabase requires a valid session for this, which the invite link provides.
 */
export async function setPassword(
  input: unknown,
): Promise<ActionResult<undefined>> {
  const parsed = setPasswordSchema.safeParse(input);

  if (!parsed.success) {
    return fail(
      "Check the details below.",
      parsed.error.flatten().fieldErrors as Record<string, string[]>,
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return fail("That link has expired. Ask an admin to send a new invite.");
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) return fail(error.message);

  revalidatePath("/", "layout");
  return ok();
}
