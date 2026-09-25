import "server-only";

import { cache } from "react";

// Wrapped in `cache()`: a per-request memo. Several of these are read by a
// layout and again by the page inside it, and each call was its own round trip
// to Seoul. The first caller pays; the rest are free. Not a cross-request
// cache — every new request re-reads, so RLS and freshness are unaffected.

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";

import { PAGE_SIZE, type ContactFilters } from "./schema";

export type Contact = Tables<"contacts">;

/** The list does not need notes, custom fields, or the search vector. */
const LIST_COLUMNS = `
  id, type, first_name, last_name, company_name, job_title,
  email, phone, whatsapp, website, status, tags, source,
  brand_id, owner_id, parent_contact_id, created_at, updated_at, deleted_at
`;

export type ContactListItem = Pick<
  Contact,
  | "id"
  | "type"
  | "first_name"
  | "last_name"
  | "company_name"
  | "job_title"
  | "email"
  | "phone"
  | "whatsapp"
  | "website"
  | "status"
  | "tags"
  | "source"
  | "brand_id"
  | "owner_id"
  | "parent_contact_id"
  | "created_at"
  | "updated_at"
  | "deleted_at"
>;

export interface ContactListResult {
  contacts: ContactListItem[];
  total: number;
  page: number;
  pageCount: number;
}

/**
 * Paginated, filtered, searched — all in the database.
 *
 * Fetching everything and filtering in JavaScript works until the imported
 * contact lists arrive in Phase 7, at which point it stops working all at once.
 */
export async function listContacts(
  filters: ContactFilters,
): Promise<ContactListResult> {
  const supabase = await createClient();

  let query = supabase
    .from("contacts")
    .select(LIST_COLUMNS, { count: "exact" })
    .is("deleted_at", null);

  if (filters.q) {
    // websearch handles quoted phrases and bare words without throwing on the
    // punctuation a user will inevitably type into a search box.
    query = query.textSearch("search_vector", filters.q, {
      type: "websearch",
      config: "simple",
    });
  }

  if (filters.type) query = query.eq("type", filters.type);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.brandId) query = query.eq("brand_id", filters.brandId);
  if (filters.ownerId) query = query.eq("owner_id", filters.ownerId);
  if (filters.tag) query = query.contains("tags", [filters.tag]);

  switch (filters.sort) {
    case "name":
      query = query
        .order("company_name", { ascending: true, nullsFirst: false })
        .order("first_name", { ascending: true, nullsFirst: false });
      break;
    case "updated":
      query = query.order("updated_at", { ascending: false });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  const from = (filters.page - 1) * PAGE_SIZE;
  query = query.range(from, from + PAGE_SIZE - 1);

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Could not load contacts: ${error.message}`);
  }

  const total = count ?? 0;

  return {
    contacts: (data ?? []) as ContactListItem[],
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getContact(id: string): Promise<Contact | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  return data ?? null;
}

/** People attached to a company contact. */
export async function getContactChildren(
  parentId: string,
): Promise<ContactListItem[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("contacts")
    .select(LIST_COLUMNS)
    .eq("parent_contact_id", parentId)
    .is("deleted_at", null)
    .order("first_name", { ascending: true });

  return (data ?? []) as ContactListItem[];
}

/**
 * Companies, for the "belongs to" picker.
 *
 * Capped rather than paginated: a picker that returns ten thousand rows is a
 * combobox nobody can use. Once the list outgrows this, it becomes a search.
 */
export async function listCompanyOptions(): Promise<
  { id: string; name: string }[]
> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("contacts")
    .select("id, company_name")
    .eq("type", "company")
    .is("deleted_at", null)
    .order("company_name", { ascending: true })
    .limit(500);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.company_name ?? "Unnamed company",
  }));
}

/**
 * Every contact as a picker option, people and companies alike.
 *
 * Projects link to a client that may be either, so this is deliberately wider
 * than `listCompanyOptions`. Capped for the same reason: a picker returning ten
 * thousand rows is not a picker.
 */
export const listContactOptions = cache(
  async (): Promise<{ id: string; name: string }[]> => {
    const supabase = await createClient();

    const { data } = await supabase
      .from("contacts")
      .select("id, type, first_name, last_name, company_name")
      .is("deleted_at", null)
      .order("company_name", { ascending: true, nullsFirst: false })
      .order("first_name", { ascending: true, nullsFirst: false })
      .limit(1000);

    return (data ?? []).map((row) => ({
      id: row.id,
      name: displayNameFromRow(row),
    }));
  },
);

/** Local copy of the naming rule, so queries do not import from schema.ts. */
function displayNameFromRow(row: {
  type: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
}): string {
  if (row.type === "company") return row.company_name ?? "Unnamed company";
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ");
  return name || row.company_name || "Unnamed contact";
}

/** Every tag currently in use, for the filter bar. */
export async function listUsedTags(): Promise<string[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("contacts")
    .select("tags")
    .is("deleted_at", null)
    .limit(2000);

  const seen = new Set<string>();
  for (const row of data ?? []) {
    for (const tag of row.tags ?? []) seen.add(tag);
  }

  return [...seen].sort((a, b) => a.localeCompare(b));
}
