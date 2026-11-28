import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import {
  RENEWAL_STATUSES,
  advanceRenewalSchema,
  renewalSchema,
  updateRenewalSchema,
  type RenewalValues,
} from "@/features/renewals/schema";

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
  z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .describe(`${label} in major units, for example 1500 or "1500.50". Omit when unknown.`);

const mcpRenewalSchema = renewalSchema.safeExtend({
  price: major("Price"),
  cost: major("Cost"),
} as never);

const mcpUpdateSchema = z.object({
  id: z.uuid(),
  values: mcpRenewalSchema,
});

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

const RENEWAL_COLUMNS =
  "id, name, category, vendor, status, cycle, contact_id, project_id, brand_id, started_on, next_renewal_on, last_renewed_on, currency, price_minor, cost_minor, auto_renew, reminder_days, login_url, notes, created_at, updated_at";

export function registerRenewalTools(server: McpServer) {
  registerTool(
    server,
    "search_renewals",
    "Search renewals by name. price_minor and cost_minor are minor units. Deleted renewals are omitted.",
    z.object({
      q: z.string().trim().max(120).optional(),
      status: z.enum(RENEWAL_STATUSES).optional(),
      page: pageField,
      limit: limitField,
    }),
    { kind: "read" },
    null,
    async (ctx, input) => {
      const { from, to } = pageWindow(input.page, input.limit);
      let query = ctx.db
        .from("renewals")
        .select(RENEWAL_COLUMNS, { count: "exact" })
        .is("deleted_at", null);
      if (input.q) query = query.ilike("name", likePattern(input.q));
      if (input.status) query = query.eq("status", input.status);
      const { data, error, count } = await query
        .order("next_renewal_on", { ascending: true })
        .range(from, to);
      assertOk(error);
      return { renewals: data ?? [], total: count ?? 0, page: input.page, limit: input.limit };
    },
  );

  registerTool(
    server,
    "get_renewal",
    "One renewal. price_minor and cost_minor are minor units (divide by 100).",
    z.object({ id: z.uuid() }),
    { kind: "read" },
    "renewal",
    async (ctx, input) => {
      const { data, error } = await ctx.db
        .from("renewals")
        .select(RENEWAL_COLUMNS)
        .eq("id", input.id)
        .is("deleted_at", null)
        .maybeSingle();
      assertOk(error);
      assertFound(data, "renewal");
      return data;
    },
  );

  registerTool(
    server,
    "create_renewal",
    "Create a renewal. price and cost are major units (or omit them). category is hosting, domain, tool, ssl, email, maintenance, or other. cycle is monthly, quarterly, half_yearly, yearly, or biennial. Same validation as the renewal form.",
    mcpRenewalSchema,
    { kind: "write", resource: "project", action: "update" },
    "renewal",
    async (ctx, input) => {
      const values = parseWith(renewalSchema, coerceMoneyInput(input));
      const { data, error } = await ctx.db
        .from("renewals")
        .insert({
          ...toRow(values),
          workspace_id: ctx.profile.workspace_id,
          created_by: ctx.profile.id,
        })
        .select("id")
        .single();
      assertOk(error);
      return data;
    },
  );

  registerTool(
    server,
    "update_renewal",
    "Replace a renewal's fields. Pass id and values; values matches create_renewal. price and cost are major units. Does not delete.",
    mcpUpdateSchema,
    { kind: "write", resource: "project", action: "update" },
    "renewal",
    async (ctx, input) => {
      const parsed = parseWith(updateRenewalSchema, {
        id: input.id,
        values: coerceMoneyInput(input.values),
      });
      const { data, error } = await ctx.db
        .from("renewals")
        .update(toRow(parsed.values))
        .eq("id", parsed.id)
        .eq("workspace_id", ctx.profile.workspace_id)
        .select("id")
        .maybeSingle();
      assertOk(error);
      assertFound(data, "renewal");
      return data;
    },
  );

  registerTool(
    server,
    "mark_renewal_renewed",
    "Roll a renewal forward by one cycle. The next date is computed in Postgres (advance_renewal), which is what the Renewed button calls.",
    advanceRenewalSchema,
    { kind: "write", resource: "project", action: "update" },
    "renewal",
    async (ctx, input) => {
      const parsed = parseWith(advanceRenewalSchema, input);
      const { data, error } = await ctx.db.rpc("advance_renewal", { p_id: parsed.id });
      assertOk(error);
      return { id: parsed.id, next_renewal_on: data };
    },
  );
}
