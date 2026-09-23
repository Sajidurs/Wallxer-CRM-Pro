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
  appUrl: () =>
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "http://localhost:3000",
};

/** Server only. Never import this from a client component. */
export const serverEnv = {
  supabaseServiceRoleKey: () =>
    required(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
};
