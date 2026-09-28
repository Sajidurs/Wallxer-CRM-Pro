import { NextResponse } from "next/server";

import { rowsToCsv } from "@/features/contacts/import/csv";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * Contacts out, as CSV.
 *
 * The columns are deliberately the importer's own field labels in the
 * importer's own order, so an export can be opened, edited and imported
 * straight back without remapping a single column. A format you can only read
 * is half a feature.
 *
 * A route handler rather than a server action: this returns a file, and the
 * browser needs `Content-Disposition` to save it rather than render it.
 */

export const dynamic = "force-dynamic";

/** Matches `IMPORT_FIELDS` and `FIELD_LABELS` in the importer. */
const COLUMNS = [
  "First name",
  "Last name",
  "Company",
  "Job title",
  "Email",
  "Phone",
  "WhatsApp",
  "Website",
  "Source",
  "Notes",
  "Tags",
  "Street",
  "City",
  "State or region",
  "Country",
  "Postal code",
  // Not importable, but the two questions asked of any export.
  "Status",
  "Created",
] as const;

interface Address {
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  postal?: string;
}

export async function GET() {
  const actor = await getCurrentUser();

  if (!actor || actor.status !== "active") {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!can(actor, "view", "contact")) {
    return NextResponse.json({ error: "Not permitted." }, { status: 403 });
  }

  const supabase = await createClient();

  // Read through the user's client, so RLS decides what leaves the building.
  // An export is exactly the wrong place to reach for the service role.
  const { data, error } = await supabase
    .from("contacts")
    .select(
      "first_name, last_name, company_name, job_title, email, phone, whatsapp, website, source, notes, tags, address, status, created_at",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows: string[][] = [[...COLUMNS]];

  for (const c of data ?? []) {
    const address = (c.address ?? {}) as Address;

    rows.push([
      c.first_name ?? "",
      c.last_name ?? "",
      c.company_name ?? "",
      c.job_title ?? "",
      c.email ?? "",
      c.phone ?? "",
      c.whatsapp ?? "",
      c.website ?? "",
      c.source ?? "",
      c.notes ?? "",
      // Semicolons, because the importer splits tags on them and a comma would
      // need quoting to survive its own column.
      (c.tags ?? []).join("; "),
      address.street ?? "",
      address.city ?? "",
      address.state ?? "",
      address.country ?? "",
      address.postal ?? "",
      c.status ?? "",
      c.created_at ? c.created_at.slice(0, 10) : "",
    ]);
  }

  // Excel reads a CSV as the system codepage unless there is a BOM, which turns
  // every non-Latin name into mojibake on a Windows machine.
  const csv = "﻿" + rowsToCsv(rows);
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contacts-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
