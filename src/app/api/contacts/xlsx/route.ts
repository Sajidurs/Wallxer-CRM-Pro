import { NextResponse, type NextRequest } from "next/server";

import { xlsxToCsv } from "@/features/contacts/import/xlsx";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";

/**
 * Converts an uploaded spreadsheet to CSV so the existing importer can take it
 * from there. Nothing is written to the database here — this only reads a file
 * and hands back text, and the import itself still goes through the same
 * server action with the same validation.
 */

export const dynamic = "force-dynamic";

const MAX_MB = 10;
const MAX_BYTES = MAX_MB * 1024 * 1024;
const MULTIPART_OVERHEAD = 16 * 1024;

const ALLOWED = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  // Browsers are inconsistent about spreadsheet types, and some send nothing
  // at all; the extension check below is what actually decides.
  "application/octet-stream",
  "",
]);

export async function POST(request: NextRequest) {
  const actor = await getCurrentUser();

  if (!actor || actor.status !== "active") {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (!can(actor, "create", "contact")) {
    return NextResponse.json(
      { error: "You do not have permission to import contacts." },
      { status: 403 },
    );
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES + MULTIPART_OVERHEAD) {
    return NextResponse.json(
      { error: `That file is larger than the ${MAX_MB} MB limit.` },
      { status: 413 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "That upload could not be read." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was sent." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That file is larger than the ${MAX_MB} MB limit.` },
      { status: 413 },
    );
  }
  if (!/\.xlsx?$/i.test(file.name) || !ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: "Upload an .xlsx spreadsheet, or save it as CSV first." },
      { status: 415 },
    );
  }

  try {
    const result = await xlsxToCsv(Buffer.from(await file.arrayBuffer()));

    if (result.rowCount === 0) {
      return NextResponse.json(
        { error: "That sheet has no rows in it." },
        { status: 400 },
      );
    }

    return NextResponse.json(result);
  } catch {
    // An .xls from 1997 is a different format entirely, and this is where it
    // lands. Saying so is more use than "could not read file".
    return NextResponse.json(
      {
        error:
          "That spreadsheet could not be read. If it is an older .xls file, open it and save as .xlsx or CSV.",
      },
      { status: 400 },
    );
  }
}
