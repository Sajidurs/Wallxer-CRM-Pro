import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

/**
 * Company logos, for the invoice letterhead.
 *
 * Shaped like `/api/avatar`: a route handler because a server action would put
 * the binary through the RSC protocol, and the same order of operations —
 * object first, row second, and the old file only once the row points at the
 * new one.
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

const UUID = /^[0-9a-f-]{36}$/i;

async function gate() {
  const actor = await getCurrentUser();
  if (!actor || actor.status !== "active") {
    return { ok: false as const, status: 401, error: "Not signed in." };
  }
  if (!can(actor, "update", "brand")) {
    return { ok: false as const, status: 403, error: "Only an admin can change companies." };
  }
  return { ok: true as const, actor, supabase: await createClient() };
}

export async function POST(request: NextRequest) {
  const g = await gate();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES + MULTIPART_OVERHEAD) {
    return NextResponse.json(
      { error: `That logo is larger than the ${MAX_MB} MB limit.` },
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
  const brandId = String(form.get("brandId") ?? "");

  if (!UUID.test(brandId)) {
    return NextResponse.json({ error: "Invalid company id." }, { status: 400 });
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No image was sent." }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "That image is empty." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That logo is larger than the ${MAX_MB} MB limit.` },
      { status: 413 },
    );
  }

  const extension = ALLOWED.get(file.type);
  if (!extension) {
    return NextResponse.json(
      { error: "A logo must be a PNG, JPEG or WebP." },
      { status: 415 },
    );
  }

  // The row is read through RLS, so this also proves the company is in the
  // caller's workspace before anything is written.
  const { data: brand } = await g.supabase
    .from("brands")
    .select("id, logo_path")
    .eq("id", brandId)
    .maybeSingle();

  if (!brand) {
    return NextResponse.json({ error: "That company does not exist." }, { status: 404 });
  }

  const path = `${g.actor.workspace_id}/${brandId}/${randomUUID()}.${extension}`;

  const { error: uploadError } = await g.supabase.storage
    .from("brand-logos")
    .upload(path, file, { contentType: file.type, upsert: false });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  const { error: rowError } = await g.supabase
    .from("brands")
    .update({ logo_path: path })
    .eq("id", brandId);

  if (rowError) {
    await g.supabase.storage.from("brand-logos").remove([path]);
    return NextResponse.json({ error: rowError.message }, { status: 400 });
  }

  if (brand.logo_path && brand.logo_path !== path) {
    await g.supabase.storage.from("brand-logos").remove([brand.logo_path]);
  }

  return NextResponse.json({ path });
}

export async function DELETE(request: NextRequest) {
  const g = await gate();
  if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status });

  const brandId = new URL(request.url).searchParams.get("brandId") ?? "";
  if (!UUID.test(brandId)) {
    return NextResponse.json({ error: "Invalid company id." }, { status: 400 });
  }

  const { data: brand } = await g.supabase
    .from("brands")
    .select("id, logo_path")
    .eq("id", brandId)
    .maybeSingle();

  if (!brand) {
    return NextResponse.json({ error: "That company does not exist." }, { status: 404 });
  }

  const { error } = await g.supabase
    .from("brands")
    .update({ logo_path: null })
    .eq("id", brandId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (brand.logo_path) {
    await g.supabase.storage.from("brand-logos").remove([brand.logo_path]);
  }

  return NextResponse.json({ ok: true });
}
