"use client";

import { useEffect, useState, type JSX } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PdfViewerDialog } from "@/components/pdf-viewer-dialog";
import { PagePreviewDialog } from "@/components/page-preview-dialog";
import type { BatchManifest, BatchSummary, ManifestPage } from "@/lib/types";

interface Props {
  batch: BatchSummary;
  isImporting: boolean;
  isDeleting: boolean;
  onImport: (batchId: string) => void;
  onDelete: (batchId: string) => void;
}

interface ViewerState {
  filename: string;
}

type PagesState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; pages: ManifestPage[] }
  | { status: "error" };

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

export function BatchRow({
  batch,
  isImporting,
  isDeleting,
  onImport,
  onDelete,
}: Props): JSX.Element {
  const [viewer, setViewer] = useState<ViewerState | null>(null);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [pagesState, setPagesState] = useState<PagesState>({ status: "idle" });
  const [previewPage, setPreviewPage] = useState<ManifestPage | null>(null);
  const visibleSources = batch.sources.slice(0, MAX_VISIBLE_SOURCES);
  const hiddenCount = batch.sources.length - visibleSources.length;

  useEffect(() => {
    if (!isExpanded) return;
    if (pagesState.status === "ready" || pagesState.status === "loading") {
      return;
    }
    const controller = new AbortController();
    setPagesState({ status: "loading" });
    void (async (): Promise<void> => {
      try {
        const response = await fetch(
          `/api/manifest/${encodeURIComponent(batch.batchId)}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          if (!controller.signal.aborted) setPagesState({ status: "error" });
          return;
        }
        const manifest = (await response.json()) as BatchManifest;
        if (!controller.signal.aborted) {
          setPagesState({ status: "ready", pages: manifest.pages });
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        if (!controller.signal.aborted) setPagesState({ status: "error" });
      }
    })();
    return () => {
      controller.abort();
    };
  }, [isExpanded, batch.batchId, pagesState.status]);

  return (
    <li className="flex flex-col border-b border-rule last:border-b-0">
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          aria-expanded={isExpanded}
          aria-label={isExpanded ? "collapse pages" : "expand pages"}
          className="flex flex-col gap-1 min-w-0 text-left flex-1 hover:opacity-80"
        >
          <div className="flex items-center gap-2 t-label">
            <span className="t-meta text-fg-mute" aria-hidden>
              {isExpanded ? "▾" : "▸"}
            </span>
            <span className="num-tabular text-fg">
              {formatDate(batch.createdAt)}
            </span>
            <span className="text-fg-faint">·</span>
            <span className="t-eyebrow text-fg-mute">{batch.granularity}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 pl-5">
            {visibleSources.map((source) => (
              <span
                key={source}
                className="inline-flex items-center gap-1 px-2 py-0.5 t-meta text-fg-mute border border-rule"
                title={source}
              >
                <span>{source}</span>
                <button
                  type="button"
                  aria-label={`View source PDF ${source}`}
                  className="t-meta text-fg-mute hover:text-fg underline underline-offset-2"
                  onClick={(event) => {
                    event.stopPropagation();
                    setViewer({ filename: source });
                  }}
                >
                  PDF
                </button>
              </span>
            ))}
            {hiddenCount > 0 ? (
              <span className="t-meta text-fg-faint">+{hiddenCount} more</span>
            ) : null}
          </div>
        </button>

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
          <Button
            variant="ghost"
            size="sm"
            disabled={isDeleting}
            onClick={() => onDelete(batch.batchId)}
            aria-label="delete batch"
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>

      {isExpanded ? (
        <div className="border-t border-rule bg-bg-2/40">
          {pagesState.status === "loading" ? (
            <p className="t-meta text-fg-mute px-5 py-3">Loading pages…</p>
          ) : null}
          {pagesState.status === "error" ? (
            <p className="t-meta text-brand-accent px-5 py-3">
              Could not load pages.
            </p>
          ) : null}
          {pagesState.status === "ready" && pagesState.pages.length === 0 ? (
            <p className="t-meta text-fg-mute px-5 py-3">No pages.</p>
          ) : null}
          {pagesState.status === "ready" && pagesState.pages.length > 0 ? (
            <ul className="flex flex-col px-5 py-2">
              {pagesState.pages.map((page) => (
                <li key={page.filename}>
                  <button
                    type="button"
                    onClick={() => setPreviewPage(page)}
                    className="w-full grid grid-cols-[1fr_auto_auto] gap-3 items-baseline px-2 py-1.5 text-left border-b border-rule last:border-b-0 hover:bg-bg-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fg focus-visible:outline-offset-[-2px]"
                  >
                    <span className="t-body text-fg truncate" title={page.title}>
                      {page.title}
                    </span>
                    <span
                      className="t-meta text-fg-mute truncate max-w-[180px]"
                      title={page.source}
                    >
                      {page.source}
                    </span>
                    <span className="t-meta text-fg-mute num-tabular">
                      {page.sourcePages}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <PdfViewerDialog
        open={viewer !== null}
        onOpenChange={(open) => {
          if (!open) setViewer(null);
        }}
        batchId={viewer ? batch.batchId : null}
        filename={viewer ? viewer.filename : null}
      />
      <PagePreviewDialog
        open={previewPage !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewPage(null);
        }}
        batchId={previewPage ? batch.batchId : null}
        filename={previewPage?.filename ?? null}
        title={previewPage?.title ?? null}
        source={previewPage?.source ?? null}
        sourcePages={previewPage?.sourcePages ?? null}
      />
    </li>
  );
}
