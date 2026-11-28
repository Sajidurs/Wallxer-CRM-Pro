import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import {
  CONTACT_STATUSES,
  CONTACT_TYPES,
  contactSchema,
  updateContactSchema,
  type ContactValues,
} from "@/features/contacts/schema";

import { limitField, pageField } from "../paging";
import { assertFound, assertOk, pageWindow, parseWith, registerTool } from "../register-tool";

/**
 * Same column mapping as createContact / updateContact. The type decides which
 * name fields survive, so a company does not keep a person's first name.
 */
function toRow(values: ContactValues) {
  const isCompany = values.type === "company";
  return {
    type: values.type,
    first_name: isCompany ? null : values.firstName,
    last_name: isCompany ? null : values.lastName,
    company_name: values.companyName,
    job_title: values.jobTitle,
    email: values.email,
    phone: values.phone,
    whatsapp: values.whatsapp,
    website: values.website,
    brand_id: values.brandId,
    owner_id: values.ownerId,
    parent_contact_id: isCompany ? null : values.parentContactId,
    status: values.status,
    source: values.source,
    tags: values.tags,
    notes: values.notes,
    address: values.address,
  };
}

const CONTACT_COLUMNS =
  "id, type, first_name, last_name, company_name, job_title, email, phone, whatsapp, website, status, source, tags, notes, address, brand_id, owner_id, parent_contact_id, created_at, updated_at";

export function registerContactTools(server: McpServer) {
  registerTool(
    server,
    "search_contacts",
    "Search people and companies. q uses the contact full-text index. Does not return deleted contacts.",
    z.object({
      q: z.string().trim().max(120).optional(),
      type: z.enum(CONTACT_TYPES).optional(),
      status: z.enum(CONTACT_STATUSES).optional(),
      page: pageField,
      limit: limitField,
    }),
    { kind: "read" },
    null,
    async (ctx, input) => {
      const { from, to } = pageWindow(input.page, input.limit);
      let query = ctx.db
        .from("contacts")
        .select(CONTACT_COLUMNS, { count: "exact" })
        .is("deleted_at", null);

      if (input.q) {
        query = query.textSearch("search_vector", input.q, { type: "websearch", config: "simple" });
      }
      if (input.type) query = query.eq("type", input.type);
      if (input.status) query = query.eq("status", input.status);

      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);
      assertOk(error);
      return { contacts: data ?? [], total: count ?? 0, page: input.page, limit: input.limit };
    },
  );

  registerTool(
    server,
    "get_contact",
    "One contact by id, including notes and address. Deleted contacts are not returned.",
    z.object({ id: z.uuid() }),
    { kind: "read" },
    "contact",
    async (ctx, input) => {
      const { data, error } = await ctx.db
        .from("contacts")
        .select(CONTACT_COLUMNS)
        .eq("id", input.id)
        .is("deleted_at", null)
        .maybeSingle();
      assertOk(error);
      assertFound(data, "contact");
      return data;
    },
  );

  registerTool(
    server,
    "create_contact",
    "Create a person or company. A person needs a first or last name; a company needs companyName. status is lead, active, inactive, or archived. Uses the same validation as the contact form.",
    contactSchema,
    { kind: "write", resource: "contact", action: "create" },
    "contact",
    async (ctx, input) => {
      const values = parseWith(contactSchema, input);
      const { data, error } = await ctx.db
        .from("contacts")
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
    "update_contact",
    "Replace a contact's editable fields. Pass id and values; values is the same object as create_contact. Read the contact first so omitted optionals are not cleared. Does not delete.",
    updateContactSchema,
    { kind: "write", resource: "contact", action: "update" },
    "contact",
    async (ctx, input) => {
      const parsed = parseWith(updateContactSchema, input);
      const { data, error } = await ctx.db
        .from("contacts")
        .update(toRow(parsed.values))
        .eq("id", parsed.id)
        .eq("workspace_id", ctx.profile.workspace_id)
        .select("id")
        .maybeSingle();
      assertOk(error);
      assertFound(data, "contact");
      return data;
    },
  );
}
