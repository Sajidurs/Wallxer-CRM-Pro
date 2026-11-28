import { mcpHandler } from "@/features/mcp/server";
import { parseBearer } from "@/features/mcp/auth";
import { bindContext, McpAuthError, openContext } from "@/features/mcp/context";
import { publicError } from "@/features/mcp/redact";

/**
 * Remote MCP endpoint. Streamable HTTP, no browser session.
 *
 * The proxy lets this path through without a login redirect. Auth is the
 * bearer key. Responses are not cacheable: a cached tool result would be
 * another workspace's data the moment a shared cache got involved.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = "private, no-cache, no-store, max-age=0, must-revalidate";

function withNoStore(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", NO_STORE);
  headers.set("CDN-Cache-Control", "no-store");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function denied(message: string, status: 401 | 403) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": NO_STORE,
      "CDN-Cache-Control": "no-store",
      "WWW-Authenticate": 'Bearer realm="wallxer-crm"',
    },
  });
}

async function handle(request: Request): Promise<Response> {
  const parsed = parseBearer(request.headers.get("authorization"));
  if (!parsed.ok) return denied(parsed.error, 401);

  try {
    const ctx = await openContext(parsed.token);
    bindContext(request, ctx);
    return withNoStore(await mcpHandler(request));
  } catch (error) {
    if (error instanceof McpAuthError) return denied(error.message, error.status);
    const message = error instanceof Error ? error.message : "Could not authenticate this key.";
    console.error("mcp auth failed", publicError(message));
    return denied("Could not authenticate this key.", 401);
  }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
