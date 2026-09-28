"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFromZod, firstIssueMessage } from "@/lib/zod";

import {
  advanceRenewalSchema,
  deleteRenewalSchema,
  renewalSchema,
  updateRenewalSchema,
  type RenewalValues,
} from "./schema";

function toRow(values: RenewalValues) {
  return {
    name: values.name,
    category: values.category,
    vendor: values.vendor,
    contact_id: values.contactId,
    project_id: values.projectId,
    brand_id: values.brandId,
    status: values.status,
    cycle: values.cycle,
    started_on: values.startedOn,
    next_renewal_on: values.nextRenewalOn,
    last_renewed_on: values.lastRenewedOn,
    currency: values.currency,
    price_minor: values.price,
    cost_minor: values.cost,
    auto_renew: values.autoRenew,
    reminder_days: values.reminderDays,
    login_url: values.loginUrl,
    notes: values.notes,
  };
}

/**
 * Operational work, like projects: anyone active in the workspace may add and
 * edit. Deleting is manager work, which `guard_renewal_edit` enforces.
 */
async function requireRenewalEditor() {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return { ok: false as const, error: "Your session has expired. Sign in again." };
  }
  if (!can(actor, "update", "project")) {
    return { ok: false as const, error: "You do not have permission to change renewals." };
  }
  return { ok: true as const, actor, supabase: await createClient() };
}

export async function createRenewal(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireRenewalEditor();
  if (!gate.ok) return fail(gate.error);

  const parsed = renewalSchema.safeParse(input);
  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error), fieldErrorsFromZod(parsed.error));
  }

  const { data, error } = await gate.supabase
    .from("renewals")
    .insert({
      ...toRow(parsed.data),
      workspace_id: gate.actor.workspace_id,
      created_by: gate.actor.id,
    })
    .select("id")
    .single();

  if (error) return fail(error.message);

  revalidatePath("/renewals");
  return ok({ id: data.id });
}

export async function updateRenewal(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireRenewalEditor();
  if (!gate.ok) return fail(gate.error);

  const parsed = updateRenewalSchema.safeParse(input);
  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error), fieldErrorsFromZod(parsed.error));
  }

  const { error } = await gate.supabase
    .from("renewals")
    .update(toRow(parsed.data.values))
    .eq("id", parsed.data.id);

  if (error) return fail(error.message);

  revalidatePath("/renewals");
  return ok({ id: parsed.data.id });
}

/**
 * "Renewed" — rolls the cycle forward by one period.
 *
 * The arithmetic is a database function, because adding a month to 31 January
 * is a question JavaScript and Postgres answer differently, and Postgres gives
 * the answer a billing cycle actually uses.
 */
export async function markRenewed(
  input: unknown,
): Promise<ActionResult<{ nextRenewalOn: string }>> {
  const gate = await requireRenewalEditor();
  if (!gate.ok) return fail(gate.error);

  const parsed = advanceRenewalSchema.safeParse(input);
  if (!parsed.success) return fail("That renewal is not valid.");

  const { data, error } = await gate.supabase.rpc("advance_renewal", {
    p_id: parsed.data.id,
  });

  if (error) return fail(error.message);

  revalidatePath("/renewals");
  return ok({ nextRenewalOn: String(data) });
}

export async function setRenewalDeleted(
  input: unknown,
): Promise<ActionResult<{ id: string; deleted: boolean }>> {
  const gate = await requireRenewalEditor();
  if (!gate.ok) return fail(gate.error);

  const parsed = deleteRenewalSchema.safeParse(input);
  if (!parsed.success) return fail("That renewal is not valid.");

  const { error } = await gate.supabase
    .from("renewals")
    .update({
      deleted_at: parsed.data.deleted ? new Date().toISOString() : null,
    })
    .eq("id", parsed.data.id);

  if (error) return fail(error.message);

  revalidatePath("/renewals");
  return ok({ id: parsed.data.id, deleted: parsed.data.deleted });
}
