import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import {
  BUCKETS,
  TRANSACTION_KINDS,
  categorySchema,
  transactionSchema,
  updateTransactionSchema,
  type TransactionValues,
} from "@/features/finance/schema";

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

const dateField = (label: string) =>
  z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be YYYY-MM-DD`);

const mcpTransactionSchema = transactionSchema.extend({
  amount: z
    .union([z.string(), z.number()])
    .describe("Amount in major units, for example 2500 or \"2500.50\". Not poisha."),
});

const mcpUpdateSchema = mcpTransactionSchema.extend({ id: z.uuid() });

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

const summarySchema = z
  .object({
    from: dateField("from"),
    to: dateField("to"),
    bucket: z.enum(BUCKETS).default("month"),
  })
  .refine((value) => value.from <= value.to, { message: "from must be on or before to" })
  .refine(
    (value) => Date.parse(value.to) - Date.parse(value.from) <= 366 * 3 * 86_400_000,
    { message: "Ask for at most three years at a time" },
  );

export function registerFinanceTools(server: McpServer) {
  registerTool(
    server,
    "search_transactions",
    "Search the finance ledger. Requires the finance scope and finance access. amount_poisha is minor units (divide by 100). The ledger is taka and is not converted.",
    z.object({
      q: z.string().trim().max(120).optional(),
      kind: z.enum(TRANSACTION_KINDS).optional(),
      from: dateField("from").optional(),
      to: dateField("to").optional(),
      page: pageField,
      limit: limitField,
    }),
    { kind: "finance-read" },
    null,
    async (ctx, input) => {
      const { from, to } = pageWindow(input.page, input.limit);
      let query = ctx.db
        .from("transactions")
        .select(
          "id, kind, amount_poisha, occurred_on, category_id, brand_id, project_id, contact_id, payment_method, reference, description, created_at",
          { count: "exact" },
        )
        .is("deleted_at", null);
      if (input.q) {
        const pattern = likePattern(input.q);
        query = query.or(`description.ilike.${pattern},reference.ilike.${pattern}`);
      }
      if (input.kind) query = query.eq("kind", input.kind);
      if (input.from) query = query.gte("occurred_on", input.from);
      if (input.to) query = query.lte("occurred_on", input.to);
      const { data, error, count } = await query
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, to);
      assertOk(error);
      return { transactions: data ?? [], total: count ?? 0, page: input.page, limit: input.limit };
    },
  );

  registerTool(
    server,
    "get_transaction",
    "One ledger row. amount_poisha is minor units. Requires finance scope and finance access.",
    z.object({ id: z.uuid() }),
    { kind: "finance-read" },
    "transaction",
    async (ctx, input) => {
      const { data, error } = await ctx.db
        .from("transactions")
        .select(
          "id, kind, amount_poisha, occurred_on, category_id, brand_id, project_id, contact_id, payment_method, reference, description, created_at, updated_at",
        )
        .eq("id", input.id)
        .is("deleted_at", null)
        .maybeSingle();
      assertOk(error);
      assertFound(data, "transaction");
      return data;
    },
  );

  registerTool(
    server,
    "list_transaction_categories",
    "Active income and expense categories. Requires finance scope and finance access.",
    z.object({}),
    { kind: "finance-read" },
    null,
    async (ctx) => {
      const { data, error } = await ctx.db
        .from("transaction_categories")
        .select("id, kind, name, position")
        .eq("is_active", true)
        .order("kind", { ascending: true })
        .order("position", { ascending: true });
      assertOk(error);
      return data ?? [];
    },
  );

  registerTool(
    server,
    "create_transaction",
    "Add an income or expense. Requires finance scope and finance access. amount is major units (\"2500.50\"), stored as poisha. paymentMethod is cash, bank_transfer, card, mobile_banking, cheque, or other. kind is income or expense. Same validation as the finance form.",
    mcpTransactionSchema,
    { kind: "finance-write" },
    "transaction",
    async (ctx, input) => {
      const values = parseWith(transactionSchema, coerceMoneyInput(input));
      const { data, error } = await ctx.db
        .from("transactions")
        .insert({
          ...toRow(values),
          workspace_id: ctx.profile.workspace_id,
          created_by: ctx.profile.id,
        })
        .select("id, amount_poisha")
        .single();
      assertOk(error);
      return data;
    },
  );

  registerTool(
    server,
    "update_transaction",
    "Replace a ledger row. amount is major units, same as create_transaction. Does not delete.",
    mcpUpdateSchema,
    { kind: "finance-write" },
    "transaction",
    async (ctx, input) => {
      const parsed = parseWith(updateTransactionSchema, coerceMoneyInput(input));
      const { id, ...values } = parsed;
      const { data, error } = await ctx.db
        .from("transactions")
        .update(toRow(values))
        .eq("id", id)
        .eq("workspace_id", ctx.profile.workspace_id)
        .select("id, amount_poisha")
        .maybeSingle();
      assertOk(error);
      assertFound(data, "transaction");
      return data;
    },
  );

  registerTool(
    server,
    "create_transaction_category",
    "Add an income or expense category. A duplicate name for the same kind is refused. Requires finance scope and finance access.",
    categorySchema,
    { kind: "finance-write" },
    "transaction_category",
    async (ctx, input) => {
      const values = parseWith(categorySchema, input);
      const { data, error } = await ctx.db
        .from("transaction_categories")
        .insert({
          workspace_id: ctx.profile.workspace_id,
          kind: values.kind,
          name: values.name,
          created_by: ctx.profile.id,
        })
        .select("id")
        .single();
      if (error?.code === "23505") throw new Error("That category already exists.");
      assertOk(error);
      return data;
    },
  );

  registerTool(
    server,
    "finance_summary",
    "Totals from finance_series, finance_by_category, and finance_by_project. All figures are integer poisha (divide by 100). from and to are YYYY-MM-DD, at most three years. bucket is week, month, or year. Requires finance scope and finance access.",
    summarySchema,
    { kind: "finance-read" },
    null,
    async (ctx, input) => {
      const parsed = parseWith(summarySchema, input);
      const [series, byCategory, byProject] = await Promise.all([
        ctx.db.rpc("finance_series", {
          p_from: parsed.from,
          p_to: parsed.to,
          p_bucket: parsed.bucket,
        }),
        ctx.db.rpc("finance_by_category", { p_from: parsed.from, p_to: parsed.to }),
        ctx.db.rpc("finance_by_project", { p_from: parsed.from, p_to: parsed.to }),
      ]);
      assertOk(series.error);
      assertOk(byCategory.error);
      assertOk(byProject.error);
      return {
        unit: "poisha",
        minor_per_major: 100,
        from: parsed.from,
        to: parsed.to,
        bucket: parsed.bucket,
        series: series.data ?? [],
        by_category: byCategory.data ?? [],
        by_project: byProject.data ?? [],
      };
    },
  );
}
