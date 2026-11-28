/**
 * Last line of defence before anything from a tool is serialised.
 *
 * Callers already select safe columns. This drops a secret-shaped key if one
 * is ever added to a row, and strips a bearer token out of an error string
 * so a database message cannot echo a key back to the client.
 */

const SECRET_KEYS = new Set([
  "secret",
  "secret_encrypted",
  "notes_encrypted",
  "password",
  "token",
  "access_token",
  "refresh_token",
  "hashed_token",
  "secret_hash",
  "api_key",
  "authorization",
  "storage_path",
]);

export function redactString(value: string): string {
  return value
    .replace(/wxm_[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
}

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEYS.has(key.toLowerCase())) continue;
      out[key] = redact(child);
    }
    return out;
  }

  if (typeof value === "string") return redactString(value);
  return value;
}

/** An error a client may see. Short, and with any key-shaped text removed. */
export function publicError(message: string): string {
  const clean = redactString(message).replace(/\s+/g, " ").trim();
  if (!clean) return "That could not be done.";
  return clean.length > 300 ? `${clean.slice(0, 297)}...` : clean;
}
