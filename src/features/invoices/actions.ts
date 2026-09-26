"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth";
import { canAccessFinance } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFromZod, firstIssueMessage } from "@/lib/zod";
import type { Json, TablesUpdate } from "@/types/database.types";

import {
  deleteInvoiceSchema,
  invoiceSchema,
  setInvoiceStatusSchema,
  updateInvoiceSchema,
  type ClientSnapshot,
  type InvoiceValues,
  type IssuerSnapshot,
} from "./schema";

async function requireInvoicing() {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return { ok: false as const, error: "Your session has expired. Sign in again." };
  }
  if (!canAccessFinance(actor)) {
    return { ok: false as const, error: "You do not have access to invoicing." };
  }
  return { ok: true as const, actor, supabase: await createClient() };
}

function toRow(values: InvoiceValues) {
  return {
    brand_id: values.brandId,
    contact_id: values.contactId,
    project_id: values.projectId,
    currency: values.currency,
    issue_date: values.issueDate,
    due_date: values.dueDate,
    tax_rate: values.taxRate,
    tax_label: values.taxLabel,
    notes: values.notes,
    terms: values.terms,
  };
}

type Client = Awaited<ReturnType<typeof createClient>>;

/** Replaces the lines wholesale. The totals trigger recomputes as they land. */
async function writeItems(
  supabase: Client,
  workspaceId: string,
  invoiceId: string,
  items: InvoiceValues["items"],
) {
  await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId);

  const { error } = await supabase.from("invoice_items").insert(
    items.map((item, index) => ({
      workspace_id: workspaceId,
      invoice_id: invoiceId,
      description: item.description,
      quantity: item.quantity,
      unit_amount_minor: item.unitAmount,
      position: index,
    })),
  );

  return error;
}

export async function createInvoice(
  input: unknown,
): Promise<ActionResult<{ id: string; number: string }>> {
  const gate = await requireInvoicing();
  if (!gate.ok) return fail(gate.error);

  const parsed = invoiceSchema.safeParse(input);
  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error), fieldErrorsFromZod(parsed.error));
  }

  // Atomic in the database, so two people creating at once cannot collide.
  const { data: number, error: numberError } = await gate.supabase.rpc(
    "next_invoice_number",
    { p_brand_id: parsed.data.brandId },
  );

  if (numberError || !number) {
    return fail(numberError?.message ?? "Could not allocate an invoice number.");
  }

  const { data, error } = await gate.supabase
    .from("invoices")
    .insert({
      ...toRow(parsed.data),
      number,
      workspace_id: gate.actor.workspace_id,
      created_by: gate.actor.id,
    })
    .select("id, number")
    .single();

  if (error) return fail(error.message);

  const itemError = await writeItems(
    gate.supabase,
    gate.actor.workspace_id,
    data.id,
    parsed.data.items,
  );
  if (itemError) return fail(itemError.message);

  revalidatePath("/invoices");
  return ok({ id: data.id, number: data.number });
}

export async function updateInvoice(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireInvoicing();
  if (!gate.ok) return fail(gate.error);

  const parsed = updateInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error), fieldErrorsFromZod(parsed.error));
  }

  const { data: existing } = await gate.supabase
    .from("invoices")
    .select("status")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (!existing) return fail("That invoice no longer exists.");

  // A sent invoice is a document somebody else is holding. Editing the amounts
  // underneath it would make their copy and yours disagree, silently.
  if (existing.status !== "draft") {
    return fail(
      "Only a draft can be edited. Put this back to draft first if it has not really been sent.",
    );
  }

  const { error } = await gate.supabase
    .from("invoices")
    .update(toRow(parsed.data.values))
    .eq("id", parsed.data.id);

  if (error) return fail(error.message);

  const itemError = await writeItems(
    gate.supabase,
    gate.actor.workspace_id,
    parsed.data.id,
    parsed.data.values.items,
  );
  if (itemError) return fail(itemError.message);

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${parsed.data.id}`);
  return ok({ id: parsed.data.id });
}

/**
 * Moving an invoice along, and freezing the letterhead the first time it
 * leaves draft.
 *
 * Nothing is written to Finance: by decision, the ledger records money when it
 * lands, not when it is promised.
 */
export async function setInvoiceStatus(
  input: unknown,
): Promise<ActionResult<{ id: string; status: string }>> {
  const gate = await requireInvoicing();
  if (!gate.ok) return fail(gate.error);

  const parsed = setInvoiceStatusSchema.safeParse(input);
  if (!parsed.success) return fail("That status is not valid.");

  const { data: invoice } = await gate.supabase
    .from("invoices")
    .select("id, status, brand_id, contact_id, issuer_snapshot, sent_at")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (!invoice) return fail("That invoice no longer exists.");

  const patch: TablesUpdate<"invoices"> = { status: parsed.data.status };

  if (parsed.data.status === "sent" && !invoice.sent_at) {
    patch.sent_at = new Date().toISOString();
  }
  if (parsed.data.status === "paid") {
    patch.paid_at = new Date().toISOString();
  }
  if (parsed.data.status === "draft") {
    // Back to draft means back to live details, so the snapshot is dropped
    // rather than left to contradict an invoice that is being reworked.
    patch.issuer_snapshot = null;
    patch.client_snapshot = null;
    patch.sent_at = null;
    patch.paid_at = null;
  }

  // Freeze once, on the way out of draft.
  if (parsed.data.status !== "draft" && !invoice.issuer_snapshot) {
    const [{ data: brand }, { data: contact }] = await Promise.all([
      gate.supabase
        .from("brands")
        .select("name, legal_name, email, phone, website, address, bank_details, tax_id, logo_path")
        .eq("id", invoice.brand_id)
        .maybeSingle(),
      invoice.contact_id
        ? gate.supabase
            .from("contacts")
            .select("type, first_name, last_name, company_name, email, phone, address")
            .eq("id", invoice.contact_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    if (brand) {
      const issuer: IssuerSnapshot = {
        name: brand.name,
        legalName: brand.legal_name,
        email: brand.email,
        phone: brand.phone,
        website: brand.website,
        address: brand.address,
        bankDetails: brand.bank_details,
        taxId: brand.tax_id,
        logoPath: brand.logo_path,
      };
      // The generated Json type wants an index signature; these are shaped
      // records crossing into jsonb, so the cast is the serialisation boundary.
      patch.issuer_snapshot = issuer as unknown as Json;
    }

    if (contact) {
      const address = contact.address as Record<string, string> | null;
      const client: ClientSnapshot = {
        name:
          contact.type === "company"
            ? (contact.company_name ?? "Unnamed company")
            : [contact.first_name, contact.last_name].filter(Boolean).join(" ") ||
              "Unnamed contact",
        email: contact.email,
        phone: contact.phone,
        address: address
          ? [address.line1, address.line2, address.city, address.postcode, address.country]
              .filter(Boolean)
              .join("\n") || null
          : null,
      };
      patch.client_snapshot = client as unknown as Json;
    }
  }

  const { error } = await gate.supabase
    .from("invoices")
    .update(patch)
    .eq("id", parsed.data.id);

  if (error) return fail(error.message);

  revalidatePath("/invoices");
  revalidatePath(`/invoices/${parsed.data.id}`);
  return ok({ id: parsed.data.id, status: parsed.data.status });
}

export async function setInvoiceDeleted(
  input: unknown,
): Promise<ActionResult<{ id: string; deleted: boolean }>> {
  const gate = await requireInvoicing();
  if (!gate.ok) return fail(gate.error);

  const parsed = deleteInvoiceSchema.safeParse(input);
  if (!parsed.success) return fail("That invoice is not valid.");

  const { error } = await gate.supabase
    .from("invoices")
    .update({
      deleted_at: parsed.data.deleted ? new Date().toISOString() : null,
    })
    .eq("id", parsed.data.id);

  if (error) return fail(error.message);

  revalidatePath("/invoices");
  return ok({ id: parsed.data.id, deleted: parsed.data.deleted });
}
