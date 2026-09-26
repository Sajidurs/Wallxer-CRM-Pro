"use client";

import { ImageIcon, Loader2, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

interface LogoUploadProps {
  brandId: string;
  /** A signed URL, or null when there is no logo yet. */
  currentUrl: string | null;
}

/** The letterhead image. Same upload-on-selection behaviour as a profile photo. */
export function LogoUpload({ brandId, currentUrl }: LogoUploadProps) {
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
      body.append("brandId", brandId);

      const res = await fetch("/api/brand-logo", { method: "POST", body });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        setPreview(null);
        toast.error(payload.error ?? "That logo could not be uploaded.");
        return;
      }

      toast.success("Logo updated.");
      router.refresh();
    } catch {
      setPreview(null);
      toast.error("That logo could not be uploaded.");
    } finally {
      setBusy(false);
      URL.revokeObjectURL(localUrl);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/brand-logo?brandId=${brandId}`, { method: "DELETE" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error ?? "That logo could not be removed.");
        return;
      }
      setPreview(null);
      toast.success("Logo removed.");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-card">
        {shown ? (
          // A plain img: the source is a signed Storage URL that changes on
          // every render, which is exactly what next/image cannot cache.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="" className="size-full object-contain p-1.5" />
        ) : (
          <ImageIcon className="size-6 text-muted-foreground/50" />
        )}
      </div>

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
            {shown ? "Change logo" : "Upload logo"}
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
          PNG, JPEG or WebP, up to 2 MB. Shown at the top of every invoice.
        </p>
      </div>

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
