"use client";

import type { JSX, ReactNode } from "react";
import { useEffect, useState } from "react";
import { Sidebar } from "@/components/sidebar";
import { useBatch, type BatchStage } from "@/components/batch-context";
import { SearchDialog, type SearchRecord } from "@/components/search-dialog";
import { PagePreviewDialog } from "@/components/page-preview-dialog";

const STAGE_PHRASE: Record<BatchStage, string> = {
  idle: "Ready",
  queued: "Queued",
  processing: "Processing",
  complete: "Complete",
};

type PreviewState =
  | { status: "closed" }
  | {
      status: "open";
      batchId: string;
      filename: string;
      title: string;
      source: string;
      sourcePages: string;
    };

interface Props {
  children: ReactNode;
}

export function AppShell({ children }: Props): JSX.Element {
  const { snapshot } = useBatch();
  const stagePhrase = STAGE_PHRASE[snapshot.stage];

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewState>({ status: "closed" });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const isTriggerKey = event.key === "k" || event.key === "K";
      if (!isTriggerKey) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setIsSearchOpen((prev) => !prev);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  function handleSelect(record: SearchRecord): void {
    setPreview({
      status: "open",
      batchId: record.batchId,
      filename: record.filename,
      title: record.title,
      source: record.source,
      sourcePages: record.sourcePages,
    });
  }

  function handlePreviewOpenChange(nextOpen: boolean): void {
    if (!nextOpen) setPreview({ status: "closed" });
  }

  let topRight = `${stagePhrase} · ${snapshot.queuedCount} queued`;
  if (snapshot.stage === "processing") {
    const done = snapshot.statuses.filter((s) => s.stage === "done").length;
    topRight = `Processing · ${done}/${snapshot.statuses.length}`;
  }
  if (snapshot.stage === "complete" && snapshot.totals) {
    topRight = `Complete · ${snapshot.totals.pages} pages`;
  }

  const isPreviewOpen = preview.status === "open";

  return (
    <div className="min-h-screen flex flex-col bg-bg text-fg">
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-4 h-[var(--rule-h-top)] border-b border-rule bg-bg t-meta text-fg-mute"
        aria-label="top status rule"
      >
        <span>wiki-gen</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsSearchOpen(true)}
            className="t-meta text-fg-mute hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-fg focus-visible:outline-offset-2"
            aria-label="open search"
          >
            ⌘K search
          </button>
          <span>{topRight}</span>
        </div>
      </header>
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 px-7 py-6 flex flex-col gap-5">
          {children}
        </main>
      </div>
      <SearchDialog
        open={isSearchOpen}
        onOpenChange={setIsSearchOpen}
        onSelect={handleSelect}
      />
      <PagePreviewDialog
        open={isPreviewOpen}
        onOpenChange={handlePreviewOpenChange}
        batchId={isPreviewOpen ? preview.batchId : null}
        filename={isPreviewOpen ? preview.filename : null}
        title={isPreviewOpen ? preview.title : null}
        source={isPreviewOpen ? preview.source : null}
        sourcePages={isPreviewOpen ? preview.sourcePages : null}
      />
    </div>
  );
}
