"use client";

import { useEffect, useRef, useState, type JSX } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PdfViewerDialog } from "@/components/pdf-viewer-dialog";
import { PagePreviewDialog } from "@/components/page-preview-dialog";
import type { BatchSummary } from "@/lib/types";

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

interface PageEntry {
  title: string;
  filename: string;
  aliases: string[];
  source: string;
  sourcePages: string;
}

interface PaginatedSummary {
  batchId: string;
  total: number;
  offset: number;
  limit: number;
  pages: PageEntry[];
}

type PagesState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; pages: PageEntry[]; total: number }
  | { status: "error" };

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const MAX_VISIBLE_SOURCES = 3;
const PAGE_FETCH_LIMIT = 100;
const PAGES_LIST_MAX_HEIGHT = "60vh";
const OBSERVER_ROOT_MARGIN_PX = 200;

function formatDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return DATE_FORMAT.format(parsed);
}

function appendUniquePages(
  existing: PageEntry[],
  incoming: PageEntry[],
): PageEntry[] {
  const seen = new Set(existing.map((p) => p.filename));
  const merged = [...existing];
  for (const page of incoming) {
    if (seen.has(page.filename)) continue;
    seen.add(page.filename);
    merged.push(page);
  }
  return merged;
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
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [previewPage, setPreviewPage] = useState<PageEntry | null>(null);
  const hasFetchedRef = useRef<boolean>(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const visibleSources = batch.sources.slice(0, MAX_VISIBLE_SOURCES);
  const hiddenCount = batch.sources.length - visibleSources.length;

  useEffect(() => {
    if (!isExpanded) return;
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    const controller = new AbortController();
    setPagesState({ status: "loading" });
    void (async (): Promise<void> => {
      try {
        const response = await fetch(
          `/api/manifest/${encodeURIComponent(batch.batchId)}?summary=true&offset=0&limit=${PAGE_FETCH_LIMIT}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          if (!controller.signal.aborted) setPagesState({ status: "error" });
          return;
        }
        const body = (await response.json()) as PaginatedSummary;
        if (!controller.signal.aborted) {
          setPagesState({
            status: "ready",
            pages: appendUniquePages([], body.pages),
            total: body.total,
          });
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        if (!controller.signal.aborted) setPagesState({ status: "error" });
      }
    })();
    return () => {
      controller.abort();
    };
  }, [isExpanded, batch.batchId]);

  useEffect(() => {
    if (pagesState.status !== "ready") return;
    if (pagesState.pages.length >= pagesState.total) return;
    if (isLoadingMore) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        void loadMore();
      },
      {
        root: scrollContainerRef.current,
        rootMargin: `${OBSERVER_ROOT_MARGIN_PX}px`,
      },
    );
    observer.observe(sentinel);

    async function loadMore(): Promise<void> {
      if (pagesState.status !== "ready") return;
      setIsLoadingMore(true);
      try {
        const offset = pagesState.pages.length;
        const response = await fetch(
          `/api/manifest/${encodeURIComponent(batch.batchId)}?summary=true&offset=${offset}&limit=${PAGE_FETCH_LIMIT}`,
        );
        if (!response.ok) return;
        const body = (await response.json()) as PaginatedSummary;
        setPagesState((prev) => {
          if (prev.status !== "ready") return prev;
          return {
            status: "ready",
            pages: appendUniquePages(prev.pages, body.pages),
            total: body.total,
          };
        });
      } finally {
        setIsLoadingMore(false);
      }
    }

    return () => {
      observer.disconnect();
    };
  }, [pagesState, isLoadingMore, batch.batchId]);

  return (
    <li className="flex flex-col border-b border-rule last:border-b-0">
      <div className="flex items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "collapse pages" : "expand pages"}
            className="t-meta text-fg-mute hover:text-fg leading-none mt-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fg focus-visible:outline-offset-2"
          >
            {isExpanded ? "▾" : "▸"}
          </button>
          <div className="flex flex-col gap-1 min-w-0 flex-1">
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
                  className="inline-flex items-center gap-1 px-2 py-0.5 t-meta text-fg-mute border border-rule"
                  title={source}
                >
                  <span>{source}</span>
                  <button
                    type="button"
                    aria-label={`View source PDF ${source}`}
                    className="t-meta text-fg-mute hover:text-fg underline underline-offset-2"
                    onClick={() => setViewer({ filename: source })}
                  >
                    PDF
                  </button>
                </span>
              ))}
              {hiddenCount > 0 ? (
                <span className="t-meta text-fg-faint">
                  +{hiddenCount} more
                </span>
              ) : null}
            </div>
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
            <div
              ref={scrollContainerRef}
              className="overflow-y-auto"
              style={{ maxHeight: PAGES_LIST_MAX_HEIGHT }}
            >
              <ul className="flex flex-col px-5 py-2">
                {pagesState.pages.map((page) => (
                  <li key={page.filename}>
                    <button
                      type="button"
                      onClick={() => setPreviewPage(page)}
                      className="w-full grid grid-cols-[1fr_auto_auto] gap-3 items-baseline px-2 py-1.5 text-left border-b border-rule last:border-b-0 hover:bg-bg-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fg focus-visible:outline-offset-[-2px]"
                    >
                      <span
                        className="t-body text-fg truncate"
                        title={page.title}
                      >
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
              {pagesState.pages.length < pagesState.total ? (
                <div
                  ref={sentinelRef}
                  className="t-meta text-fg-faint px-5 py-3 text-center"
                  aria-hidden
                >
                  {isLoadingMore
                    ? `Loading more… (${pagesState.total - pagesState.pages.length} remaining)`
                    : `Scroll to load more (${pagesState.total - pagesState.pages.length} remaining)`}
                </div>
              ) : null}
            </div>
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
