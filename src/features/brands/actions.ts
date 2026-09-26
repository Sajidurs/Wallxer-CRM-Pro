"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFromZod, firstIssueMessage } from "@/lib/zod";

import {
  brandSchema,
  deleteBrandSchema,
  updateBrandSchema,
  type BrandValues,
} from "./schema";

function toRow(values: BrandValues) {
  return {
    name: values.name,
    color: values.color,
    legal_name: values.legalName,
    email: values.email,
    phone: values.phone,
    website: values.website,
    address: values.address,
    bank_details: values.bankDetails,
    tax_id: values.taxId,
    invoice_prefix: values.invoicePrefix,
    is_active: values.isActive,
  };
}

/** Companies live in Settings, so changing one is admin work. */
async function requireBrandAdmin() {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return { ok: false as const, error: "Your session has expired. Sign in again." };
  }
  if (!can(actor, "update", "brand")) {
    return { ok: false as const, error: "Only an admin can change companies." };
  }
  return { ok: true as const, actor, supabase: await createClient() };
}

/** Unique on (workspace, lower(name)) and on the invoice prefix. */
function friendlyConflict(message: string): string {
  if (message.includes("brands_invoice_prefix_key")) {
    return "Another company already uses that invoice prefix.";
  }
  if (message.includes("brands_workspace_name_key")) {
    return "A company with that name already exists.";
  }
  return message;
}

export async function createBrand(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireBrandAdmin();
  if (!gate.ok) return fail(gate.error);

  const parsed = brandSchema.safeParse(input);
  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error), fieldErrorsFromZod(parsed.error));
  }

  // Appended to the end of the list rather than jumping to the top.
  const { data: last } = await gate.supabase
    .from("brands")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await gate.supabase
    .from("brands")
    .insert({
      ...toRow(parsed.data),
      workspace_id: gate.actor.workspace_id,
      position: (last?.position ?? 0) + 1,
    })
    .select("id")
    .single();

  if (error) return fail(friendlyConflict(error.message));

  revalidatePath("/settings/brands");
  return ok({ id: data.id });
}

export async function updateBrand(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireBrandAdmin();
  if (!gate.ok) return fail(gate.error);

  const parsed = updateBrandSchema.safeParse(input);
  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error), fieldErrorsFromZod(parsed.error));
  }

  const { id, ...values } = parsed.data;

  const { error } = await gate.supabase
    .from("brands")
    .update(toRow(values))
    .eq("id", id);

  if (error) return fail(friendlyConflict(error.message));

  revalidatePath("/settings/brands");
  revalidatePath("/invoices");
  return ok({ id });
}

/**
 * A real delete — `brands` has no `deleted_at`, by its original design.
 *
 * The foreign key from `invoices` is `on delete restrict`, so a company that
 * has issued anything cannot be removed. That refusal is the correct outcome,
 * not an obstacle: the invoice is a document somebody else is holding, and the
 * letterhead it was issued under has to survive. Deactivating hides it from
 * every picker without touching history.
 */
export async function deleteBrand(
  input: unknown,
): Promise<ActionResult<undefined>> {
  const gate = await requireBrandAdmin();
  if (!gate.ok) return fail(gate.error);
  if (!can(gate.actor, "delete", "brand")) {
    return fail("Only an admin can delete a company.");
  }

  const parsed = deleteBrandSchema.safeParse(input);
  if (!parsed.success) return fail("That company is not valid.");

  const { count } = await gate.supabase
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("brand_id", parsed.data.id);

  if ((count ?? 0) > 0) {
    return fail(
      `That company has ${count} invoice${count === 1 ? "" : "s"}. Deactivate it instead, so the invoices keep their letterhead.`,
    );
  }

  const { error } = await gate.supabase
    .from("brands")
    .delete()
    .eq("id", parsed.data.id);

  if (error) return fail(error.message);

  revalidatePath("/settings/brands");
  return ok();
}
