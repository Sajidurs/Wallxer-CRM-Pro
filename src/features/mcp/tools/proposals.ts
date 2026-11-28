import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import {
  PROPOSAL_STATUSES,
  proposalItemSchema,
  proposalSchema,
  setProposalStatusSchema,
  updateProposalSchema,
  type ClientSnapshot,
  type IssuerSnapshot,
  type ProposalValues,
} from "@/features/proposals/schema";
import type { Json, TablesUpdate } from "@/types/database.types";

import type { McpContext } from "../context";
import { limitField, pageField } from "../paging";
import {
  assertFound,
  assertOk,
  coerceMoneyInput,
  likePattern,
  pageWindow,
  parseWith,
  registerTool,
} from "../register-tool";

const major = (label: string) =>
  z.union([z.string(), z.number()]).describe(`${label} in major units, for example 1500 or "1500.50"`);

const mcpItemSchema = proposalItemSchema.extend({
  quantity: z.union([z.string(), z.number()]).describe("Quantity, for example 1 or 1.5"),
  unitAmount: major("Rate"),
});

const mcpProposalSchema = proposalSchema.safeExtend({
  items: z.array(mcpItemSchema),
} as never);

const mcpUpdateSchema = z.object({
  id: z.uuid(),
  values: mcpProposalSchema,
});

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

async function writeItems(
  ctx: McpContext,
  proposalId: string,
  items: ProposalValues["items"],
) {
  const { error: deleteError } = await ctx.db
    .from("proposal_items")
    .delete()
    .eq("proposal_id", proposalId);
  assertOk(deleteError);
  if (items.length === 0) return;

  const { error } = await ctx.db.from("proposal_items").insert(
    items.map((item, index) => ({
      workspace_id: ctx.profile.workspace_id,
      proposal_id: proposalId,
      description: item.description,
      quantity: item.quantity,
      unit_amount_minor: item.unitAmount,
      position: index,
    })),
  );
  assertOk(error);
}

export function registerProposalTools(server: McpServer) {
  registerTool(
    server,
    "search_proposals",
    "Search proposals by title or number. Line amounts are minor units in results.",
    z.object({
      q: z.string().trim().max(120).optional(),
      status: z.enum(PROPOSAL_STATUSES).optional(),
      page: pageField,
      limit: limitField,
    }),
    { kind: "read" },
    null,
    async (ctx, input) => {
      const { from, to } = pageWindow(input.page, input.limit);
      let query = ctx.db
        .from("proposals")
        .select(
          "id, number, title, status, brand_id, contact_id, project_id, currency, issue_date, valid_until, total_minor, updated_at",
          { count: "exact" },
        )
        .is("deleted_at", null);
      if (input.q) {
        const pattern = likePattern(input.q);
        query = query.or(`title.ilike.${pattern},number.ilike.${pattern}`);
      }
      if (input.status) query = query.eq("status", input.status);
      const { data, error, count } = await query
        .order("updated_at", { ascending: false })
        .range(from, to);
      assertOk(error);
      return { proposals: data ?? [], total: count ?? 0, page: input.page, limit: input.limit };
    },
  );

  registerTool(
    server,
    "get_proposal",
    "One proposal and its lines. unit_amount_minor and total_minor are minor units (divide by 100).",
    z.object({ id: z.uuid() }),
    { kind: "read" },
    "proposal",
    async (ctx, input) => loadProposal(ctx, input.id),
  );

  registerTool(
    server,
    "create_proposal",
    "Create a draft proposal. Money fields (unitAmount) are major units: 1500 or \"1500.50\", never minor units. currency is BDT, USD, EUR, or GBP. items may be empty. Same validation as the proposal form. A number is allocated with next_proposal_number.",
    mcpProposalSchema,
    { kind: "write", resource: "project", action: "update" },
    "proposal",
    async (ctx, input) => {
      const values = parseWith(proposalSchema, coerceMoneyInput(input));
      const { data: number, error: numberError } = await ctx.db.rpc("next_proposal_number", {
        p_brand_id: values.brandId,
      });
      if (numberError || !number) {
        throw new Error(numberError?.message ?? "Could not allocate a proposal number.");
      }

      const { data, error } = await ctx.db
        .from("proposals")
        .insert({
          ...toRow(values),
          number,
          workspace_id: ctx.profile.workspace_id,
          created_by: ctx.profile.id,
        })
        .select("id, number")
        .single();
      assertOk(error);
      assertFound(data, "proposal");
      await writeItems(ctx, data.id, values.items);
      return data;
    },
  );

  registerTool(
    server,
    "update_proposal",
    "Replace a draft proposal, including its lines. Only a draft can be edited. Money fields are major units, same as create_proposal. Does not delete the proposal.",
    mcpUpdateSchema,
    { kind: "write", resource: "project", action: "update" },
    "proposal",
    async (ctx, input) => {
      const parsed = parseWith(updateProposalSchema, {
        id: input.id,
        values: coerceMoneyInput(input.values),
      });
      const { data: existing, error: existingError } = await ctx.db
        .from("proposals")
        .select("status")
        .eq("id", parsed.id)
        .eq("workspace_id", ctx.profile.workspace_id)
        .maybeSingle();
      assertOk(existingError);
      assertFound(existing, "proposal");
      if (existing.status !== "draft") {
        throw new Error(
          "Only a draft can be edited. Put this back to draft first if it has not really been sent.",
        );
      }

      const { error } = await ctx.db
        .from("proposals")
        .update(toRow(parsed.values))
        .eq("id", parsed.id)
        .eq("workspace_id", ctx.profile.workspace_id);
      assertOk(error);
      await writeItems(ctx, parsed.id, parsed.values.items);
      return { id: parsed.id };
    },
  );

  registerTool(
    server,
    "set_proposal_status",
    "Move a proposal between draft, sent, accepted, and declined. Leaving draft freezes the letterhead and client onto the proposal, the same way the app does.",
    setProposalStatusSchema,
    { kind: "write", resource: "project", action: "update" },
    "proposal",
    async (ctx, input) => {
      const parsed = parseWith(setProposalStatusSchema, input);
      await applyProposalStatus(ctx, parsed.id, parsed.status);
      return { id: parsed.id, status: parsed.status };
    },
  );
}

async function loadProposal(ctx: McpContext, id: string) {
  const { data, error } = await ctx.db
    .from("proposals")
    .select(
      "id, number, title, status, brand_id, contact_id, project_id, currency, issue_date, valid_until, overview, scope, deliverables, timeline, investment, terms, tax_rate, tax_label, subtotal_minor, tax_minor, total_minor, sent_at, decided_at, issuer_snapshot, client_snapshot, created_at, updated_at",
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  assertOk(error);
  assertFound(data, "proposal");
      const proposal = data;
  const { data: items, error: itemError } = await ctx.db
    .from("proposal_items")
    .select("id, description, quantity, unit_amount_minor, amount_minor, position")
    .eq("proposal_id", id)
    .order("position", { ascending: true });
  assertOk(itemError);
  return { ...proposal, items: items ?? [] };
}

/**
 * Same transition as setProposalStatus in features/proposals/actions.ts:
 * freeze the letterhead the first time it leaves draft, and clear it on the
 * way back.
 */
async function applyProposalStatus(
  ctx: McpContext,
  id: string,
  status: (typeof PROPOSAL_STATUSES)[number],
) {
  const { data: proposal, error } = await ctx.db
    .from("proposals")
    .select("id, status, brand_id, contact_id, issuer_snapshot, sent_at")
    .eq("id", id)
    .eq("workspace_id", ctx.profile.workspace_id)
    .maybeSingle();
  assertOk(error);
  assertFound(proposal, "proposal");

  const patch: TablesUpdate<"proposals"> = { status };
  if (status === "sent" && !proposal.sent_at) patch.sent_at = new Date().toISOString();
  if (status === "accepted" || status === "declined") patch.decided_at = new Date().toISOString();
  if (status === "draft") {
    patch.issuer_snapshot = null;
    patch.client_snapshot = null;
    patch.sent_at = null;
    patch.decided_at = null;
  }

  if (status !== "draft" && !proposal.issuer_snapshot) {
    const [{ data: brand }, { data: contact }] = await Promise.all([
      ctx.db
        .from("brands")
        .select("name, legal_name, email, phone, website, address, bank_details, tax_id, logo_path")
        .eq("id", proposal.brand_id)
        .maybeSingle(),
      proposal.contact_id
        ? ctx.db
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

  const { error: updateError } = await ctx.db
    .from("proposals")
    .update(patch)
    .eq("id", id)
    .eq("workspace_id", ctx.profile.workspace_id);
  assertOk(updateError);
}
