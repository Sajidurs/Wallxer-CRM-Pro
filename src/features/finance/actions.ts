"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth";
import { canAccessFinance, canGrantFinance } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFromZod, firstIssueMessage } from "@/lib/zod";

import {
  categorySchema,
  deleteTransactionSchema,
  financeAccessSchema,
  transactionSchema,
  updateTransactionSchema,
  type TransactionValues,
} from "./schema";

function toRow(values: TransactionValues) {
  return {
    kind: values.kind,
    amount_poisha: values.amount,
    occurred_on: values.occurredOn,
    category_id: values.categoryId,
    brand_id: values.brandId,
    project_id: values.projectId,
    contact_id: values.contactId,
    payment_method: values.paymentMethod,
    reference: values.reference,
    description: values.description,
  };
}

function revalidateFinance(id?: string) {
  revalidatePath("/finance");
  revalidatePath("/finance/transactions");
  if (id) revalidatePath(`/finance/${id}/edit`);
}

/**
 * The grant, checked before every write.
 *
 * RLS refuses these anyway. This exists so a refusal arrives as a sentence
 * instead of as a policy violation, and so the check is stated at the same
 * altitude as the action it guards.
 */
async function requireFinance() {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return { ok: false as const, error: "Your session has expired. Sign in again." };
  }
  if (!canAccessFinance(actor)) {
    return { ok: false as const, error: "You do not have access to Finance." };
  }
  return { ok: true as const, actor, supabase: await createClient() };
}

export async function createTransaction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireFinance();
  if (!gate.ok) return fail(gate.error);

  const parsed = transactionSchema.safeParse(input);
  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error), fieldErrorsFromZod(parsed.error));
  }

  const { data, error } = await gate.supabase
    .from("transactions")
    .insert({
      ...toRow(parsed.data),
      workspace_id: gate.actor.workspace_id,
      created_by: gate.actor.id,
    })
    .select("id")
    .single();

  if (error) return fail(error.message);

  revalidateFinance();
  return ok({ id: data.id });
}

export async function updateTransaction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireFinance();
  if (!gate.ok) return fail(gate.error);

  const parsed = updateTransactionSchema.safeParse(input);
  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error), fieldErrorsFromZod(parsed.error));
  }

  const { id, ...values } = parsed.data;

  const { error } = await gate.supabase
    .from("transactions")
    .update(toRow(values))
    .eq("id", id);

  if (error) return fail(error.message);

  revalidateFinance(id);
  return ok({ id });
}

export async function setTransactionDeleted(
  input: unknown,
): Promise<ActionResult<{ id: string; deleted: boolean }>> {
  const gate = await requireFinance();
  if (!gate.ok) return fail(gate.error);

  const parsed = deleteTransactionSchema.safeParse(input);
  if (!parsed.success) return fail("That transaction is not valid.");

  const { error } = await gate.supabase
    .from("transactions")
    .update({
      deleted_at: parsed.data.deleted ? new Date().toISOString() : null,
    })
    .eq("id", parsed.data.id);

  if (error) return fail(error.message);

  revalidateFinance(parsed.data.id);
  return ok({ id: parsed.data.id, deleted: parsed.data.deleted });
}

export async function createCategory(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireFinance();
  if (!gate.ok) return fail(gate.error);

  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error), fieldErrorsFromZod(parsed.error));
  }

  const { data, error } = await gate.supabase
    .from("transaction_categories")
    .insert({
      workspace_id: gate.actor.workspace_id,
      kind: parsed.data.kind,
      name: parsed.data.name,
      created_by: gate.actor.id,
    })
    .select("id")
    .single();

  if (error) {
    // The unique index is on (workspace, kind, name), which is the only way
    // this realistically fails.
    if (error.code === "23505") return fail("That category already exists.");
    return fail(error.message);
  }

  revalidateFinance();
  return ok({ id: data.id });
}

/**
 * Hand the Finance module to someone, or take it back.
 *
 * Deliberately not part of `requireFinance`: granting is user administration,
 * not finance work. A granted manager can use the ledger but cannot widen the
 * circle — only an admin does that, which the database enforces in
 * `guard_profile_privileged_columns`.
 */
export async function setFinanceAccess(
  input: unknown,
): Promise<ActionResult<{ id: string; granted: boolean }>> {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return fail("Your session has expired. Sign in again.");
  }
  if (!canGrantFinance(actor)) {
    return fail("Only an admin can change who reaches Finance.");
  }

  const parsed = financeAccessSchema.safeParse(input);
  if (!parsed.success) return fail("That user is not valid.");

  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({ finance_access: parsed.data.granted })
    .eq("id", parsed.data.id);

  if (error) return fail(error.message);

  revalidatePath("/settings/users");
  return ok({ id: parsed.data.id, granted: parsed.data.granted });
}
