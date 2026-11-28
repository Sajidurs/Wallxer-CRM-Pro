import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import {
  PROJECT_STATUSES,
  projectSchema,
  updateProjectSchema,
  websiteSchema,
  type ProjectValues,
} from "@/features/projects/schema";

import { limitField, pageField } from "../paging";
import { assertFound, assertOk, likePattern, pageWindow, parseWith, registerTool } from "../register-tool";

function toRow(values: ProjectValues) {
  return {
    name: values.name,
    code: values.code ? values.code.toUpperCase() : null,
    description: values.description,
    status: values.status,
    contact_id: values.contactId,
    brand_id: values.brandId,
    owner_id: values.ownerId,
    start_date: values.startDate,
    due_date: values.dueDate,
  };
}

function friendlyError(message: string, code?: string) {
  if (code === "23505" && message.includes("projects_workspace_code_key")) {
    return "Another project already uses that code.";
  }
  return message;
}

export function registerProjectTools(server: McpServer) {
  registerTool(
    server,
    "search_projects",
    "Search projects by name. Deleted projects are omitted.",
    z.object({
      q: z.string().trim().max(120).optional(),
      status: z.enum(PROJECT_STATUSES).optional(),
      page: pageField,
      limit: limitField,
    }),
    { kind: "read" },
    null,
    async (ctx, input) => {
      const { from, to } = pageWindow(input.page, input.limit);
      let query = ctx.db
        .from("projects")
        .select(
          "id, name, code, status, contact_id, brand_id, owner_id, start_date, due_date, updated_at",
          { count: "exact" },
        )
        .is("deleted_at", null);
      if (input.q) query = query.ilike("name", likePattern(input.q));
      if (input.status) query = query.eq("status", input.status);
      const { data, error, count } = await query
        .order("updated_at", { ascending: false })
        .range(from, to);
      assertOk(error);
      return { projects: data ?? [], total: count ?? 0, page: input.page, limit: input.limit };
    },
  );

  registerTool(
    server,
    "get_project",
    "One project and its website links. Deleted projects are not returned.",
    z.object({ id: z.uuid() }),
    { kind: "read" },
    "project",
    async (ctx, input) => {
      const { data, error } = await ctx.db
        .from("projects")
        .select(
          "id, name, code, description, status, contact_id, brand_id, owner_id, deal_id, start_date, due_date, created_at, updated_at",
        )
        .eq("id", input.id)
        .is("deleted_at", null)
        .maybeSingle();
      assertOk(error);
      assertFound(data, "project");
      const project = data;

      const { data: websites, error: siteError } = await ctx.db
        .from("project_websites")
        .select("id, label, url, environment, notes, created_at")
        .eq("project_id", project.id)
        .order("created_at", { ascending: true });
      assertOk(siteError);
      return { ...project, websites: websites ?? [] };
    },
  );

  registerTool(
    server,
    "create_project",
    "Create a project. status is planning, active, on_hold, completed, or cancelled. code is unique in the workspace. Uses the same validation as the project form.",
    projectSchema,
    { kind: "write", resource: "project", action: "create" },
    "project",
    async (ctx, input) => {
      const values = parseWith(projectSchema, input);
      const { data, error } = await ctx.db
        .from("projects")
        .insert({
          ...toRow(values),
          workspace_id: ctx.profile.workspace_id,
          created_by: ctx.profile.id,
        })
        .select("id")
        .single();
      if (error) throw new Error(friendlyError(error.message, error.code));
      return data;
    },
  );

  registerTool(
    server,
    "update_project",
    "Replace a project's editable fields. Pass id and values; values matches create_project. Does not delete.",
    updateProjectSchema,
    { kind: "write", resource: "project", action: "update" },
    "project",
    async (ctx, input) => {
      const parsed = parseWith(updateProjectSchema, input);
      const { data, error } = await ctx.db
        .from("projects")
        .update(toRow(parsed.values))
        .eq("id", parsed.id)
        .eq("workspace_id", ctx.profile.workspace_id)
        .select("id")
        .maybeSingle();
      if (error) throw new Error(friendlyError(error.message, error.code));
      assertFound(data, "project");
      return data;
    },
  );

  registerTool(
    server,
    "add_project_website",
    "Add a URL on a project. environment is live, staging, dev, or admin. A missing https:// is added. Uses the same validation as the website form.",
    websiteSchema,
    { kind: "write", resource: "project", action: "update" },
    "project_website",
    async (ctx, input) => {
      const values = parseWith(websiteSchema, input);
      const { data, error } = await ctx.db
        .from("project_websites")
        .insert({
          project_id: values.projectId,
          workspace_id: ctx.profile.workspace_id,
          label: values.label,
          url: values.url,
          environment: values.environment,
          notes: values.notes,
          created_by: ctx.profile.id,
        })
        .select("id")
        .single();
      assertOk(error);
      assertFound(data, "website");
      return { id: data.id, project_id: values.projectId };
    },
  );
}
