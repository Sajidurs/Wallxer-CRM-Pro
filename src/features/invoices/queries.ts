import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";

import { PAGE_SIZE, type InvoiceFilters } from "./schema";

export type Invoice = Tables<"invoices">;
export type InvoiceItem = Tables<"invoice_items">;

const LIST_COLUMNS = `
  id, number, status, currency, brand_id, contact_id, project_id,
  issue_date, due_date, tax_rate, tax_label,
  subtotal_minor, tax_minor, total_minor,
  sent_at, paid_at, created_at, updated_at, deleted_at
`;

export type InvoiceListItem = Pick<
  Invoice,
  | "id"
  | "number"
  | "status"
  | "currency"
  | "brand_id"
  | "contact_id"
  | "project_id"
  | "issue_date"
  | "due_date"
  | "total_minor"
  | "sent_at"
  | "paid_at"
>;

export interface InvoiceListResult {
  invoices: InvoiceListItem[];
  total: number;
  page: number;
  pageCount: number;
}

export async function listInvoices(
  filters: InvoiceFilters,
): Promise<InvoiceListResult> {
  const supabase = await createClient();

  let query = supabase
    .from("invoices")
    .select(LIST_COLUMNS, { count: "exact" })
    .is("deleted_at", null);

  if (filters.q) {
    const term = `%${filters.q.replace(/[%_]/g, "\\$&")}%`;
    query = query.ilike("number", term);
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
    invoices: (data ?? []) as InvoiceListItem[],
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  return data ?? null;
}

export async function listInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("position", { ascending: true });

  return data ?? [];
}

/** Totals by status, for the strip above the list. */
export async function getInvoiceSummary(): Promise<
  { status: string; currency: string; total: number; count: number }[]
> {
  const supabase = await createClient();

  // Small table; grouping in JavaScript is honest here rather than another
  // database function for a handful of rows.
  const { data } = await supabase
    .from("invoices")
    .select("status, currency, total_minor")
    .is("deleted_at", null);

  const buckets = new Map<string, { status: string; currency: string; total: number; count: number }>();

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
