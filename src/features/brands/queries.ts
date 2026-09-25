import "server-only";

import { cache } from "react";

// Wrapped in `cache()`: a per-request memo. Several of these are read by a
// layout and again by the page inside it, and each call was its own round trip
// to Seoul. The first caller pays; the rest are free. Not a cross-request
// cache — every new request re-reads, so RLS and freshness are unaffected.

import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";

export type Brand = Tables<"brands">;

export interface BrandOption {
  id: string;
  name: string;
  color: string;
}

/**
 * The brands records are tagged with. Every module that carries a `brand_id`
 * reads them through here rather than querying the table itself.
 */
export const listBrandOptions = cache(async (): Promise<BrandOption[]>  =>{
  const supabase = await createClient();

  const { data } = await supabase
    .from("brands")
    .select("id, name, color")
    .eq("is_active", true)
    .order("position", { ascending: true });

  return data ?? [];
})
