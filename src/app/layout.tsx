import type { Metadata } from "next";
import { Manrope } from "next/font/google";

import { Providers } from "@/components/providers";
import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

/**
 * Manrope is the only typeface the app loads.
 *
 * `next/font` self-hosts it, so there is no request to Google at runtime and no
 * layout shift while it arrives. The variable is read by `--font-sans` in
 * globals.css; exposing one that nothing consumes is how the previous font
 * ended up being downloaded on every page and never rendered.
 */
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Agency CRM",
    template: "%s · Agency CRM",
  },
  description: "Internal CRM for contacts, pipeline, projects, and tasks.",
  // Internal tool behind a login. Nothing here should ever be indexed.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <Providers>{children}</Providers>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
