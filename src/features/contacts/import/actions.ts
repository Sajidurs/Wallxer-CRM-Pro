"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { fail, ok, type ActionResult } from "@/lib/action-result";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import type { TablesInsert } from "@/types/database.types";

import {
  importOptionsSchema,
  mapRows,
  parseCsv,
  validateRow,
  type ImportField,
  type RowOutcome,
} from "./csv";

const importRequestSchema = z.object({
  csv: z.string().min(1, "The file is empty").max(5_000_000, "That file is too large"),
  mapping: z.array(z.string().nullable()),
  options: importOptionsSchema,
  /** True validates and reports without writing anything. */
  dryRun: z.boolean().default(false),
});

export interface ImportSummary {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  /**
   * Rows carrying no email. Deduplication is by email, so these cannot be
   * matched against anything — importing the same file again creates them a
   * second time. Surfaced so that is a known trade-off rather than a surprise.
   */
  withoutEmail: number;
  /** Capped, so a 5,000-row file does not return 5,000 lines of detail. */
  rows: RowOutcome[];
  dryRun: boolean;
}

const MAX_ROWS = 5000;
const MAX_REPORTED = 200;

/**
 * Imports contacts from a CSV.
 *
 * Section 8.2, non-negotiable: this writes through the same Zod schema the
 * manual form uses, so a row that would be rejected by the form is rejected
 * here too. It does not have its own idea of what a valid contact is.
 *
 * Deduplication is **on email**, case-insensitively — the rule chosen on
 * 2026-09-25, resolving open question 2 in section 14. A row with no email is
 * always created, because nothing identifies it as anyone in particular.
 */
export async function importContacts(
  input: unknown,
): Promise<ActionResult<ImportSummary>> {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return fail("Your session has expired. Sign in again.");
  }
  if (!can(actor, "create", "contact")) {
    return fail("You do not have permission to import contacts.");
  }

  const parsed = importRequestSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "That import is not valid.");
  }

  const { csv, mapping, options, dryRun } = parsed.data;

  const rows = parseCsv(csv);
  if (rows.length < 2) {
    return fail("That file has a header but no rows.");
  }

  const mapped = mapRows(rows, mapping as (ImportField | null)[]);

  if (mapped.length > MAX_ROWS) {
    return fail(
      `That file has ${mapped.length} rows. Import at most ${MAX_ROWS} at a time so a failure part way through is easy to reason about.`,
    );
  }

  const supabase = await createClient();

  // Every existing email, fetched once. One query beats one lookup per row,
  // and at this scale the whole set fits comfortably in memory.
  const existingByEmail = new Map<string, string>();
  for (let page = 0; ; page++) {
    const { data, error } = await supabase
      .from("contacts")
      .select("id, email")
      .is("deleted_at", null)
      .not("email", "is", null)
      .range(page * 1000, page * 1000 + 999);

    if (error) return fail(`Could not read existing contacts: ${error.message}`);
    for (const row of data) {
      if (row.email) existingByEmail.set(row.email.toLowerCase(), row.id);
    }
    if (data.length < 1000) break;
  }

  const summary: ImportSummary = {
    total: mapped.length,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    withoutEmail: 0,
    rows: [],
    dryRun,
  };

  // Emails seen within this file, so a file containing the same person twice
  // does not create two contacts.
  const seenInFile = new Map<string, string>();

  const toInsert: TablesInsert<"contacts">[] = [];

  for (const row of mapped) {
    const result = validateRow(row);

    if (!result.ok) {
      summary.failed++;
      if (summary.rows.length < MAX_REPORTED) {
        summary.rows.push({
          line: row.line,
          outcome: "failed",
          label: row.values.email ?? row.values.firstName ?? `Row ${row.line}`,
          reason: result.reason,
        });
      }
      continue;
    }

    const values = result.values;
    const label =
      values.email ??
      [values.firstName, values.lastName].filter(Boolean).join(" ") ??
      values.companyName ??
      `Row ${row.line}`;

    const email = values.email?.toLowerCase() ?? null;
    if (!email) summary.withoutEmail++;
    const existingId = email
      ? (existingByEmail.get(email) ?? seenInFile.get(email))
      : undefined;

    const payload = {
      type: values.type,
      first_name: values.type === "company" ? null : values.firstName,
      last_name: values.type === "company" ? null : values.lastName,
      company_name: values.companyName,
      job_title: values.jobTitle,
      email: values.email,
      phone: values.phone,
      whatsapp: values.whatsapp,
      website: values.website,
      source: values.source,
      notes: values.notes,
      tags: values.tags,
      address: values.address,
      status: options.status,
      brand_id: options.brandId ?? null,
      owner_id: options.ownerId ?? null,
    };

    if (existingId) {
      if (!options.updateExisting) {
        summary.skipped++;
        if (summary.rows.length < MAX_REPORTED) {
          summary.rows.push({
            line: row.line,
            outcome: "skipped",
            label,
            reason: "Already exists",
          });
        }
        continue;
      }

      summary.updated++;
      if (summary.rows.length < MAX_REPORTED) {
        summary.rows.push({ line: row.line, outcome: "updated", label });
      }

      if (!dryRun) {
        // Updated one at a time: an update needs its own id, and merging by
        // email is not something a bulk upsert can express here.
        const { error } = await supabase
          .from("contacts")
          .update(payload)
          .eq("id", existingId);

        if (error) {
          summary.updated--;
          summary.failed++;
          if (summary.rows.length < MAX_REPORTED) {
            summary.rows.push({
              line: row.line,
              outcome: "failed",
              label,
              reason: error.message,
            });
          }
        }
      }
      continue;
    }

    summary.created++;
    if (summary.rows.length < MAX_REPORTED) {
      summary.rows.push({ line: row.line, outcome: "created", label });
    }

    if (email) seenInFile.set(email, "pending");

    if (!dryRun) {
      toInsert.push({
        ...payload,
        workspace_id: actor.workspace_id,
        created_by: actor.id,
      });
    }
  }

  // Inserted in batches. One statement per row would be thousands of round
  // trips to Seoul; one statement for everything would make a single bad row
  // lose the whole import.
  if (!dryRun && toInsert.length > 0) {
    const BATCH = 200;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const batch = toInsert.slice(i, i + BATCH);
      const { error } = await supabase.from("contacts").insert(batch);

      if (error) {
        return fail(
          `Imported ${i} of ${toInsert.length} new contacts, then failed: ${error.message}. The rows already written are saved.`,
        );
      }
    }
  }

  if (!dryRun) {
    revalidatePath("/contacts");
  }

  return ok(summary);
}
