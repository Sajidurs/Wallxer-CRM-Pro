import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import { ENTITY_TYPES } from "@/lib/entities";
import { resourceLinkSchema } from "@/features/shared/resource-links/schema";

import { ATTACHMENT_LIST_COLUMNS, CREDENTIAL_LIST_COLUMNS } from "../columns";
import { limitField, pageField } from "../paging";
import { assertFound, assertOk, likePattern, pageWindow, parseWith, registerTool } from "../register-tool";

export function registerCatalogTools(server: McpServer) {
  registerTool(
    server,
    "list_brands",
    "Companies (brands) in the workspace: id, name, colour, and whether they are active. Bank details are not included.",
    z.object({}),
    { kind: "read" },
    null,
    async (ctx) => {
      const { data, error } = await ctx.db
        .from("brands")
        .select("id, name, legal_name, color, is_active, email, phone, website")
        .order("position", { ascending: true });
      assertOk(error);
      return data ?? [];
    },
  );

  registerTool(
    server,
    "list_resource_links",
    "Links attached to a contact, deal, project, task, or credential. Filter with entityType and entityId.",
    z.object({
      entityType: z.enum(ENTITY_TYPES).optional(),
      entityId: z.uuid().optional(),
      page: pageField,
      limit: limitField,
    }),
    { kind: "read" },
    null,
    async (ctx, input) => {
      const { from, to } = pageWindow(input.page, input.limit);
      let query = ctx.db
        .from("resource_links")
        .select("id, entity_type, entity_id, kind, name, url, position, created_at", {
          count: "exact",
        });
      if (input.entityType) query = query.eq("entity_type", input.entityType);
      if (input.entityId) query = query.eq("entity_id", input.entityId);
      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);
      assertOk(error);
      return { links: data ?? [], total: count ?? 0, page: input.page, limit: input.limit };
    },
  );

  registerTool(
    server,
    "add_resource_link",
    "Attach a link to a contact, deal, project, task, or credential. kind is video, document, design, repository, or reference. A missing https:// is added. There is no delete tool.",
    resourceLinkSchema,
    { kind: "write" },
    "resource_link",
    async (ctx, input) => {
      const values = parseWith(resourceLinkSchema, input);
      const { data, error } = await ctx.db
        .from("resource_links")
        .insert({
          workspace_id: ctx.profile.workspace_id,
          entity_type: values.entityType,
          entity_id: values.entityId,
          kind: values.kind,
          name: values.name,
          url: values.url,
          created_by: ctx.profile.id,
        })
        .select("id")
        .single();
      assertOk(error);
      assertFound(data, "link");
      return { id: data.id, entity_type: values.entityType, entity_id: values.entityId };
    },
  );

  registerTool(
    server,
    "list_attachments",
    "File metadata only: name, type, and size. No file contents, no download URL, and no storage path.",
    z.object({
      entityType: z.enum(ENTITY_TYPES).optional(),
      entityId: z.uuid().optional(),
      page: pageField,
      limit: limitField,
    }),
    { kind: "read" },
    null,
    async (ctx, input) => {
      const { from, to } = pageWindow(input.page, input.limit);
      let query = ctx.db
        .from("attachments")
        .select(ATTACHMENT_LIST_COLUMNS, { count: "exact" })
        .is("deleted_at", null);
      if (input.entityType) query = query.eq("entity_type", input.entityType);
      if (input.entityId) query = query.eq("entity_id", input.entityId);
      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);
      assertOk(error);
      return { attachments: data ?? [], total: count ?? 0, page: input.page, limit: input.limit };
    },
  );

  registerTool(
    server,
    "list_credentials",
    "Credential metadata only: label, category, url, username, and the project or contact it belongs to. Secrets and notes are never returned, and there is no tool to reveal, create, or change them.",
    z.object({
      q: z.string().trim().max(120).optional(),
      projectId: z.uuid().optional(),
      page: pageField,
      limit: limitField,
    }),
    { kind: "read" },
    null,
    async (ctx, input) => {
      const { from, to } = pageWindow(input.page, input.limit);
      let query = ctx.db
        .from("credentials")
        .select(CREDENTIAL_LIST_COLUMNS, { count: "exact" })
        .is("deleted_at", null);
      if (input.q) query = query.ilike("label", likePattern(input.q));
      if (input.projectId) query = query.eq("project_id", input.projectId);
      const { data, error, count } = await query
        .order("label", { ascending: true })
        .range(from, to);
      assertOk(error);
      return { credentials: data ?? [], total: count ?? 0, page: input.page, limit: input.limit };
    },
  );
}
