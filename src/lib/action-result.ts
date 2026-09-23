/**
 * The shape every server action returns.
 *
 * Actions never throw across the client boundary: a thrown error in production
 * reaches the browser as "an error occurred in the Server Components render",
 * which tells the user nothing and tells you less. Return a result instead and
 * let the caller decide how to show it.
 *
 * `redirect()` and `notFound()` are the exceptions — they signal by throwing,
 * and Next handles them. Call those only after the work has succeeded.
 */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export function ok(): ActionResult<undefined>;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | undefined> {
  return { ok: true, data };
}

export function fail(
  error: string,
  fieldErrors?: Record<string, string[]>,
): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}
