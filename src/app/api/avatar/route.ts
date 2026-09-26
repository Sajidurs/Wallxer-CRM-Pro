import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/**
 * Profile photos.
 *
 * A route handler rather than a server action for the same reason as
 * `/api/upload`: a server action serialises its arguments through the RSC
 * protocol, which is a poor way to move a binary. This streams to Storage.
 *
 * The bucket enforces the real limits — 2 MB, and png/jpeg/webp only. The
 * checks here exist to fail early with a sentence someone can act on rather
 * than a storage error.
 */

export const dynamic = "force-dynamic";

const MAX_MB = 2;
const MAX_BYTES = MAX_MB * 1024 * 1024;
const MULTIPART_OVERHEAD = 16 * 1024;

const ALLOWED = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
]);

export async function POST(request: NextRequest) {
  const actor = await getCurrentUser();

  if (!actor || actor.status !== "active") {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // Before the body is read: the parser gives up on an oversized multipart
  // first, and the caller would get "could not be read" for a file that is
  // merely too large.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES + MULTIPART_OVERHEAD) {
    return NextResponse.json(
      { error: `That image is larger than the ${MAX_MB} MB limit.` },
      { status: 413 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "That upload could not be read. Try a smaller image." },
      { status: 400 },
    );
  }

  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No image was sent." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That image is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That image is larger than the ${MAX_MB} MB limit.` },
      { status: 413 },
    );
  }

  const extension = ALLOWED.get(file.type);
  if (!extension) {
    return NextResponse.json(
      { error: "Profile photos must be a PNG, JPEG or WebP." },
      { status: 415 },
    );
  }

  const supabase = await createClient();

  // {workspace_id}/{user_id}/{uuid}.{ext}. The storage policies match on the
  // first segment for the workspace and the second for the owner, so the path
  // is what makes "your own photo" enforceable rather than merely intended.
  const path = `${actor.workspace_id}/${actor.id}/${randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  const previous = actor.avatar_url;

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ avatar_url: path })
    .eq("id", actor.id);

  if (profileError) {
    // The row is the record; an object nobody points at is litter. Undo the
    // upload rather than leave the two disagreeing.
    await supabase.storage.from("avatars").remove([path]);
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  // Only after the profile points at the new one. Losing the old object is
  // harmless; losing the new one before the row is written is not.
  if (previous && previous !== path) {
    await supabase.storage.from("avatars").remove([previous]);
  }

  return NextResponse.json({ path });
}

/** Remove the photo and fall back to initials. */
export async function DELETE() {
  const actor = await getCurrentUser();

  if (!actor || actor.status !== "active") {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", actor.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (actor.avatar_url) {
    await supabase.storage.from("avatars").remove([actor.avatar_url]);
  }

  return NextResponse.json({ ok: true });
}
