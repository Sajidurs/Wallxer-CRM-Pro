import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";

import { PAGE_SIZE, type ProjectFilters } from "./schema";

export type Project = Tables<"projects">;
export type ProjectWebsite = Tables<"project_websites">;

const LIST_COLUMNS = `
  id, name, code, status, description, start_date, due_date,
  contact_id, brand_id, owner_id, created_at, updated_at, deleted_at
`;

export type ProjectListItem = Pick<
  Project,
  | "id"
  | "name"
  | "code"
  | "status"
  | "description"
  | "start_date"
  | "due_date"
  | "contact_id"
  | "brand_id"
  | "owner_id"
  | "created_at"
  | "updated_at"
  | "deleted_at"
>;

export interface ProjectListResult {
  projects: ProjectListItem[];
  total: number;
  page: number;
  pageCount: number;
}

export async function listProjects(
  filters: ProjectFilters,
): Promise<ProjectListResult> {
  const supabase = await createClient();

  let query = supabase
    .from("projects")
    .select(LIST_COLUMNS, { count: "exact" })
    .is("deleted_at", null);

  if (filters.q) {
    // No generated tsvector on this table: a project list is small and the
    // fields worth searching are two short text columns. `or` with ilike is
    // honest about that rather than pretending to be full-text search.
    const term = `%${filters.q.replace(/[%_]/g, "\\$&")}%`;
    query = query.or(`name.ilike.${term},code.ilike.${term}`);
  }

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.brandId) query = query.eq("brand_id", filters.brandId);
  if (filters.ownerId) query = query.eq("owner_id", filters.ownerId);
  if (filters.contactId) query = query.eq("contact_id", filters.contactId);

  switch (filters.sort) {
    case "name":
      query = query.order("name", { ascending: true });
      break;
    case "due":
      // nullsFirst false so projects without a due date sink to the bottom
      // rather than crowding out the ones that actually have a deadline.
      query = query.order("due_date", { ascending: true, nullsFirst: false });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  const from = (filters.page - 1) * PAGE_SIZE;
  query = query.range(from, from + PAGE_SIZE - 1);

  const { data, error, count } = await query;

  if (error) throw new Error(`Could not load projects: ${error.message}`);

  const total = count ?? 0;

  return {
    projects: (data ?? []) as ProjectListItem[],
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getProject(id: string): Promise<Project | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  return data ?? null;
}

export async function listProjectWebsites(
  projectId: string,
): Promise<ProjectWebsite[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("project_websites")
    .select("*")
    .eq("project_id", projectId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  return data ?? [];
}

/** Projects belonging to one client, for the contact detail page. */
export async function listProjectsForContact(
  contactId: string,
): Promise<ProjectListItem[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("projects")
    .select(LIST_COLUMNS)
    .eq("contact_id", contactId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return (data ?? []) as ProjectListItem[];
}

/** Projects for a picker, capped. Becomes a search when it outgrows this. */
export async function listProjectOptions(): Promise<
  { id: string; name: string; code: string | null }[]
> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("projects")
    .select("id, name, code")
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(500);

  return data ?? [];
}
