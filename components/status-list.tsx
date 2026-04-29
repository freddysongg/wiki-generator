"use client";

import { useState } from "react";
import type { JSX } from "react";
import type { ManifestPage, PdfStatus, Stage } from "@/lib/types";
import { useBatch } from "@/components/batch-context";
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
  onPageOpen?: (page: ManifestPage) => void;
}

export function StatusList({ items, onPageOpen }: Props): JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col">
      {items.map((item, idx) => (
        <StatusRow
          key={item.pdfId}
          item={item}
          index={idx}
          onPageOpen={onPageOpen}
        />
      ))}
    </ul>
  );
}

interface RowProps {
  item: PdfStatus;
  index: number;
  onPageOpen?: (page: ManifestPage) => void;
}

function StatusRow({ item, index, onPageOpen }: RowProps): JSX.Element {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const { getPagesForSource } = useBatch();
  const pages = item.stage === "done" ? getPagesForSource(item.filename) : [];
  const canExpand = pages.length > 0 && Boolean(onPageOpen);
  const isFailed = item.stage === "failed";
  const isDone = item.stage === "done";
  const indexLabel = String(index + 1).padStart(2, "0");

  return (
    <li className="flex flex-col border-t border-rule first:border-t-0 py-2">
      <div className="grid grid-cols-[28px_1fr_120px_80px_28px] gap-3 items-baseline">
        <span className="t-label text-fg-faint num-tabular">{indexLabel}</span>
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
          {item.pagesGenerated > 0 ? `${item.pagesGenerated} pgs` : "— pgs"}
        </span>
        {canExpand ? (
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "collapse pages" : "expand pages"}
            className="t-meta text-fg-mute hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-fg focus-visible:outline-offset-[-2px]"
          >
            {isExpanded ? "▾" : "▸"}
          </button>
        ) : (
          <span aria-hidden></span>
        )}
      </div>
      {isFailed && item.error ? (
        <div className="grid grid-cols-[28px_1fr] gap-3 mt-1">
          <span aria-hidden></span>
          <span className="t-meta text-brand-accent break-words">
            {item.error}
          </span>
        </div>
      ) : null}
      {canExpand && isExpanded ? (
        <ul className="flex flex-col mt-2 ml-7 border-l border-rule">
          {pages.map((page) => (
            <li key={page.filename}>
              <button
                type="button"
                onClick={() => onPageOpen?.(page)}
                className="w-full grid grid-cols-[1fr_auto] gap-3 items-baseline px-3 py-1.5 text-left border-t border-rule first:border-t-0 hover:bg-bg-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fg focus-visible:outline-offset-[-2px]"
              >
                <span className="t-body text-fg truncate" title={page.title}>
                  {page.title}
                </span>
                <span className="t-meta text-fg-mute num-tabular">
                  {page.sourcePages}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
