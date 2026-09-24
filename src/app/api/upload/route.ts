import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { isEntityType } from "@/lib/entities";
import { createClient } from "@/lib/supabase/server";

/**
 * File uploads. SYSTEM_DESIGN 7.4.
 *
 * A route handler rather than a server action because server actions serialise
 * their arguments through the RSC protocol, which is a poor fit for a 25 MB
 * binary. This streams the file straight to Supabase Storage instead.
 *
 * Order matters: permission, then size, then MIME, then the object, and only
 * then the `attachments` row. Writing the row first would leave a record of a
 * file that does not exist if the upload fails.
 */

export const dynamic = "force-dynamic";

const MAX_MB = 25;
const MAX_BYTES = MAX_MB * 1024 * 1024;

/**
 * Multipart framing — boundaries, headers, the other form fields — adds a
 * little to the request beyond the file itself. Allowing a small margin before
 * rejecting on Content-Length keeps a file that is exactly at the limit from
 * being turned away for its own envelope.
 */
const MULTIPART_OVERHEAD = 16 * 1024;

/**
 * Checked here as well as on the bucket. The bucket's list is the real
 * boundary; this one exists to fail early with a message that names the file.
 */
const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "text/plain",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

/**
 * Strips directory separators and anything that would be awkward in an object
 * name. The uuid prefix already guarantees uniqueness, so this only has to make
 * the name safe and recognisable — a path traversal attempt becomes a filename.
 */
function safeName(name: string) {
  return (
    name
      .replace(/[/\\]/g, "-")
      .replace(/[^\w.\- ]+/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "file"
  );
}

export async function POST(request: NextRequest) {
  const actor = await getCurrentUser();

  if (!actor || actor.status !== "active") {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // Checked before the body is read. Parsing a 26 MB multipart body only to
  // reject it wastes the upload and, worse, the parser gives up first and the
  // size check below never runs — the caller gets "malformed upload" for a file
  // that is merely too big. Content-Length is a hint, not a guarantee, so the
  // real check still happens on the parsed file.
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BYTES + MULTIPART_OVERHEAD) {
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
      {
        error:
          "That upload could not be read. If the file is close to the 25 MB limit, try a smaller one.",
      },
      { status: 400 },
    );
  }

  const file = form.get("file");
  const entityType = String(form.get("entityType") ?? "");
  const entityId = String(form.get("entityId") ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file was sent." }, { status: 400 });
  }

  if (!isEntityType(entityType)) {
    return NextResponse.json(
      { error: "That entity type is not one files can attach to." },
      { status: 400 },
    );
  }

  if (!/^[0-9a-f-]{36}$/i.test(entityId)) {
    return NextResponse.json({ error: "Invalid entity id." }, { status: 400 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "That file is empty." }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `${file.name} is larger than the ${MAX_MB} MB limit.` },
      { status: 413 },
    );
  }

  if (!ALLOWED_MIME.has(file.type)) {
    return NextResponse.json(
      { error: `${file.type || "That file type"} is not allowed.` },
      { status: 415 },
    );
  }

  const supabase = await createClient();

  // {workspace_id}/{entity_type}/{entity_id}/{uuid}-{filename}. The storage
  // policy matches on the first segment, so the workspace prefix is what keeps
  // one workspace's files unreachable from another.
  const storagePath = `${actor.workspace_id}/${entityType}/${entityId}/${randomUUID()}-${safeName(file.name)}`;

  const { error: uploadError } = await supabase.storage
    .from("project-files")
    .upload(storagePath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("attachments")
    .insert({
      workspace_id: actor.workspace_id,
      entity_type: entityType,
      entity_id: entityId,
      bucket: "project-files",
      storage_path: storagePath,
      file_name: safeName(file.name),
      mime_type: file.type,
      size_bytes: file.size,
      created_by: actor.id,
    })
    .select("id, file_name, size_bytes, mime_type, created_at")
    .single();

  if (error) {
    // The object is already in the bucket. Remove it rather than leaving an
    // unreferenced file nothing will ever clean up.
    await supabase.storage.from("project-files").remove([storagePath]);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ attachment: data }, { status: 201 });
}
