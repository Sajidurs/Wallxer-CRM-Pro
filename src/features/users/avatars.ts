import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/**
 * Signed URLs for profile photos.
 *
 * The `avatars` bucket is private — SYSTEM_DESIGN 7.4 rules out public URLs —
 * so `profiles.avatar_url` holds a storage *path* and the link has to be minted
 * on read. Doing that per row would be one Storage round trip per face on a
 * task board; `createSignedUrls` takes the whole list at once, and `cache()`
 * collapses the repeats within a single request, since the same person appears
 * in the sidebar, the topbar and several task cards on one page.
 */

/** An hour. Long enough that a page open in a tab keeps its faces. */
const TTL_SECONDS = 3600;

export type AvatarMap = Map<string, string>;

const signPaths = cache(async (key: string): Promise<AvatarMap> => {
  const paths = key ? key.split("\n") : [];
  if (paths.length === 0) return new Map();

  const supabase = await createClient();
  const { data } = await supabase.storage
    .from("avatars")
    .createSignedUrls(paths, TTL_SECONDS);

  const signed: AvatarMap = new Map();
  for (const row of data ?? []) {
    // `path` comes back as sent; a row with an error has a null signedUrl,
    // which is the case where someone's file was removed out from under the
    // profile row. A missing face falls back to initials rather than breaking.
    if (row.path && row.signedUrl) signed.set(row.path, row.signedUrl);
  }
  return signed;
});

/**
 * Takes whatever `avatar_url` values you have, returns a path → URL map.
 *
 * Nulls and duplicates are stripped first, so callers can pass a raw column
 * straight from a list without filtering.
 */
export async function signAvatars(
  paths: (string | null | undefined)[],
): Promise<AvatarMap> {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))].sort();
  if (unique.length === 0) return new Map();

  // `cache()` keys on arguments, and an array is compared by identity — a fresh
  // array every call would miss every time. Joining makes the key a value.
  return signPaths(unique.join("\n"));
}

/** The common case: one person's photo, or null. */
export async function signAvatar(path: string | null): Promise<string | null> {
  if (!path) return null;
  const map = await signAvatars([path]);
  return map.get(path) ?? null;
}
