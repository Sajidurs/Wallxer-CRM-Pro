/**
 * Environment access, validated once at first use.
 *
 * Reading env vars through these helpers instead of `process.env.X!` means a
 * missing variable fails with a sentence you can act on, at the moment the app
 * boots, rather than as a null dereference three layers into the Supabase SDK.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

/** Safe in the browser. Anything here is public — see SYSTEM_DESIGN.md section 12. */
export const publicEnv = {
  supabaseUrl: () =>
    required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: () =>
    required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
  /**
   * The app's own origin, used to build links that arrive by email.
   *
   * Resolved rather than required, so a deploy cannot silently mail out links
   * pointing at localhost:
   *
   *   1. NEXT_PUBLIC_APP_URL, if you set it explicitly.
   *   2. Vercel's production domain, which Vercel injects itself. Preview
   *      deployments resolve to production here on purpose — an invite should
   *      land on the real app, not on a preview that will be torn down.
   *   3. localhost, for development.
   *
   * Vercel's variables carry no protocol, so https is prepended.
   */
  appUrl: () => {
    const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (explicit) return explicit.replace(/\/$/, "");

    // The NEXT_PUBLIC_ copy exists in the browser too; the bare one is
    // server-only. Checking both keeps this correct on either side.
    const vercelHost =
      process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL ??
      process.env.VERCEL_PROJECT_PRODUCTION_URL;

    if (vercelHost) return `https://${vercelHost.replace(/\/$/, "")}`;

    return "http://localhost:3000";
  },
};

/** Server only. Never import this from a client component. */
export const serverEnv = {
  supabaseServiceRoleKey: () =>
    required(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),

  /**
   * Whether outbound email can be relied on.
   *
   * Defaults to false, because Supabase's built-in mailer allows two messages
   * an hour and on a new project only delivers to addresses on the Supabase
   * org. Set this to true once custom SMTP is configured; it only changes which
   * option the Add user dialog defaults to, never what is allowed.
   */
  emailEnabled: () => process.env.SUPABASE_EMAIL_ENABLED === "true",
};
