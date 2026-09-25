import "server-only";

import { cache } from "react";

// Wrapped in `cache()`: a per-request memo. Several of these are read by a
// layout and again by the page inside it, and each call was its own round trip
// to Seoul. The first caller pays; the rest are free. Not a cross-request
// cache — every new request re-reads, so RLS and freshness are unaffected.

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";

import type { DealFilters } from "./schema";

export type Pipeline = Tables<"pipelines">;
export type PipelineStage = Tables<"pipeline_stages">;
export type Deal = Tables<"deals">;
export type DealStageHistory = Tables<"deal_stage_history">;

export const listPipelines = cache(async (): Promise<Pipeline[]>  =>{
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("pipelines")
    .select("*")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Could not load pipelines: ${error.message}`);

  return data ?? [];
})

/**
 * Stages for one pipeline.
 *
 * `includeArchived` exists for the settings page, which has to show an archived
 * stage in order to let anyone un-archive it. The board never passes it.
 */
export async function listStages(
  pipelineId: string,
  includeArchived = false,
): Promise<PipelineStage[]> {
  const supabase = await createClient();

  let query = supabase
    .from("pipeline_stages")
    .select("*")
    .eq("pipeline_id", pipelineId)
    .order("position", { ascending: true });

  if (!includeArchived) query = query.eq("is_active", true);

  const { data, error } = await query;

  if (error) throw new Error(`Could not load stages: ${error.message}`);

  return data ?? [];
}

export const listAllStages = cache(async (): Promise<PipelineStage[]>  =>{
  const supabase = await createClient();

  const { data } = await supabase
    .from("pipeline_stages")
    .select("*")
    .order("position", { ascending: true });

  return data ?? [];
})

/**
 * Every live deal in one pipeline, ordered for the board.
 *
 * Capped rather than paginated: a kanban board is a view of work in flight, and
 * a pipeline with more than a few hundred open deals needs a report, not a
 * longer board.
 */
export async function listDeals(filters: DealFilters): Promise<Deal[]> {
  const supabase = await createClient();

  let query = supabase
    .from("deals")
    .select("*")
    .is("deleted_at", null)
    .order("position", { ascending: true })
    .limit(500);

  if (filters.pipelineId) query = query.eq("pipeline_id", filters.pipelineId);
  if (filters.ownerId) query = query.eq("owner_id", filters.ownerId);
  if (filters.brandId) query = query.eq("brand_id", filters.brandId);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.q) {
    query = query.ilike("title", `%${filters.q.replace(/[%_]/g, "\\$&")}%`);
  }

  const { data, error } = await query;

  if (error) throw new Error(`Could not load deals: ${error.message}`);

  return data ?? [];
}

export async function getDeal(id: string): Promise<Deal | null> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("deals")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  return data ?? null;
}

/** Deals for one contact, for their Deals tab. */
export async function listDealsForContact(contactId: string): Promise<Deal[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("deals")
    .select("*")
    .eq("contact_id", contactId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return data ?? [];
}

/** How a deal actually progressed, newest first. */
export async function dealHistory(dealId: string): Promise<DealStageHistory[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("deal_stage_history")
    .select("*")
    .eq("deal_id", dealId)
    .order("changed_at", { ascending: false })
    .limit(100);

  return data ?? [];
}

/** The workspace's settings blob, which decides whether values are shown. */
export const getWorkspaceSettings = cache(async (): Promise<unknown>  =>{
  const supabase = await createClient();

  const { data } = await supabase.from("workspaces").select("settings").maybeSingle();

  return data?.settings ?? {};
})
