import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import {
  INVOICE_STATUSES,
  invoiceItemSchema,
  invoiceSchema,
  setInvoiceStatusSchema,
  updateInvoiceSchema,
  type ClientSnapshot,
  type InvoiceValues,
  type IssuerSnapshot,
} from "@/features/invoices/schema";
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

const mcpItemSchema = invoiceItemSchema.extend({
  quantity: z.union([z.string(), z.number()]).describe("Quantity, for example 1 or 1.5"),
  unitAmount: major("Rate"),
});

const mcpInvoiceSchema = invoiceSchema.safeExtend({
  items: z.array(mcpItemSchema).min(1, "An invoice needs at least one line"),
  // safeExtend's types refuse to replace a key; the runtime method is what
  // lets unit amounts stay major units until invoiceSchema parses them.
} as never);

const mcpUpdateSchema = z.object({
  id: z.uuid(),
  values: mcpInvoiceSchema,
});

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

async function writeItems(ctx: McpContext, invoiceId: string, items: InvoiceValues["items"]) {
  const { error: deleteError } = await ctx.db.from("invoice_items").delete().eq("invoice_id", invoiceId);
  assertOk(deleteError);

  const { error } = await ctx.db.from("invoice_items").insert(
    items.map((item, index) => ({
      workspace_id: ctx.profile.workspace_id,
      invoice_id: invoiceId,
      description: item.description,
      quantity: item.quantity,
      unit_amount_minor: item.unitAmount,
      position: index,
    })),
  );
  assertOk(error);
}

export function registerInvoiceTools(server: McpServer) {
  registerTool(
    server,
    "search_invoices",
    "Search invoices by number. Requires the finance scope and finance access on the linked profile. Amounts in results are minor units.",
    z.object({
      q: z.string().trim().max(120).optional(),
      status: z.enum(INVOICE_STATUSES).optional(),
      page: pageField,
      limit: limitField,
    }),
    { kind: "finance-read" },
    null,
    async (ctx, input) => {
      const { from, to } = pageWindow(input.page, input.limit);
      let query = ctx.db
        .from("invoices")
        .select(
          "id, number, status, brand_id, contact_id, project_id, currency, issue_date, due_date, total_minor, updated_at",
          { count: "exact" },
        )
        .is("deleted_at", null);
      if (input.q) query = query.ilike("number", likePattern(input.q));
      if (input.status) query = query.eq("status", input.status);
      const { data, error, count } = await query
        .order("issue_date", { ascending: false })
        .range(from, to);
      assertOk(error);
      return { invoices: data ?? [], total: count ?? 0, page: input.page, limit: input.limit };
    },
  );

  registerTool(
    server,
    "get_invoice",
    "One invoice and its lines. unit_amount_minor and total_minor are minor units (divide by 100). Requires finance scope and finance access.",
    z.object({ id: z.uuid() }),
    { kind: "finance-read" },
    "invoice",
    async (ctx, input) => {
      const { data, error } = await ctx.db
        .from("invoices")
        .select(
          "id, number, status, brand_id, contact_id, project_id, currency, issue_date, due_date, tax_rate, tax_label, notes, terms, subtotal_minor, tax_minor, total_minor, sent_at, paid_at, issuer_snapshot, client_snapshot, created_at, updated_at",
        )
        .eq("id", input.id)
        .is("deleted_at", null)
        .maybeSingle();
      assertOk(error);
      assertFound(data, "invoice");
      const invoice = data;
      const { data: items, error: itemError } = await ctx.db
        .from("invoice_items")
        .select("id, description, quantity, unit_amount_minor, amount_minor, position")
        .eq("invoice_id", input.id)
        .order("position", { ascending: true });
      assertOk(itemError);
      return { ...invoice, items: items ?? [] };
    },
  );

  registerTool(
    server,
    "create_invoice",
    "Create a draft invoice. Requires finance scope and finance access. unitAmount is major units (1500 or \"1500.50\"), not minor units. currency is BDT, USD, EUR, or GBP. At least one line. The number comes from next_invoice_number. Sending it does not write the finance ledger.",
    mcpInvoiceSchema,
    { kind: "finance-write" },
    "invoice",
    async (ctx, input) => {
      const values = parseWith(invoiceSchema, coerceMoneyInput(input));
      const { data: number, error: numberError } = await ctx.db.rpc("next_invoice_number", {
        p_brand_id: values.brandId,
      });
      if (numberError || !number) {
        throw new Error(numberError?.message ?? "Could not allocate an invoice number.");
      }

      const { data, error } = await ctx.db
        .from("invoices")
        .insert({
          ...toRow(values),
          number,
          workspace_id: ctx.profile.workspace_id,
          created_by: ctx.profile.id,
        })
        .select("id, number")
        .single();
      assertOk(error);
      assertFound(data, "invoice");
      await writeItems(ctx, data.id, values.items);
      return data;
    },
  );

  registerTool(
    server,
    "update_invoice",
    "Replace a draft invoice, including its lines. Only a draft can be edited. Money fields are major units, same as create_invoice. Does not delete the invoice and does not write the ledger.",
    mcpUpdateSchema,
    { kind: "finance-write" },
    "invoice",
    async (ctx, input) => {
      const parsed = parseWith(updateInvoiceSchema, {
        id: input.id,
        values: coerceMoneyInput(input.values),
      });
      const { data: existing, error: existingError } = await ctx.db
        .from("invoices")
        .select("status")
        .eq("id", parsed.id)
        .eq("workspace_id", ctx.profile.workspace_id)
        .maybeSingle();
      assertOk(existingError);
      assertFound(existing, "invoice");
      if (existing.status !== "draft") {
        throw new Error(
          "Only a draft can be edited. Put this back to draft first if it has not really been sent.",
        );
      }

      const { error } = await ctx.db
        .from("invoices")
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
    "set_invoice_status",
    "Move an invoice between draft, sent, paid, and cancelled. Leaving draft freezes the letterhead. Paying it does not create a finance transaction.",
    setInvoiceStatusSchema,
    { kind: "finance-write" },
    "invoice",
    async (ctx, input) => {
      const parsed = parseWith(setInvoiceStatusSchema, input);
      await applyInvoiceStatus(ctx, parsed.id, parsed.status);
      return { id: parsed.id, status: parsed.status };
    },
  );
}

/**
 * Same transition as setInvoiceStatus in features/invoices/actions.ts.
 */
async function applyInvoiceStatus(
  ctx: McpContext,
  id: string,
  status: (typeof INVOICE_STATUSES)[number],
) {
  const { data: invoice, error } = await ctx.db
    .from("invoices")
    .select("id, status, brand_id, contact_id, issuer_snapshot, sent_at")
    .eq("id", id)
    .eq("workspace_id", ctx.profile.workspace_id)
    .maybeSingle();
  assertOk(error);
  assertFound(invoice, "invoice");

  const patch: TablesUpdate<"invoices"> = { status };
  if (status === "sent" && !invoice.sent_at) patch.sent_at = new Date().toISOString();
  if (status === "paid") patch.paid_at = new Date().toISOString();
  if (status === "draft") {
    patch.issuer_snapshot = null;
    patch.client_snapshot = null;
    patch.sent_at = null;
    patch.paid_at = null;
  }

  if (status !== "draft" && !invoice.issuer_snapshot) {
    const [{ data: brand }, { data: contact }] = await Promise.all([
      ctx.db
        .from("brands")
        .select("name, legal_name, email, phone, website, address, bank_details, tax_id, logo_path")
        .eq("id", invoice.brand_id)
        .maybeSingle(),
      invoice.contact_id
        ? ctx.db
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
    .from("invoices")
    .update(patch)
    .eq("id", id)
    .eq("workspace_id", ctx.profile.workspace_id);
  assertOk(updateError);
}
