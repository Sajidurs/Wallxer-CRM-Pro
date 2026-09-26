import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";

import { PAGE_SIZE, type Bucket, type TransactionFilters } from "./schema";

export type Transaction = Tables<"transactions">;
export type TransactionCategory = Tables<"transaction_categories">;

const LIST_COLUMNS = `
  id, kind, amount_poisha, occurred_on, category_id, brand_id, project_id,
  contact_id, payment_method, reference, description,
  created_at, updated_at, created_by, deleted_at
`;

export type TransactionListItem = Pick<
  Transaction,
  | "id"
  | "kind"
  | "amount_poisha"
  | "occurred_on"
  | "category_id"
  | "brand_id"
  | "project_id"
  | "contact_id"
  | "payment_method"
  | "reference"
  | "description"
  | "created_at"
  | "updated_at"
  | "created_by"
  | "deleted_at"
>;

export interface TransactionListResult {
  transactions: TransactionListItem[];
  total: number;
  page: number;
  pageCount: number;
}

export async function listTransactions(
  filters: TransactionFilters,
): Promise<TransactionListResult> {
  const supabase = await createClient();

  let query = supabase
    .from("transactions")
    .select(LIST_COLUMNS, { count: "exact" })
    .is("deleted_at", null);

  if (filters.q) {
    // Two short text columns, so `or` with ilike is honest about what this is
    // rather than pretending to be full-text search.
    const term = `%${filters.q.replace(/[%_]/g, "\\$&")}%`;
    query = query.or(`description.ilike.${term},reference.ilike.${term}`);
  }

  if (filters.kind) query = query.eq("kind", filters.kind);
  if (filters.categoryId) query = query.eq("category_id", filters.categoryId);
  if (filters.projectId) query = query.eq("project_id", filters.projectId);
  if (filters.brandId) query = query.eq("brand_id", filters.brandId);
  if (filters.from) query = query.gte("occurred_on", filters.from);
  if (filters.to) query = query.lte("occurred_on", filters.to);

  const from = (filters.page - 1) * PAGE_SIZE;

  const { data, count } = await query
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);

  const total = count ?? 0;

  return {
    transactions: (data ?? []) as TransactionListItem[],
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

export async function getTransaction(id: string): Promise<Transaction | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  return data ?? null;
}

export async function listCategories(): Promise<TransactionCategory[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("transaction_categories")
    .select("*")
    .eq("is_active", true)
    .order("kind", { ascending: true })
    .order("position", { ascending: true });

  return data ?? [];
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
// Every figure below is summed by Postgres. Pulling a year of ledger across the
// wire to add it up in JavaScript would cost more than the page it draws, and
// the numbers would drift the moment pagination touched them.

export interface SeriesPoint {
  bucket: string;
  income: number;
  expense: number;
}

export async function getSeries(
  from: string,
  to: string,
  bucket: Bucket,
): Promise<SeriesPoint[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("finance_series", {
    p_from: from,
    p_to: to,
    p_bucket: bucket,
  });

  return (data ?? []).map((row) => ({
    bucket: row.bucket,
    income: Number(row.income_poisha),
    expense: Number(row.expense_poisha),
  }));
}

export interface CategoryTotal {
  categoryId: string | null;
  name: string;
  kind: "income" | "expense";
  total: number;
}

export async function getByCategory(
  from: string,
  to: string,
): Promise<CategoryTotal[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("finance_by_category", {
    p_from: from,
    p_to: to,
  });

  return (data ?? []).map((row) => ({
    categoryId: row.category_id,
    name: row.category_name,
    kind: row.kind,
    total: Number(row.total_poisha),
  }));
}

export interface ProjectTotal {
  projectId: string | null;
  name: string;
  income: number;
  expense: number;
  net: number;
}

export async function getByProject(
  from: string,
  to: string,
): Promise<ProjectTotal[]> {
  const supabase = await createClient();

  const { data } = await supabase.rpc("finance_by_project", {
    p_from: from,
    p_to: to,
  });

  return (data ?? []).map((row) => {
    const income = Number(row.income_poisha);
    const expense = Number(row.expense_poisha);
    return {
      projectId: row.project_id,
      name: row.project_name,
      income,
      expense,
      net: income - expense,
    };
  });
}

/**
 * A slice of the ledger, newest first.
 *
 * Offset-based rather than page-based, because the finance page appends rather
 * than replaces: "show me twenty more" is an offset question, and translating
 * it into a page number would only invite an off-by-one at the boundary.
 */
export async function listTransactionSlice(
  offset: number,
  limit: number,
): Promise<{ transactions: TransactionListItem[]; total: number }> {
  const supabase = await createClient();

  const { data, count } = await supabase
    .from("transactions")
    .select(LIST_COLUMNS, { count: "exact" })
    .is("deleted_at", null)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  return {
    transactions: (data ?? []) as TransactionListItem[],
    total: count ?? 0,
  };
}
