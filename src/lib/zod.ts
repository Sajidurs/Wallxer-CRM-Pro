import { z } from "zod";

/**
 * Shared Zod building blocks.
 *
 * The rule these exist to enforce: **every schema must be idempotent.**
 * `schema.parse(schema.parse(x))` has to succeed and return the same thing.
 *
 * That is not academic. A form submits the *transformed output* — React Hook
 * Form's `handleSubmit` hands the resolver's result to the submit handler — and
 * the server action then re-validates that output with the same schema, because
 * the client is not trustworthy. If the schema turns `""` into `null` on the way
 * out but only accepts `string | undefined` on the way in, the second parse
 * fails on every empty field, and the user sees a validation error naming
 * fields they never filled in.
 */

/**
 * An optional free-text field. Accepts a string, null, or undefined; always
 * returns a trimmed string or null.
 *
 * `.nullish()` rather than `.optional()` is the whole point: it lets the null
 * this produces travel back in.
 */
export function optionalText(max: number, message: string) {
  return z
    .string()
    .max(max, message)
    .nullish()
    .transform((value) => value?.trim() || null);
}

/** An optional foreign key. Same idempotence requirement. */
export function optionalId() {
  return z
    .uuid()
    .nullish()
    .transform((value) => value ?? null);
}

/**
 * Field errors keyed by dotted path: `address.city`, not `address`.
 *
 * `error.flatten().fieldErrors` only understands top-level keys, so every
 * nested issue collapses onto the parent — a key that matches no input, so the
 * message renders nowhere and the user is told to "check the details below"
 * with nothing marked. React Hook Form addresses nested fields by dotted path,
 * so producing them that way makes the message land on the right input.
 */
export function fieldErrorsFromZod(
  error: z.ZodError,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_form";
    (result[key] ??= []).push(issue.message);
  }

  return result;
}

/**
 * The message to show above the form.
 *
 * Returns a real problem rather than a generic "check the details below", so
 * that an error on a field the form does not currently render — a hidden field,
 * a field behind a tab — is still legible instead of invisible.
 */
export function firstIssueMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "That could not be saved.";

  if (issue.path.length === 0) return issue.message;

  return `${issue.path.join(".")}: ${issue.message}`;
}
