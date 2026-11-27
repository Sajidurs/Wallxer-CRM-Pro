import { redirect } from "next/navigation";

/**
 * The proxy redirects `/` before it reaches here in both the logged-in and
 * logged-out cases. This exists so the route is never a dead end if the proxy
 * matcher is ever narrowed.
 *
 * It has to stay dynamic. A prerendered redirect is a static file, and Vercel
 * would cache that file for a year — the same failure that emptied /login.
 */
export const dynamic = "force-dynamic";

export default function RootPage() {
  redirect("/dashboard");
}
