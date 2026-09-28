import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";

import { CYCLE_MONTHS, PAGE_SIZE, type RenewalCycle, type RenewalFilters } from "./schema";

export type Renewal = Tables<"renewals">;

const LIST_COLUMNS = `
  id, name, category, vendor, status, cycle,
  contact_id, project_id, brand_id,
  started_on, last_renewed_on, next_renewal_on,
  currency, price_minor, cost_minor,
  auto_renew, reminder_days, login_url, notes,
  created_at, updated_at, deleted_at
`;

export interface RenewalListResult {
  renewals: Renewal[];
  total: number;
  page: number;
  pageCount: number;
}

/** `yyyy-mm-dd` for a day relative to today, in the same calendar terms the column uses. */
function isoDay(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export async function listRenewals(
  filters: RenewalFilters,
): Promise<RenewalListResult> {
  const supabase = await createClient();

  let query = supabase
    .from("renewals")
    .select(LIST_COLUMNS, { count: "exact" })
    .is("deleted_at", null);

  if (filters.q) {
    const term = `%${filters.q.replace(/[%_]/g, "\\$&")}%`;
    query = query.or(`name.ilike.${term},vendor.ilike.${term}`);
  }
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.contactId) query = query.eq("contact_id", filters.contactId);

  // The due filters only ever mean anything for something still running.
  if (filters.due === "overdue") {
    query = query.eq("status", "active").lt("next_renewal_on", isoDay(0));
  } else if (filters.due === "30") {
    query = query
      .eq("status", "active")
      .gte("next_renewal_on", isoDay(0))
      .lte("next_renewal_on", isoDay(30));
  } else if (filters.due === "90") {
    query = query
      .eq("status", "active")
      .gte("next_renewal_on", isoDay(0))
      .lte("next_renewal_on", isoDay(90));
  }

  const from = (filters.page - 1) * PAGE_SIZE;

  const { data, count } = await query
    // Soonest first: the whole point of the page is what needs attention next.
    .order("next_renewal_on", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);

  const total = count ?? 0;

  return {
    renewals: (data ?? []) as Renewal[],
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getRenewal(id: string): Promise<Renewal | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("renewals")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  return data ?? null;
}

export interface RenewalSummary {
  overdue: number;
  dueSoon: number;
  active: number;
  /** Annualised client value per currency, from the price and the cycle. */
  annual: { currency: string; total: number }[];
}

export async function getRenewalSummary(): Promise<RenewalSummary> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("renewals")
    .select("status, next_renewal_on, cycle, currency, price_minor")
    .is("deleted_at", null);

  const today = isoDay(0);
  const in30 = isoDay(30);

  let overdue = 0;
  let dueSoon = 0;
  let active = 0;
  const annual = new Map<string, number>();

  for (const row of data ?? []) {
    if (row.status !== "active") continue;
    active += 1;

    if (row.next_renewal_on < today) overdue += 1;
    else if (row.next_renewal_on <= in30) dueSoon += 1;

    if (row.price_minor !== null) {
      // Normalised to a year so monthly and biennial lines can be compared.
      const perYear = (Number(row.price_minor) * 12) / CYCLE_MONTHS[row.cycle as RenewalCycle];
      annual.set(row.currency, (annual.get(row.currency) ?? 0) + Math.round(perYear));
    }
  }

  return {
    overdue,
    dueSoon,
    active,
    annual: [...annual.entries()].map(([currency, total]) => ({ currency, total })),
  };
}

/** For the sidebar badge: how many need attention right now. */
export async function countRenewalsNeedingAttention(): Promise<number> {
  const supabase = await createClient();

  const { count } = await supabase
    .from("renewals")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null)
    .eq("status", "active")
    .lte("next_renewal_on", isoDay(30));

  return count ?? 0;
}
