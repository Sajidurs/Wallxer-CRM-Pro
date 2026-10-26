"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFromZod, firstIssueMessage } from "@/lib/zod";
import type { Json, TablesUpdate } from "@/types/database.types";

import {
  deleteProposalSchema,
  proposalSchema,
  setProposalStatusSchema,
  updateProposalSchema,
  type ClientSnapshot,
  type IssuerSnapshot,
  type ProposalValues,
} from "./schema";

/**
 * Sales work, like projects and renewals rather than like invoices.
 *
 * A proposal is what wins the work; the person who would run the project is
 * usually the one who should be able to draft it. It carries no payment
 * details of its own and no ledger, so it does not need the Finance grant.
 * Deleting stays with managers, which `guard_proposal_edit` enforces.
 */
async function requireProposalEditor() {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return { ok: false as const, error: "Your session has expired. Sign in again." };
  }
  if (!can(actor, "update", "project")) {
    return {
      ok: false as const,
      error: "You do not have permission to change proposals.",
    };
  }
  return { ok: true as const, actor, supabase: await createClient() };
}

function toRow(values: ProposalValues) {
  return {
    brand_id: values.brandId,
    contact_id: values.contactId,
    project_id: values.projectId,
    title: values.title,
    currency: values.currency,
    issue_date: values.issueDate,
    valid_until: values.validUntil,
    overview: values.overview,
    scope: values.scope,
    deliverables: values.deliverables,
    timeline: values.timeline,
    investment: values.investment,
    terms: values.terms,
    tax_rate: values.taxRate,
    tax_label: values.taxLabel,
  };
}

type Client = Awaited<ReturnType<typeof createClient>>;

/** Replaces the lines wholesale. The totals trigger recomputes as they land. */
async function writeItems(
  supabase: Client,
  workspaceId: string,
  proposalId: string,
  items: ProposalValues["items"],
) {
  await supabase.from("proposal_items").delete().eq("proposal_id", proposalId);

  if (items.length === 0) {
    // The delete above fired the subtotal trigger, so the total is already
    // back to zero. Inserting an empty array would be an error, not a no-op.
    return null;
  }

  const { error } = await supabase.from("proposal_items").insert(
    items.map((item, index) => ({
      workspace_id: workspaceId,
      proposal_id: proposalId,
      description: item.description,
      quantity: item.quantity,
      unit_amount_minor: item.unitAmount,
      position: index,
    })),
  );

  return error;
}

export async function createProposal(
  input: unknown,
): Promise<ActionResult<{ id: string; number: string }>> {
  const gate = await requireProposalEditor();
  if (!gate.ok) return fail(gate.error);

  const parsed = proposalSchema.safeParse(input);
  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error), fieldErrorsFromZod(parsed.error));
  }

  // Atomic in the database, so two people drafting at once cannot collide.
  const { data: number, error: numberError } = await gate.supabase.rpc(
    "next_proposal_number",
    { p_brand_id: parsed.data.brandId },
  );

  if (numberError || !number) {
    return fail(numberError?.message ?? "Could not allocate a proposal number.");
  }

  const { data, error } = await gate.supabase
    .from("proposals")
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

  revalidatePath("/proposals");
  return ok({ id: data.id, number: data.number });
}

export async function updateProposal(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const gate = await requireProposalEditor();
  if (!gate.ok) return fail(gate.error);

  const parsed = updateProposalSchema.safeParse(input);
  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error), fieldErrorsFromZod(parsed.error));
  }

  const { data: existing } = await gate.supabase
    .from("proposals")
    .select("status")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (!existing) return fail("That proposal no longer exists.");

  // A sent proposal is a document the client is holding. Rewriting the scope
  // or the price underneath it would make their copy and yours disagree,
  // silently — and a proposal is the one document that gets argued over later.
  if (existing.status !== "draft") {
    return fail(
      "Only a draft can be edited. Put this back to draft first if it has not really been sent.",
    );
  }

  const { error } = await gate.supabase
    .from("proposals")
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

  revalidatePath("/proposals");
  revalidatePath(`/proposals/${parsed.data.id}`);
  return ok({ id: parsed.data.id });
}

/**
 * Moving a proposal along, and freezing the letterhead the first time it
 * leaves draft.
 */
export async function setProposalStatus(
  input: unknown,
): Promise<ActionResult<{ id: string; status: string }>> {
  const gate = await requireProposalEditor();
  if (!gate.ok) return fail(gate.error);

  const parsed = setProposalStatusSchema.safeParse(input);
  if (!parsed.success) return fail("That status is not valid.");

  const { data: proposal } = await gate.supabase
    .from("proposals")
    .select("id, status, brand_id, contact_id, issuer_snapshot, sent_at")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (!proposal) return fail("That proposal no longer exists.");

  const patch: TablesUpdate<"proposals"> = { status: parsed.data.status };

  if (parsed.data.status === "sent" && !proposal.sent_at) {
    patch.sent_at = new Date().toISOString();
  }
  if (parsed.data.status === "accepted" || parsed.data.status === "declined") {
    patch.decided_at = new Date().toISOString();
  }
  if (parsed.data.status === "draft") {
    // Back to draft means back to live details, so the snapshot is dropped
    // rather than left to contradict a proposal that is being reworked.
    patch.issuer_snapshot = null;
    patch.client_snapshot = null;
    patch.sent_at = null;
    patch.decided_at = null;
  }

  // Freeze once, on the way out of draft.
  if (parsed.data.status !== "draft" && !proposal.issuer_snapshot) {
    const [{ data: brand }, { data: contact }] = await Promise.all([
      gate.supabase
        .from("brands")
        .select(
          "name, legal_name, email, phone, website, address, bank_details, tax_id, logo_path",
        )
        .eq("id", proposal.brand_id)
        .maybeSingle(),
      proposal.contact_id
        ? gate.supabase
            .from("contacts")
            .select("type, first_name, last_name, company_name, email, phone, address")
            .eq("id", proposal.contact_id)
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
          ? [
              address.line1,
              address.line2,
              address.city,
              address.postcode,
              address.country,
            ]
              .filter(Boolean)
              .join("\n") || null
          : null,
      };
      patch.client_snapshot = client as unknown as Json;
    }
  }

  const { error } = await gate.supabase
    .from("proposals")
    .update(patch)
    .eq("id", parsed.data.id);

  if (error) return fail(error.message);

  revalidatePath("/proposals");
  revalidatePath(`/proposals/${parsed.data.id}`);
  return ok({ id: parsed.data.id, status: parsed.data.status });
}

export async function setProposalDeleted(
  input: unknown,
): Promise<ActionResult<{ id: string; deleted: boolean }>> {
  const gate = await requireProposalEditor();
  if (!gate.ok) return fail(gate.error);

  const parsed = deleteProposalSchema.safeParse(input);
  if (!parsed.success) return fail("That proposal is not valid.");

  const { error } = await gate.supabase
    .from("proposals")
    .update({
      deleted_at: parsed.data.deleted ? new Date().toISOString() : null,
    })
    .eq("id", parsed.data.id);

  // The guard trigger is what actually decides this, so its message is the
  // honest one to show rather than a guess made here.
  if (error) return fail(error.message);

  revalidatePath("/proposals");
  return ok({ id: parsed.data.id, deleted: parsed.data.deleted });
}
