"use client";

import type { ChangeEvent, DragEvent, JSX } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  onFiles: (files: File[]) => void;
  disabled: boolean;
}

function filterPdfs(files: FileList | null): File[] {
  if (!files) return [];
  return Array.from(files).filter(
    (f) =>
      f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
  );
}

export function UploadZone({ onFiles, disabled }: Props): JSX.Element {
  const [isDragging, setIsDragging] = useState<boolean>(false);

  function handleChange(e: ChangeEvent<HTMLInputElement>): void {
    onFiles(filterPdfs(e.target.files));
    e.target.value = "";
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>): void {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    onFiles(filterPdfs(e.dataTransfer.files));
  }

  function handleDragOver(e: DragEvent<HTMLLabelElement>): void {
    e.preventDefault();
    if (disabled) return;
    setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent<HTMLLabelElement>): void {
    e.preventDefault();
    setIsDragging(false);
  }

  return (
    <label
      htmlFor="wiki-upload-input"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      data-active={isDragging}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-1 px-6 py-8 text-center",
        "border border-dashed border-rule-2 bg-bg",
        "transition-[background-color,border-color] duration-100",
        "hover:bg-bg-2",
        "data-[active=true]:border-fg data-[active=true]:border-solid data-[active=true]:bg-bg-2",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      <span className="t-label text-fg">Drop or select PDF</span>
      <span className="t-meta text-fg-mute">multiple files supported</span>
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
