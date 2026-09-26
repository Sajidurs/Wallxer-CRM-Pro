"use client";

import { Loader2, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

interface AvatarUploadProps {
  /** A signed URL, or null when there is no photo yet. */
  currentUrl: string | null;
  fullName: string;
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

/**
 * Pick a photo, see it immediately, or take it away again.
 *
 * The preview is a local object URL so the face changes the moment the file is
 * chosen, rather than after a round trip to Seoul and back. The server is still
 * the authority — a refusal replaces the preview with what was there before.
 */
export function AvatarUpload({ currentUrl, fullName }: AvatarUploadProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shown = preview ?? currentUrl;

  async function upload(file: File) {
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    setBusy(true);

    try {
      const body = new FormData();
      body.append("file", file);

      const res = await fetch("/api/avatar", { method: "POST", body });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        setPreview(null);
        toast.error(payload.error ?? "That photo could not be uploaded.");
        return;
      }

      toast.success("Profile photo updated.");
      router.refresh();
    } catch {
      setPreview(null);
      toast.error("That photo could not be uploaded.");
    } finally {
      setBusy(false);
      URL.revokeObjectURL(localUrl);
      // So choosing the same file twice in a row still fires a change event.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch("/api/avatar", { method: "DELETE" });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast.error(payload.error ?? "That photo could not be removed.");
        return;
      }

      setPreview(null);
      toast.success("Profile photo removed.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar className="size-16">
        {shown && <AvatarImage src={shown} alt="" />}
        <AvatarFallback className="text-lg">{initials(fullName)}</AvatarFallback>
      </Avatar>

      <div className="space-y-2">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Upload />}
            {shown ? "Change photo" : "Upload photo"}
          </Button>

          {currentUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={remove}
              className="text-muted-foreground"
            >
              <Trash2 />
              Remove
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          PNG, JPEG or WebP, up to 2 MB.
        </p>
      </div>

      {/* Outside the profile form on purpose: this uploads on selection rather
          than on submit, so nesting it would make Save look responsible for a
          change that has already happened. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
    </div>
  );
}
