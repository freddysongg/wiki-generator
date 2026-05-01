"use client";

import type { JSX, KeyboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import MiniSearch from "minisearch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export interface SearchRecord {
  id: string;
  batchId: string;
  filename: string;
  title: string;
  aliases: string[];
  source: string;
  sourcePages: string;
  createdAt: string;
}

type IndexState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; records: SearchRecord[]; engine: MiniSearch }
  | { status: "error" };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (record: SearchRecord) => void;
}

const SEARCH_FIELDS = ["title", "aliases", "source"] as const;
const STORE_FIELDS = [
  "id",
  "batchId",
  "filename",
  "title",
  "aliases",
  "source",
  "sourcePages",
  "createdAt",
] as const;
const SEARCH_OPTIONS = {
  boost: { title: 3, aliases: 2 },
  prefix: true,
  fuzzy: 0.2,
} as const;
const ID_FIELD = "id" as const;

const DATE_HEADER_FORMAT = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

function formatBatchHeader(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return DATE_HEADER_FORMAT.format(parsed);
}

function buildEngine(records: SearchRecord[]): MiniSearch {
  const engine = new MiniSearch({
    fields: [...SEARCH_FIELDS],
    storeFields: [...STORE_FIELDS],
    idField: ID_FIELD,
    extractField: (document, fieldName) => {
      const value = (document as Record<string, unknown>)[fieldName];
      if (Array.isArray(value)) return value.join(" ");
      if (typeof value === "string") return value;
      return "";
    },
    searchOptions: SEARCH_OPTIONS,
  });
  engine.addAll(records);
  return engine;
}

interface BatchGroup {
  batchId: string;
  createdAt: string;
  records: SearchRecord[];
}

function groupByBatch(records: SearchRecord[]): BatchGroup[] {
  const groups = new Map<string, BatchGroup>();
  for (const record of records) {
    const existing = groups.get(record.batchId);
    if (existing) {
      groups.set(record.batchId, {
        ...existing,
        records: [...existing.records, record],
      });
    } else {
      groups.set(record.batchId, {
        batchId: record.batchId,
        createdAt: record.createdAt,
        records: [record],
      });
    }
  }
  return Array.from(groups.values()).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

function recentRecords(records: SearchRecord[], limit: number): SearchRecord[] {
  return [...records]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit);
}

const RECENT_LIMIT = 20;
const RESULT_LIMIT = 30;

export function SearchDialog({
  open,
  onOpenChange,
  onSelect,
}: Props): JSX.Element {
  const [state, setState] = useState<IndexState>({ status: "idle" });
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    let isCancelled = false;
    setState({ status: "loading" });
    void (async (): Promise<void> => {
      try {
        const response = await fetch("/api/search-index");
        if (!response.ok) {
          if (!isCancelled) setState({ status: "error" });
          return;
        }
        const payload = (await response.json()) as { records: SearchRecord[] };
        if (isCancelled) return;
        const engine = buildEngine(payload.records);
        setState({ status: "ready", records: payload.records, engine });
      } catch {
        if (!isCancelled) setState({ status: "error" });
      }
    })();
    return () => {
      isCancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
    }
  }, [open]);

  const visibleRecords = useMemo<SearchRecord[]>(() => {
    if (state.status !== "ready") return [];
    const trimmed = query.trim();
    if (trimmed.length === 0) {
      return recentRecords(state.records, RECENT_LIMIT);
    }
    const hits = state.engine.search(trimmed);
    const byId = new Map(state.records.map((r) => [r.id, r] as const));
    const matched: SearchRecord[] = [];
    for (const hit of hits) {
      const record = byId.get(String(hit.id));
      if (record) matched.push(record);
      if (matched.length >= RESULT_LIMIT) break;
    }
    return matched;
  }, [query, state]);

  const groups = useMemo<BatchGroup[]>(
    () => groupByBatch(visibleRecords),
    [visibleRecords],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query, state.status]);

  function handleSelect(record: SearchRecord): void {
    onOpenChange(false);
    onSelect(record);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (visibleRecords.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % visibleRecords.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(
        (prev) => (prev - 1 + visibleRecords.length) % visibleRecords.length,
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const chosen = visibleRecords[activeIndex];
      if (chosen) handleSelect(chosen);
    }
  }

  const isQueryEmpty = query.trim().length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl border border-rule bg-bg text-fg p-0 sm:max-w-2xl"
        showCloseButton={false}
      >
        <DialogHeader className="px-4 pt-4">
          <DialogTitle className="t-eyebrow text-fg-faint">
            Search pages
          </DialogTitle>
        </DialogHeader>
        <div className="px-4 pb-2">
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search across all batches…"
            className="t-body"
            aria-label="search query"
          />
        </div>
        <div
          className="max-h-[60vh] overflow-y-auto border-t border-rule"
          role="listbox"
          aria-label="search results"
        >
          {state.status === "loading" ? (
            <p className="t-meta text-fg-mute px-4 py-3">Loading index…</p>
          ) : null}
          {state.status === "error" ? (
            <p className="t-meta text-brand-accent px-4 py-3">
              Could not load search index.
            </p>
          ) : null}
          {state.status === "ready" && visibleRecords.length === 0 ? (
            <p className="t-meta text-fg-mute px-4 py-3">
              {isQueryEmpty
                ? "Type to search…"
                : "No results match this query."}
            </p>
          ) : null}
          {state.status === "ready" && visibleRecords.length > 0
            ? groups.map((group) => (
                <div key={group.batchId}>
                  <div className="t-eyebrow text-fg-faint px-4 pt-3 pb-1 sticky top-0 bg-bg">
                    {formatBatchHeader(group.createdAt)}
                  </div>
                  <ul>
                    {group.records.map((record) => {
                      const indexInList = visibleRecords.findIndex(
                        (r) => r.id === record.id,
                      );
                      const isActive = indexInList === activeIndex;
                      return (
                        <li key={record.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={isActive}
                            onClick={() => handleSelect(record)}
                            onMouseEnter={() => setActiveIndex(indexInList)}
                            className={`w-full flex items-baseline justify-between gap-3 px-4 py-2 text-left border-b border-rule last:border-b-0 ${
                              isActive ? "bg-bg-2" : "hover:bg-bg-2"
                            }`}
                          >
                            <span className="flex flex-col min-w-0">
                              <span className="t-body font-bold text-fg truncate">
                                {record.title}
                              </span>
                              <span className="t-meta text-fg-mute truncate">
                                {record.source}
                              </span>
                            </span>
                            <span className="t-meta text-fg-faint num-tabular shrink-0">
                              {record.sourcePages}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            : null}
        </div>
        <div className="t-meta text-fg-faint px-4 py-2 border-t border-rule flex justify-between">
          <span>↑ ↓ navigate</span>
          <span>↵ open · esc close</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
