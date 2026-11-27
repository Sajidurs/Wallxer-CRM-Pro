/**
 * Centred, chrome-free shell for the pages you can reach while logged out.
 *
 * These routes never read cookies, so Next would prerender them. A prerender
 * is a static file: Vercel caches it for a year (`s-maxage=31536000`), and on
 * the custom domain that cache stored a 304 with an empty body. Browsers then
 * aborted every visit to /login. `force-dynamic` sets revalidate to 0, which
 * sends `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`
 * — a response the CDN will not store. The same config covers /auth/callback,
 * which is a client page and cannot export a segment config of its own.
 */
export const dynamic = "force-dynamic";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
