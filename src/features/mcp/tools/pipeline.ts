import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import {
  DEAL_STATUSES,
  dealSchema,
  updateDealSchema,
  type DealValues,
} from "@/features/pipeline/schema";

import { limitField, pageField } from "../paging";
import { assertFound, assertOk, likePattern, pageWindow, parseWith, registerTool } from "../register-tool";

/** Same mapping as createDeal. Status and closed_at are derived from the stage. */
function toRow(values: DealValues) {
  return {
    title: values.title,
    description: values.description,
    contact_id: values.contactId,
    pipeline_id: values.pipelineId,
    stage_id: values.stageId,
    brand_id: values.brandId,
    owner_id: values.ownerId,
    expected_close_date: values.expectedCloseDate,
    amount: values.amount,
    currency: values.currency,
  };
}

const moveDealSchema = z
  .object({
    id: z.uuid(),
    stageId: z.uuid().optional().describe("Stage to move the deal to"),
    outcome: z
      .enum(["open", "won", "lost"])
      .optional()
      .describe("Used when stageId is omitted: the first active stage with that outcome"),
    position: z.number().finite().optional(),
  })
  .refine((value) => value.stageId || value.outcome, {
    message: "Provide a stageId or an outcome of open, won, or lost",
  });

export function registerPipelineTools(server: McpServer) {
  registerTool(
    server,
    "list_pipelines",
    "Pipelines in the workspace, default first.",
    z.object({}),
    { kind: "read" },
    null,
    async (ctx) => {
      const { data, error } = await ctx.db
        .from("pipelines")
        .select("id, name, brand_id, is_default, created_at")
        .order("is_default", { ascending: false })
        .order("name", { ascending: true });
      assertOk(error);
      return data ?? [];
    },
  );

  registerTool(
    server,
    "list_pipeline_stages",
    "Stages for one pipeline, in board order. is_won and is_lost are how a deal is closed.",
    z.object({ pipelineId: z.uuid() }),
    { kind: "read" },
    null,
    async (ctx, input) => {
      const { data, error } = await ctx.db
        .from("pipeline_stages")
        .select("id, pipeline_id, name, color, position, is_won, is_lost, is_active")
        .eq("pipeline_id", input.pipelineId)
        .order("position", { ascending: true });
      assertOk(error);
      return data ?? [];
    },
  );

  registerTool(
    server,
    "search_deals",
    "Search deals by title. amount is a major-unit decimal, not minor units. Deleted deals are omitted.",
    z.object({
      q: z.string().trim().max(120).optional(),
      pipelineId: z.uuid().optional(),
      status: z.enum(DEAL_STATUSES).optional(),
      page: pageField,
      limit: limitField,
    }),
    { kind: "read" },
    null,
    async (ctx, input) => {
      const { from, to } = pageWindow(input.page, input.limit);
      let query = ctx.db
        .from("deals")
        .select(
          "id, title, status, stage_id, pipeline_id, contact_id, brand_id, owner_id, amount, currency, expected_close_date, updated_at",
          { count: "exact" },
        )
        .is("deleted_at", null);
      if (input.q) query = query.ilike("title", likePattern(input.q));
      if (input.pipelineId) query = query.eq("pipeline_id", input.pipelineId);
      if (input.status) query = query.eq("status", input.status);
      const { data, error, count } = await query
        .order("updated_at", { ascending: false })
        .range(from, to);
      assertOk(error);
      return { deals: data ?? [], total: count ?? 0, page: input.page, limit: input.limit };
    },
  );

  registerTool(
    server,
    "get_deal",
    "One deal, plus the latest stage-history row. Status follows the stage (won, lost, or open).",
    z.object({ id: z.uuid() }),
    { kind: "read" },
    "deal",
    async (ctx, input) => {
      const { data, error } = await ctx.db
        .from("deals")
        .select(
          "id, title, description, status, stage_id, pipeline_id, contact_id, brand_id, owner_id, amount, currency, expected_close_date, closed_at, position, created_at, updated_at",
        )
        .eq("id", input.id)
        .is("deleted_at", null)
        .maybeSingle();
      assertOk(error);
      assertFound(data, "deal");
      const deal = data;

      const { data: history, error: historyError } = await ctx.db
        .from("deal_stage_history")
        .select("id, from_stage_id, to_stage_id, changed_by, changed_at")
        .eq("deal_id", deal.id)
        .order("changed_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      assertOk(historyError);
      return { ...deal, latest_stage_change: history };
    },
  );

  registerTool(
    server,
    "create_deal",
    "Create a deal on an existing contact, pipeline, and stage. Do not send status: moving the stage is what marks it won or lost, and that writes deal_stage_history. amount is a major-unit number such as 1500.50. currency defaults to USD when omitted.",
    dealSchema,
    { kind: "write", resource: "deal", action: "create" },
    "deal",
    async (ctx, input) => {
      const values = parseWith(dealSchema, input);
      const { data, error } = await ctx.db
        .from("deals")
        .insert({
          ...toRow(values),
          workspace_id: ctx.profile.workspace_id,
          created_by: ctx.profile.id,
        })
        .select("id, status, stage_id")
        .single();
      assertOk(error);
      return data;
    },
  );

  registerTool(
    server,
    "update_deal",
    "Replace a deal's editable fields. Pass id and values; values matches create_deal. Does not change stage — use move_deal for that, so stage history stays accurate. Does not delete.",
    updateDealSchema,
    { kind: "write", resource: "deal", action: "update" },
    "deal",
    async (ctx, input) => {
      const parsed = parseWith(updateDealSchema, input);
      const { data, error } = await ctx.db
        .from("deals")
        .update(toRow(parsed.values))
        .eq("id", parsed.id)
        .eq("workspace_id", ctx.profile.workspace_id)
        .select("id, status, stage_id")
        .maybeSingle();
      assertOk(error);
      assertFound(data, "deal");
      return data;
    },
  );

  registerTool(
    server,
    "move_deal",
    "Move a deal to another stage. The database writes deal_stage_history and sets status to won, lost, or open from that stage. Pass stageId, or an outcome and the first matching active stage is used. Omit position to keep the current order.",
    moveDealSchema,
    { kind: "write", resource: "deal", action: "update" },
    "deal",
    async (ctx, input) => {
      const parsed = parseWith(moveDealSchema, input);
      const { data: deal, error: dealError } = await ctx.db
        .from("deals")
        .select("id, pipeline_id, position")
        .eq("id", parsed.id)
        .eq("workspace_id", ctx.profile.workspace_id)
        .is("deleted_at", null)
        .maybeSingle();
      assertOk(dealError);
      assertFound(deal, "deal");

      let stageId = parsed.stageId ?? null;
      if (!stageId && parsed.outcome) {
        const { data: stages, error: stageError } = await ctx.db
          .from("pipeline_stages")
          .select("id, is_won, is_lost, is_active")
          .eq("pipeline_id", deal.pipeline_id)
          .eq("is_active", true)
          .order("position", { ascending: true });
        assertOk(stageError);
        const match = (stages ?? []).find((stage) => {
          if (parsed.outcome === "won") return stage.is_won;
          if (parsed.outcome === "lost") return stage.is_lost;
          return !stage.is_won && !stage.is_lost;
        });
        if (!match) throw new Error("That pipeline has no active stage for that outcome.");
        stageId = match.id;
      }
      if (!stageId) throw new Error("Provide a stageId or an outcome.");

      const patch: { stage_id: string; position?: number } = { stage_id: stageId };
      if (parsed.position !== undefined) patch.position = parsed.position;

      const { data, error } = await ctx.db
        .from("deals")
        .update(patch)
        .eq("id", parsed.id)
        .eq("workspace_id", ctx.profile.workspace_id)
        .select("id, status, stage_id, closed_at, position")
        .maybeSingle();
      assertOk(error);
      assertFound(data, "deal");
      return data;
    },
  );
}
