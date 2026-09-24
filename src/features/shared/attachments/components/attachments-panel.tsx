"use client";

import { formatDistanceToNow } from "date-fns";
import {
  Download,
  FileText,
  ImageIcon,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/common/empty-state";
import { Button } from "@/components/ui/button";
import type { EntityType } from "@/lib/entities";

import { getDownloadUrl, removeAttachment } from "../actions";
import type { Attachment } from "../queries";

interface AttachmentsPanelProps {
  entityType: EntityType;
  entityId: string;
  attachments: Attachment[];
  uploaderNames: Record<string, string>;
  currentUserId: string;
  canManage: boolean;
}

function formatSize(bytes: number | null) {
  if (bytes === null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentsPanel({
  entityType,
  entityId,
  attachments,
  uploaderNames,
  currentUserId,
  canManage,
}: AttachmentsPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;

    setUploading(true);
    let succeeded = 0;

    // Sequential rather than parallel: a handful of 25 MB uploads at once on a
    // typical connection is slower overall and makes failures harder to report.
    for (const file of Array.from(files)) {
      const body = new FormData();
      body.append("file", file);
      body.append("entityType", entityType);
      body.append("entityId", entityId);

      try {
        const response = await fetch("/api/upload", { method: "POST", body });
        const payload = await response.json();

        if (!response.ok) {
          toast.error(payload.error ?? `${file.name} could not be uploaded.`);
        } else {
          succeeded++;
        }
      } catch {
        toast.error(`${file.name} could not be uploaded.`);
      }
    }

    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";

    if (succeeded > 0) {
      toast.success(
        succeeded === 1 ? "File uploaded." : `${succeeded} files uploaded.`,
      );
      // A full refresh rather than optimistic insertion: the row the server
      // created is the source of truth for the name it actually stored.
      window.location.reload();
    }
  }

  function download(id: string) {
    startTransition(async () => {
      const result = await getDownloadUrl({ id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      // The signed URL lives for 60 seconds and is used immediately.
      window.open(result.data.url, "_blank", "noopener,noreferrer");
    });
  }

  function remove(id: string, name: string) {
    startTransition(async () => {
      const result = await removeAttachment({ id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${name} removed.`);
      window.location.reload();
    });
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void upload(event.dataTransfer.files);
        }}
        className={`rounded-lg border border-dashed p-6 text-center transition-colors ${
          dragging ? "border-primary bg-primary/5" : ""
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => void upload(event.target.files)}
        />

        <Upload className="mx-auto mb-2 size-5 text-muted-foreground" />
        <p className="text-sm">
          Drop files here, or{" "}
          <button
            type="button"
            className="font-medium underline underline-offset-4"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
          >
            choose files
          </button>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          PDF, Word, Excel, PowerPoint, images, zip. Up to 25 MB each.
        </p>

        {uploading && (
          <p className="mt-3 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Uploading
          </p>
        )}
      </div>

      {attachments.length === 0 ? (
        <EmptyState
          icon={Paperclip}
          title="No files yet"
          description="Contracts, designs, invoices from suppliers. Anything worth keeping with this record."
        />
      ) : (
        <ul className="divide-y rounded-lg border">
          {attachments.map((attachment) => {
            const isImage = attachment.mime_type?.startsWith("image/");
            const Icon = isImage ? ImageIcon : FileText;
            const mine = attachment.created_by === currentUserId;

            return (
              <li key={attachment.id} className="flex items-center gap-3 p-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                  <Icon className="size-4 text-muted-foreground" />
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {attachment.file_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatSize(attachment.size_bytes)}
                    {attachment.created_by &&
                      ` · ${uploaderNames[attachment.created_by] ?? "someone"}`}
                    {` · ${formatDistanceToNow(new Date(attachment.created_at))} ago`}
                  </p>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  disabled={isPending}
                  onClick={() => download(attachment.id)}
                  aria-label={`Download ${attachment.file_name}`}
                >
                  <Download />
                </Button>

                {(canManage || mine) && (
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isPending}
                    onClick={() => remove(attachment.id, attachment.file_name)}
                    aria-label={`Remove ${attachment.file_name}`}
                  >
                    <Trash2 />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
