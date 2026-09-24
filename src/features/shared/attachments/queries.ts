import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { EntityType } from "@/lib/entities";
import type { Tables } from "@/types/database.types";

export type Attachment = Tables<"attachments">;

/**
 * Files attached to any entity.
 *
 * One function serves contacts, projects, tasks, and whatever comes next —
 * that is the return on the polymorphic table. Callers pass the entity type
 * from `lib/entities.ts` rather than a string literal, so adding a module is a
 * one-line change there.
 */
export async function listAttachments(
  entityType: EntityType,
  entityId: string,
): Promise<Attachment[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("attachments")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Could not load files: ${error.message}`);

  return data ?? [];
}

export async function countAttachments(
  entityType: EntityType,
  entityId: string,
): Promise<number> {
  const supabase = await createClient();

  const { count } = await supabase
    .from("attachments")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .is("deleted_at", null);

  return count ?? 0;
}
