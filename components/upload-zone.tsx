"use client";

import type { ChangeEvent, DragEvent, JSX } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onFiles: (files: File[]) => void;
  disabled: boolean;
}

function filterPdfs(files: FileList | null): File[] {
  if (!files) return [];
  return Array.from(files).filter(
    (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
  );
}

export function UploadZone({ onFiles, disabled }: Props): JSX.Element {
  function handleChange(e: ChangeEvent<HTMLInputElement>): void {
    onFiles(filterPdfs(e.target.files));
    e.target.value = "";
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>): void {
    e.preventDefault();
    if (disabled) return;
    onFiles(filterPdfs(e.dataTransfer.files));
  }

  return (
    <label
      htmlFor="wiki-upload-input"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-10 transition-colors",
        "hover:bg-muted/50",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <UploadCloud className="h-8 w-8 text-muted-foreground" aria-hidden />
      <div className="flex flex-col items-center gap-1">
        <span className="text-sm font-medium">Drop PDFs here</span>
        <span className="text-xs text-muted-foreground">or click to choose files</span>
      </div>
      <input
        id="wiki-upload-input"
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="sr-only"
        onChange={handleChange}
        disabled={disabled}
      />
    </label>
  );
}
