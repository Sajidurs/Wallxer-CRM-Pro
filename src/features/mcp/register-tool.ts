import type { McpServer } from "@modelcontextprotocol/server";
import type { z } from "zod";

import { firstIssueMessage } from "@/lib/zod";

import { writeAudit } from "./audit";
import { scopeDenial, type ToolAccess } from "./auth";
import { contextFrom, type McpContext } from "./context";
import { publicError, redact } from "./redact";

export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

export function parseWith<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ToolError(firstIssueMessage(parsed.error));
  return parsed.data;
}

export function assertOk(error: { message: string } | null): void {
  if (error) throw new ToolError(publicError(error.message));
}

export function assertFound<T>(
  row: T | null | undefined,
  label: string,
): asserts row is NonNullable<T> {
  if (row == null) throw new ToolError(`That ${label} no longer exists.`);
}

const MONEY_KEYS = new Set(["amount", "unitAmount", "price", "cost"]);

/**
 * Numbers in money fields are major units ("2500" means 2500, not 25.00).
 *
 * The form schemas treat a number as already-minor so a second parse of their
 * own output stays stable. A model will send `2500` meaning two thousand.
 * Stringifying first sends it down the major-unit path of those schemas.
 */
export function coerceMoneyInput(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(coerceMoneyInput);
  if (!value || typeof value !== "object") return value;

  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (MONEY_KEYS.has(key) && typeof child === "number") out[key] = String(child);
    else if (child && typeof child === "object") out[key] = coerceMoneyInput(child);
    else out[key] = child;
  }
  return out;
}

export function likePattern(q: string): string {
  const cleaned = q.replace(/[%_\\]/g, "").trim();
  return `%${cleaned}%`;
}

export function pageWindow(page: number, limit: number) {
  const from = (page - 1) * limit;
  return { from, to: from + limit - 1 };
}

function entityIdFrom(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" ? record.id : null;
}

/**
 * Register one tool. Write calls are audited, including a scope refusal.
 * Read calls are not: the audit table is for changes, not for browsing.
 */
export function registerTool<S extends z.ZodType>(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: S,
  access: ToolAccess,
  entityType: string | null,
  handle: (ctx: McpContext, input: z.output<S>) => Promise<unknown>,
) {
  const writing = access.kind === "write" || access.kind === "finance-write";

  // The SDK's overloads want either a raw Zod shape or a Standard Schema
  // instance. A generic ZodType matches neither cleanly, so the config and
  // the callback are asserted at this one boundary.
  server.registerTool(
    name,
    {
      description,
      inputSchema,
      annotations: {
        readOnlyHint: !writing,
        destructiveHint: false,
        idempotentHint: !writing,
        openWorldHint: false,
      },
    } as never,
    (async (args: unknown, extra: { http?: { req?: Request } }) => {
      const ctx = contextFrom(extra.http?.req);
      const input = args as z.output<S>;
      const denied = scopeDenial(ctx.scopes, ctx.profile, access);
      const requestedId = entityIdFrom(input);

      if (denied) {
        if (writing) await writeAudit(ctx, name, entityType, requestedId, false, denied);
        return { isError: true, content: [{ type: "text" as const, text: denied }] };
      }

      try {
        const data = await handle(ctx, input);
        const entityId = entityIdFrom(data) ?? requestedId;
        if (writing) await writeAudit(ctx, name, entityType, entityId, true, null);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(redact(data), null, 2) }],
        };
      } catch (error) {
        const message = publicError(
          error instanceof Error ? error.message : "That could not be done.",
        );
        if (writing) await writeAudit(ctx, name, entityType, requestedId, false, message);
        return { isError: true, content: [{ type: "text" as const, text: message }] };
      }
    }) as never,
  );
}
