"use client";

import { usePathname } from "next/navigation";
import { ViewTransition, type ReactNode } from "react";

/**
 * A crossfade between pages, on React's `<ViewTransition>`.
 *
 * Only the content area is wrapped. The sidebar and topbar sit outside it, so
 * they ride the root snapshot and stay put — the content moved, not the
 * viewport, which is the whole point of anchoring a shell.
 *
 * The `key` is what makes this work in a layout. Layouts persist across
 * navigations, so a `<ViewTransition>` placed in one never sees an unmount and
 * never fires enter or exit. Keying on the path forces React to treat the old
 * and new page as an exit/enter pair instead of an in-place update, which is
 * the same mechanism the Next guide uses for same-route crossfades.
 *
 * Route navigations are React Transitions, so this needs no trigger of its own.
 * Where the View Transitions API is missing, pages swap instantly and nothing
 * else changes.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <ViewTransition
      key={pathname}
      name="page-content"
      share="page-swap"
      enter="page-swap"
      exit="page-swap"
      default="none"
    >
      {/* One wrapper element, deliberately. `<ViewTransition>` names every DOM
          child it is given, and these pages return fragments of several
          sections — so without this, React hands out `page-content`,
          `page-content_1`, `_2`, `_3`, and each section morphs into whatever
          section happens to sit in the same slot on the next page. The header
          morphing into a header is harmless; a stat strip morphing into a
          filter bar is not. One child means one group and one crossfade. */}
      <div className="space-y-6">{children}</div>
    </ViewTransition>
  );
}
