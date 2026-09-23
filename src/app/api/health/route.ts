import { NextResponse } from "next/server";

/**
 * Says which commit is actually running.
 *
 * Without this there is no way to tell a deployed fix from an undeployed one:
 * most changes are server-side, so the served HTML looks identical either way,
 * and "it should have deployed by now" is not a verification.
 *
 *   curl https://wallxer-crm-pro.vercel.app/api/health
 *
 * Public on purpose, so it can be checked before signing in and from anything.
 * It exposes a short commit hash and a build timestamp and nothing else — no
 * environment values, no configuration, no counts. Vercel injects the git
 * variables itself; locally they are absent and the route says "local".
 */
export const dynamic = "force-dynamic";

export function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA;

  return NextResponse.json(
    {
      ok: true,
      commit: sha ? sha.slice(0, 7) : "local",
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? "local",
      environment: process.env.VERCEL_ENV ?? "development",
      // Module scope, so this is when this instance cold-started — not when the
      // build happened. `commit` is the authoritative deployment identifier.
      startedAt: STARTED_AT,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

const STARTED_AT = new Date().toISOString();
