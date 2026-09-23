"use client";

import { X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  id?: string;
  placeholder?: string;
  max?: number;
}

/**
 * Free-text tags. Enter or comma commits one, Backspace on an empty field
 * removes the last, and duplicates are folded case-insensitively so "VIP" and
 * "vip" do not become two different filters.
 */
export function TagInput({
  value,
  onChange,
  id,
  placeholder = "Add a tag and press Enter",
  max = 25,
}: TagInputProps) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const tag = raw.trim().replace(/,+$/, "");
    if (!tag) return;
    if (value.length >= max) return;
    if (value.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...value, tag]);
    setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      // Enter would otherwise submit the surrounding form.
      event.preventDefault();
      commit(draft);
      return;
    }

    if (event.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1 pr-1">
              {tag}
              <button
                type="button"
                onClick={() => onChange(value.filter((t) => t !== tag))}
                className="rounded-sm opacity-60 hover:opacity-100"
                aria-label={`Remove tag ${tag}`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <Input
        id={id}
        value={draft}
        placeholder={value.length >= max ? `Limit of ${max} tags reached` : placeholder}
        disabled={value.length >= max}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        // Commit whatever is typed if the user tabs away rather than pressing
        // Enter, so a half-entered tag is not silently discarded.
        onBlur={() => commit(draft)}
      />
    </div>
  );
}
