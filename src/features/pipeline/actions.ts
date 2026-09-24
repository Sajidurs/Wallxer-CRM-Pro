"use server";

import { revalidatePath } from "next/cache";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth";
import { atLeast, can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { fieldErrorsFromZod, firstIssueMessage } from "@/lib/zod";
import type { Tables } from "@/types/database.types";

import {
  dealSchema,
  deleteDealSchema,
  moveDealSchema,
  moveStageSchema,
  pipelineSchema,
  stageSchema,
  updateDealSchema,
  updateStageSchema,
  type DealValues,
} from "./schema";

type Profile = Tables<"profiles">;

function toRow(values: DealValues) {
  return {
    title: values.title,
    description: values.description,
    contact_id: values.contactId,
    pipeline_id: values.pipelineId,
    stage_id: values.stageId,
    brand_id: values.brandId,
    owner_id: values.ownerId,
    expected_close_date: values.expectedCloseDate,
    amount: values.amount,
    currency: values.currency,
    // `status` and `closed_at` are deliberately absent: the sync_deal_outcome
    // trigger derives them from the stage, so sending them here would be a
    // second source of truth that could disagree.
  };
}

export async function createDeal(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return fail("Your session has expired. Sign in again.");
  }
  if (!can(actor, "create", "deal")) {
    return fail("You do not have permission to create a deal.");
  }

  const parsed = dealSchema.safeParse(input);
  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error), fieldErrorsFromZod(parsed.error));
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("deals")
    .insert({
      ...toRow(parsed.data),
      workspace_id: actor.workspace_id,
      created_by: actor.id,
    })
    .select("id")
    .single();

  if (error) return fail(error.message);

  revalidatePath("/pipeline");
  revalidatePath(`/contacts/${parsed.data.contactId}`);
  return ok({ id: data.id });
}

export async function updateDeal(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return fail("Your session has expired. Sign in again.");
  }
  if (!can(actor, "update", "deal")) {
    return fail("You do not have permission to edit a deal.");
  }

  const parsed = updateDealSchema.safeParse(input);
  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error), fieldErrorsFromZod(parsed.error));
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("deals")
    .update(toRow(parsed.data.values))
    .eq("id", parsed.data.id);

  if (error) return fail(error.message);

  revalidatePath("/pipeline");
  revalidatePath(`/pipeline/${parsed.data.id}`);
  return ok({ id: parsed.data.id });
}

/**
 * Board drag and drop.
 *
 * Moving a card is the whole interaction of a pipeline, so it is its own action
 * rather than a general update — a drag cannot then overwrite a field it never
 * sent. The stage-history row is written by a trigger, so it happens whether
 * the move comes from here or from anywhere else.
 */
export async function moveDeal(input: unknown): Promise<ActionResult<undefined>> {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return fail("Your session has expired. Sign in again.");
  }
  if (!can(actor, "update", "deal")) {
    return fail("You do not have permission to move a deal.");
  }

  const parsed = moveDealSchema.safeParse(input);
  if (!parsed.success) return fail("That move is not valid.");

  const supabase = await createClient();

  const { error } = await supabase
    .from("deals")
    .update({ stage_id: parsed.data.stageId, position: parsed.data.position })
    .eq("id", parsed.data.id);

  if (error) return fail(error.message);

  revalidatePath("/pipeline");
  return ok();
}

export async function setDealDeleted(
  input: unknown,
): Promise<ActionResult<{ id: string; deleted: boolean }>> {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return fail("Your session has expired. Sign in again.");
  }
  if (!can(actor, "delete", "deal")) {
    return fail("Only a manager or above can delete a deal.");
  }

  const parsed = deleteDealSchema.safeParse(input);
  if (!parsed.success) return fail("That deal is not valid.");

  const supabase = await createClient();

  const { error } = await supabase
    .from("deals")
    .update({ deleted_at: parsed.data.deleted ? new Date().toISOString() : null })
    .eq("id", parsed.data.id);

  if (error) return fail(error.message);

  revalidatePath("/pipeline");
  return ok({ id: parsed.data.id, deleted: parsed.data.deleted });
}

// ---------------------------------------------------------------------------
// Stage and pipeline administration
// ---------------------------------------------------------------------------
// Admin only, matching the RLS policies. Stages are data precisely so this can
// happen without a deploy.

async function requireAdmin(): Promise<{ actor: Profile } | { error: string }> {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return { error: "Your session has expired. Sign in again." };
  }
  if (!atLeast(actor.role, "admin")) {
    return { error: "Only an admin can change pipelines." };
  }
  return { actor };
}

export async function createStage(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const guard = await requireAdmin();
  if ("error" in guard) return fail(guard.error);

  const parsed = stageSchema.safeParse(input);
  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error), fieldErrorsFromZod(parsed.error));
  }

  const supabase = await createClient();

  // New stages go on the end, before nothing.
  const { data: last } = await supabase
    .from("pipeline_stages")
    .select("position")
    .eq("pipeline_id", parsed.data.pipelineId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("pipeline_stages")
    .insert({
      workspace_id: guard.actor.workspace_id,
      pipeline_id: parsed.data.pipelineId,
      name: parsed.data.name,
      color: parsed.data.color,
      is_won: parsed.data.outcome === "won",
      is_lost: parsed.data.outcome === "lost",
      position: (last?.position ?? -1) + 1,
    })
    .select("id")
    .single();

  if (error) return fail(error.message);

  revalidatePath("/settings/pipelines");
  revalidatePath("/pipeline");
  return ok({ id: data.id });
}

export async function updateStage(
  input: unknown,
): Promise<ActionResult<undefined>> {
  const guard = await requireAdmin();
  if ("error" in guard) return fail(guard.error);

  const parsed = updateStageSchema.safeParse(input);
  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error), fieldErrorsFromZod(parsed.error));
  }

  const supabase = await createClient();

  // Archiving a stage that still holds deals would hide them from the board
  // with no way back to them, so it is refused with an explanation rather than
  // silently losing work.
  if (!parsed.data.isActive) {
    const { count } = await supabase
      .from("deals")
      .select("id", { count: "exact", head: true })
      .eq("stage_id", parsed.data.id)
      .is("deleted_at", null);

    if ((count ?? 0) > 0) {
      return fail(
        `That stage still holds ${count} deal${count === 1 ? "" : "s"}. Move them to another stage first.`,
      );
    }
  }

  const { error } = await supabase
    .from("pipeline_stages")
    .update({
      name: parsed.data.name,
      color: parsed.data.color,
      is_won: parsed.data.outcome === "won",
      is_lost: parsed.data.outcome === "lost",
      is_active: parsed.data.isActive,
    })
    .eq("id", parsed.data.id);

  if (error) return fail(error.message);

  revalidatePath("/settings/pipelines");
  revalidatePath("/pipeline");
  return ok();
}

/**
 * Reordering swaps two positions rather than renumbering the column, so a
 * concurrent edit elsewhere in the list cannot be clobbered.
 */
export async function moveStage(input: unknown): Promise<ActionResult<undefined>> {
  const guard = await requireAdmin();
  if ("error" in guard) return fail(guard.error);

  const parsed = moveStageSchema.safeParse(input);
  if (!parsed.success) return fail("That move is not valid.");

  const supabase = await createClient();

  const { data: stage } = await supabase
    .from("pipeline_stages")
    .select("id, pipeline_id, position")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (!stage) return fail("That stage no longer exists.");

  const { data: neighbour } = await supabase
    .from("pipeline_stages")
    .select("id, position")
    .eq("pipeline_id", stage.pipeline_id)
    [parsed.data.direction === "up" ? "lt" : "gt"]("position", stage.position)
    .order("position", { ascending: parsed.data.direction !== "up" })
    .limit(1)
    .maybeSingle();

  if (!neighbour) return ok(); // Already at the end; nothing to do.

  const { error: a } = await supabase
    .from("pipeline_stages")
    .update({ position: neighbour.position })
    .eq("id", stage.id);
  if (a) return fail(a.message);

  const { error: b } = await supabase
    .from("pipeline_stages")
    .update({ position: stage.position })
    .eq("id", neighbour.id);
  if (b) return fail(b.message);

  revalidatePath("/settings/pipelines");
  revalidatePath("/pipeline");
  return ok();
}

export async function createPipeline(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const guard = await requireAdmin();
  if ("error" in guard) return fail(guard.error);

  const parsed = pipelineSchema.safeParse(input);
  if (!parsed.success) {
    return fail(firstIssueMessage(parsed.error), fieldErrorsFromZod(parsed.error));
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("pipelines")
    .insert({
      workspace_id: guard.actor.workspace_id,
      name: parsed.data.name,
      brand_id: parsed.data.brandId,
      // Never the default: a partial unique index allows only one, and quietly
      // stealing it from the existing pipeline would move where new deals land.
      is_default: false,
    })
    .select("id")
    .single();

  if (error) return fail(error.message);

  // A pipeline with no stages is unusable, so it starts with the minimum that
  // makes a board work.
  const { error: stageError } = await supabase.from("pipeline_stages").insert([
    {
      workspace_id: guard.actor.workspace_id,
      pipeline_id: data.id,
      name: "New",
      position: 0,
      color: "#64748b",
    },
    {
      workspace_id: guard.actor.workspace_id,
      pipeline_id: data.id,
      name: "Won",
      position: 1,
      color: "#16a34a",
      is_won: true,
    },
    {
      workspace_id: guard.actor.workspace_id,
      pipeline_id: data.id,
      name: "Lost",
      position: 2,
      color: "#dc2626",
      is_lost: true,
    },
  ]);

  if (stageError) {
    return fail(`Pipeline created, but its stages were not: ${stageError.message}`);
  }

  revalidatePath("/settings/pipelines");
  revalidatePath("/pipeline");
  return ok({ id: data.id });
}
