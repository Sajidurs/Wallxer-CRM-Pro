import { redirect } from "next/navigation";

/**
 * The proxy redirects `/` before it reaches here in both the logged-in and
 * logged-out cases. This exists so the route is never a dead end if the proxy
 * matcher is ever narrowed.
 */
export default function RootPage() {
  redirect("/dashboard");
}
