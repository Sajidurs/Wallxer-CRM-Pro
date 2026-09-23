/**
 * Centred, chrome-free shell for the pages you can reach while logged out.
 */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-muted/40 p-6">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
