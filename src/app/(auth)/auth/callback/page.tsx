"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

/**
 * Lands here from an invite or recovery email.
 *
 * Supabase delivers the session in one of three shapes depending on the flow
 * and the email template, and which one arrives is not something this app
 * controls. Handling all three here is cheaper than constraining the project's
 * email templates and hoping they stay that way:
 *
 *   ?code=...                  PKCE, exchanged for a session
 *   ?token_hash=...&type=...   the modern server-friendly link
 *   #access_token=...          the legacy implicit flow, hash only
 *
 * The hash is the reason this is a client component. A server route handler
 * never receives it — browsers do not send the fragment to the server.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function complete() {
      const supabase = createClient();
      const url = new URL(window.location.href);
      const params = url.searchParams;
      const hash = new URLSearchParams(url.hash.replace(/^#/, ""));

      // Supabase reports failures in the query string or the hash.
      const errorDescription =
        params.get("error_description") ?? hash.get("error_description");
      if (errorDescription) {
        if (!cancelled) setError(errorDescription);
        return;
      }

      const next = params.get("next") ?? "/set-password";
      const code = params.get("code");
      const tokenHash = params.get("token_hash");
      const type = params.get("type");
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      let failure: string | null = null;

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        failure = error?.message ?? null;
      } else if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as "invite" | "recovery" | "email" | "magiclink",
        });
        failure = error?.message ?? null;
      } else if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        failure = error?.message ?? null;
      } else {
        failure = "This link is missing its sign-in token.";
      }

      if (cancelled) return;

      if (failure) {
        setError(failure);
        return;
      }

      router.replace(next.startsWith("/") ? next : "/set-password");
      router.refresh();
    }

    void complete();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>That link did not work</AlertTitle>
        <AlertDescription className="space-y-3">
          <p>{error}</p>
          <p className="text-sm">
            Invite and reset links expire. Ask an administrator to send a new
            one.
          </p>
          <Button variant="outline" size="sm" onClick={() => router.replace("/login")}>
            Back to sign in
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-10 text-muted-foreground">
      <Loader2 className="size-5 animate-spin" />
      <p className="text-sm">Signing you in…</p>
    </div>
  );
}
