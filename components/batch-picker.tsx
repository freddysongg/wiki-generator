"use client";

import type { JSX } from "react";
import { cn } from "@/lib/utils";
import type { BatchSummary } from "@/lib/types";

interface Props {
  batches: ReadonlyArray<BatchSummary>;
  selectedBatchId: string | null;
  onSelect: (batchId: string) => void;
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return DATE_FORMAT.format(parsed);
}

export function BatchPicker({
  batches,
  selectedBatchId,
  onSelect,
}: Props): JSX.Element {
  return (
    <div
      role="radiogroup"
      aria-label="batch"
      className="flex flex-wrap gap-1.5 items-center"
    >
      {batches.map((batch) => {
        const isSelected = batch.batchId === selectedBatchId;
        return (
          <button
            key={batch.batchId}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onSelect(batch.batchId)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 t-label border border-rule",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-fg focus-visible:outline-offset-[-2px]",
              isSelected ? "bg-fg text-bg" : "text-fg-mute hover:bg-bg-2",
            )}
          >
            <span className="num-tabular">{formatDate(batch.createdAt)}</span>
            <span className="text-fg-faint">·</span>
            <span>{batch.pageCount}p</span>
          </button>
        );
      })}
    </div>
  );
}
