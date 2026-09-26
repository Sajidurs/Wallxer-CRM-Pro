import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * Signed URLs for company logos.
 *
 * Same shape as `signAvatars`: the bucket is private, so `brands.logo_path`
 * holds a path and the link is minted on read, batched and memoised per
 * request. Six hours rather than one, because an invoice left open in a tab to
 * be printed should not lose its letterhead halfway through.
 */

const TTL_SECONDS = 6 * 3600;

const signPaths = cache(async (key: string): Promise<Map<string, string>> => {
  const paths = key ? key.split("\n") : [];
  if (paths.length === 0) return new Map();

  const supabase = await createClient();
  const { data } = await supabase.storage
    .from("brand-logos")
    .createSignedUrls(paths, TTL_SECONDS);

  const signed = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) signed.set(row.path, row.signedUrl);
  }
  return signed;
});

export async function signLogos(
  paths: (string | null | undefined)[],
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))].sort();
  if (unique.length === 0) return new Map();
  return signPaths(unique.join("\n"));
}

export async function signLogo(path: string | null): Promise<string | null> {
  if (!path) return null;
  const map = await signLogos([path]);
  return map.get(path) ?? null;
}
