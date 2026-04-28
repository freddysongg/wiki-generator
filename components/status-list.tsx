"use client";

import type { JSX } from "react";
import type { PdfStatus, Stage } from "@/lib/types";
import { cn } from "@/lib/utils";

const STAGE_LABEL: Record<Stage, string> = {
  queued: "Queued",
  parsing: "Parsing",
  ocr: "OCR",
  extracting: "Extracting",
  writing: "Writing",
  done: "Done",
  failed: "Failed",
};

interface Props {
  items: PdfStatus[];
}

export function StatusList({ items }: Props): JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col">
      {items.map((item, idx) => {
        const isFailed = item.stage === "failed";
        const isDone = item.stage === "done";
        const indexLabel = String(idx + 1).padStart(2, "0");
        return (
          <li
            key={item.pdfId}
            className="flex flex-col border-t border-rule first:border-t-0 py-2"
          >
            <div className="grid grid-cols-[28px_1fr_120px_80px] gap-3 items-baseline">
              <span className="t-label text-fg-faint num-tabular">
                {indexLabel}
              </span>
              <span className="t-body text-fg truncate" title={item.filename}>
                {item.filename}
              </span>
              <span
                className={cn(
                  "t-eyebrow",
                  isFailed
                    ? "text-brand-accent"
                    : isDone
                      ? "text-fg"
                      : "text-fg-mute",
                )}
              >
                {STAGE_LABEL[item.stage]}
              </span>
              <span className="t-meta text-fg-mute text-right num-tabular">
                {item.pagesGenerated > 0
                  ? `${item.pagesGenerated} pgs`
                  : "— pgs"}
              </span>
            </div>
            {isFailed && item.error ? (
              <div className="grid grid-cols-[28px_1fr] gap-3 mt-1">
                <span aria-hidden></span>
                <span className="t-meta text-brand-accent break-words">
                  {item.error}
                </span>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
