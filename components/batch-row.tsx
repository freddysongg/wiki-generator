"use client";

import type { JSX } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { BatchSummary } from "@/lib/types";

interface Props {
  batch: BatchSummary;
  isImporting: boolean;
  onImport: (batchId: string) => void;
}

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const MAX_VISIBLE_SOURCES = 3;

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return DATE_FORMAT.format(parsed);
}

export function BatchRow({ batch, isImporting, onImport }: Props): JSX.Element {
  const visibleSources = batch.sources.slice(0, MAX_VISIBLE_SOURCES);
  const hiddenCount = batch.sources.length - visibleSources.length;

  return (
    <li className="flex items-center justify-between gap-4 border-b border-rule last:border-b-0 px-4 py-3">
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2 t-label">
          <span className="num-tabular text-fg">
            {formatDate(batch.createdAt)}
          </span>
          <span className="text-fg-faint">·</span>
          <span className="t-eyebrow text-fg-mute">{batch.granularity}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {visibleSources.map((source) => (
            <span
              key={source}
              className="inline-flex items-center px-2 py-0.5 t-meta text-fg-mute border border-rule"
              title={source}
            >
              {source}
            </span>
          ))}
          {hiddenCount > 0 ? (
            <span className="t-meta text-fg-faint">+{hiddenCount} more</span>
          ) : null}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="t-meta text-fg-mute num-tabular">
          {batch.pageCount} pages · {batch.linkCount} links
        </span>
        <Link
          href={`/graph?batch=${encodeURIComponent(batch.batchId)}`}
          className="t-label text-[var(--accent)] hover:underline"
        >
          → Graph
        </Link>
        <Button
          variant="outline"
          size="sm"
          disabled={isImporting}
          onClick={() => onImport(batch.batchId)}
        >
          {isImporting ? "Importing…" : "Import"}
        </Button>
      </div>
    </li>
  );
}
