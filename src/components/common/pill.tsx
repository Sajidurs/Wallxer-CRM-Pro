import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The soft chip Notion uses for select and status properties.
 *
 * Pastel fill, dark text of the same hue, no border, and a small dot when the
 * value represents a state rather than a label. The palette is deliberately
 * desaturated: a dozen of these in a table should read as texture, not as a
 * set of warnings.
 */
export type PillTone =
  "grey" | "blue" | "green" | "amber" | "red" | "purple" | "pink";

/** Exported so other surfaces (card icon tiles) can tint from the same palette. */
export const TONE_CLASSES: Record<PillTone, string> = {
  grey: "bg-[#F1F0EF] text-[#5F5E5B] dark:bg-white/8 dark:text-white/70",
  blue: "bg-[#E7F3F8] text-[#28647D] dark:bg-[#1d3a47] dark:text-[#9ecfe4]",
  green: "bg-[#EDF3EC] text-[#4A7B45] dark:bg-[#22331f] dark:text-[#a9d3a1]",
  amber: "bg-[#FAEDDF] text-[#97663B] dark:bg-[#3a2c1a] dark:text-[#e2bd8a]",
  red: "bg-[#FBE9E7] text-[#A3564C] dark:bg-[#3d2320] dark:text-[#e0a79f]",
  purple: "bg-[#F1EDF5] text-[#6B5B8A] dark:bg-[#2e2838] dark:text-[#c3b3d9]",
  pink: "bg-[#FAF0F4] text-[#93577A] dark:bg-[#3a2630] dark:text-[#dfa9c4]",
};

const DOTS: Record<PillTone, string> = {
  grey: "bg-[#9B9A97]",
  blue: "bg-[#5B9DBB]",
  green: "bg-[#6FA368]",
  amber: "bg-[#D29A4E]",
  red: "bg-[#C87F73]",
  purple: "bg-[#9A85BD]",
  pink: "bg-[#C783A6]",
};

interface PillProps {
  children: ReactNode;
  tone?: PillTone;
  /** A leading dot, for values that describe a state. */
  dot?: boolean;
  className?: string;
}

export function Pill({
  children,
  tone = "grey",
  dot = false,
  className,
}: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded px-2 py-0.5 text-xs font-medium",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {dot && (
        <span
          className={cn("size-1.5 shrink-0 rounded-full", DOTS[tone])}
          aria-hidden
        />
      )}
      <span className="truncate">{children}</span>
    </span>
  );
}
