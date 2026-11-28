/**
 * Column lists for the two tools that must not widen.
 *
 * Credentials: the ciphertext columns are not granted to `authenticated`, and
 * naming them here means a `select *` cannot sneak in later. Attachments:
 * `storage_path` is how a file is fetched, so metadata stops before it.
 */

export const CREDENTIAL_LIST_COLUMNS =
  "id, project_id, contact_id, label, category, kind, url, username, created_at, updated_at";

export const ATTACHMENT_LIST_COLUMNS =
  "id, entity_type, entity_id, file_name, mime_type, size_bytes, created_at, created_by";

const BANNED = [
  "secret",
  "secret_encrypted",
  "notes_encrypted",
  "password",
  "storage_path",
  "bucket",
];

export function columnsAreMetadataOnly(columns: string): boolean {
  const names = columns.split(",").map((name) => name.trim().toLowerCase());
  if (names.length === 0 || names.some((name) => name === "" || name === "*")) return false;
  return names.every((name) => !BANNED.includes(name));
}
