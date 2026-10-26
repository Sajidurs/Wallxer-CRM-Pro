import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";

import { PAGE_SIZE, type ProposalFilters } from "./schema";

export type Proposal = Tables<"proposals">;
export type ProposalItem = Tables<"proposal_items">;

const LIST_COLUMNS = `
  id, number, title, status, currency, brand_id, contact_id, project_id,
  issue_date, valid_until, total_minor,
  sent_at, decided_at, created_at, updated_at, deleted_at
`;

export type ProposalListItem = Pick<
  Proposal,
  | "id"
  | "number"
  | "title"
  | "status"
  | "currency"
  | "brand_id"
  | "contact_id"
  | "project_id"
  | "issue_date"
  | "valid_until"
  | "total_minor"
  | "sent_at"
  | "decided_at"
>;

export interface ProposalListResult {
  proposals: ProposalListItem[];
  total: number;
  page: number;
  pageCount: number;
}

export async function listProposals(
  filters: ProposalFilters,
): Promise<ProposalListResult> {
  const supabase = await createClient();

  let query = supabase
    .from("proposals")
    .select(LIST_COLUMNS, { count: "exact" })
    .is("deleted_at", null);

  if (filters.q) {
    const term = `%${filters.q.replace(/[%_]/g, "\\$&")}%`;
    // Number or title: someone looking for a proposal remembers one or the
    // other, rarely both.
    query = query.or(`number.ilike.${term},title.ilike.${term}`);
  }
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.brandId) query = query.eq("brand_id", filters.brandId);

  const from = (filters.page - 1) * PAGE_SIZE;

  const { data, count } = await query
    .order("issue_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  const total = count ?? 0;

  return {
    proposals: (data ?? []) as ProposalListItem[],
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getProposal(id: string): Promise<Proposal | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("proposals")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  return data ?? null;
}

export async function listProposalItems(proposalId: string): Promise<ProposalItem[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("proposal_items")
    .select("*")
    .eq("proposal_id", proposalId)
    .order("position", { ascending: true });

  return data ?? [];
}

/**
 * The strip above the list: what is out with a client, and what has been won.
 *
 * Grouped per currency, because a total that added taka to euros would be a
 * fiction. Small table, so the grouping is honest in JavaScript rather than
 * another database function.
 */
export async function getProposalSummary(): Promise<
  { status: string; currency: string; total: number; count: number }[]
> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("proposals")
    .select("status, currency, total_minor")
    .is("deleted_at", null);

  const buckets = new Map<
    string,
    { status: string; currency: string; total: number; count: number }
  >();

  for (const row of data ?? []) {
    const key = `${row.status}|${row.currency}`;
    const current = buckets.get(key) ?? {
      status: row.status,
      currency: row.currency,
      total: 0,
      count: 0,
    };
    current.total += Number(row.total_minor);
    current.count += 1;
    buckets.set(key, current);
  }

  return [...buckets.values()];
}
