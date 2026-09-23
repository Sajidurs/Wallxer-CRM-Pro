import "server-only";

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
export async function listBrandOptions(): Promise<BrandOption[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("brands")
    .select("id, name, color")
    .eq("is_active", true)
    .order("position", { ascending: true });

  return data ?? [];
}
