import "server-only";

import type { EntityType } from "@/lib/entities";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database.types";

export type ResourceLink = Tables<"resource_links">;

export async function listResourceLinks(
  entityType: EntityType,
  entityId: string,
): Promise<ResourceLink[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("resource_links")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Could not load links: ${error.message}`);

  return data ?? [];
}

/**
 * Links for many entities at once, so a task list can show link counts without
 * one query per row.
 */
export async function listResourceLinksFor(
  entityType: EntityType,
  entityIds: string[],
): Promise<Map<string, ResourceLink[]>> {
  if (entityIds.length === 0) return new Map();

  const supabase = await createClient();

  const { data } = await supabase
    .from("resource_links")
    .select("*")
    .eq("entity_type", entityType)
    .in("entity_id", entityIds)
    .order("position", { ascending: true });

  const grouped = new Map<string, ResourceLink[]>();
  for (const link of data ?? []) {
    const list = grouped.get(link.entity_id) ?? [];
    list.push(link);
    grouped.set(link.entity_id, list);
  }

  return grouped;
}
