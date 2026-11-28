import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import type { McpContext } from "../context";
import { assertOk } from "../register-tool";
import { registerTool } from "../register-tool";

const limit = z.number().int().min(1).max(50).default(20);

export function registerDashboardTools(server: McpServer) {
  registerTool(
    server,
    "get_dashboard_counts",
    "Workspace totals from the same views as the dashboard: active projects, open deals, contacts, tasks due today, and overdue tasks.",
    z.object({}),
    { kind: "read" },
    null,
    async (ctx) => {
      const { data, error } = await ctx.db.from("v_dashboard_counts").select("*").maybeSingle();
      assertOk(error);
      return {
        active_projects: Number(data?.active_projects ?? 0),
        open_deals: Number(data?.open_deals ?? 0),
        contacts: Number(data?.contacts ?? 0),
        tasks_due_today: Number(data?.tasks_due_today ?? 0),
        tasks_overdue: Number(data?.tasks_overdue ?? 0),
      };
    },
  );

  registerTool(
    server,
    "list_deals_by_stage",
    "Deal counts per pipeline stage, in board order. Optionally one pipeline.",
    z.object({ pipelineId: z.uuid().optional() }),
    { kind: "read" },
    null,
    async (ctx, input) => {
      let query = ctx.db.from("v_deals_by_stage").select("*").order("position", { ascending: true });
      if (input.pipelineId) query = query.eq("pipeline_id", input.pipelineId);
      const { data, error } = await query;
      assertOk(error);
      return data ?? [];
    },
  );

  registerTool(
    server,
    "list_projects_at_risk",
    "Projects past their due date and not completed or cancelled, most overdue first.",
    z.object({ limit }),
    { kind: "read" },
    null,
    async (ctx, input) => {
      const { data, error } = await ctx.db
        .from("v_projects_at_risk")
        .select("id, name, code, due_date, owner_id, days_overdue")
        .order("days_overdue", { ascending: false })
        .limit(input.limit);
      assertOk(error);
      return data ?? [];
    },
  );

  registerTool(
    server,
    "list_recent_activity",
    "Latest rows from the activity feed (contacts, deals, projects, tasks). Not the MCP audit log.",
    z.object({ limit }),
    { kind: "read" },
    null,
    async (ctx, input) => {
      const { data, error } = await ctx.db
        .from("v_recent_activity")
        .select("id, entity_type, entity_id, action, changes, created_at, actor_name")
        .order("created_at", { ascending: false })
        .limit(input.limit);
      assertOk(error);
      return data ?? [];
    },
  );

  registerTool(
    server,
    "list_my_tasks",
    "Open tasks assigned to the profile this key acts as, soonest due date first.",
    z.object({ limit }),
    { kind: "read" },
    null,
    async (ctx, input) => listMyTasks(ctx, input.limit),
  );

  registerTool(
    server,
    "list_team_members",
    "Active people in the workspace: id, name, email, role, and job title. Use the id as an owner or assignee. Does not include finance access.",
    z.object({}),
    { kind: "read" },
    null,
    async (ctx) => {
      const { data, error } = await ctx.db
        .from("profiles")
        .select("id, full_name, email, role, job_title, status")
        .eq("status", "active")
        .order("full_name", { ascending: true })
        .limit(200);
      assertOk(error);
      return data ?? [];
    },
  );
}

async function listMyTasks(ctx: McpContext, rowLimit: number) {
  const { data, error } = await ctx.db
    .from("v_my_tasks")
    .select("id, title, status, priority, due_at, project_id, user_id")
    .eq("user_id", ctx.profile.id)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(rowLimit);
  assertOk(error);
  return data ?? [];
}
