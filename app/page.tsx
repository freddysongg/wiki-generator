"use client";

import { useCallback, useEffect, useState } from "react";
import type { JSX } from "react";
import { PageHero } from "@/components/page-hero";
import { SectionMarker } from "@/components/section-marker";
import { UploadZone } from "@/components/upload-zone";
import { GranularitySlider } from "@/components/granularity-slider";
import { StatusList } from "@/components/status-list";
import { SummaryPanel } from "@/components/summary-panel";
import { GraphPreview } from "@/components/graph-preview";
import { PagePreviewDialog } from "@/components/page-preview-dialog";
import { Button } from "@/components/ui/button";
import { useBatch } from "@/components/batch-context";
import { toast } from "sonner";
import type { Granularity, ManifestPage } from "@/lib/types";

interface ProcessResponse {
  batchId: string;
  pdfs: Array<{ pdfId: string; filename: string }>;
}

interface ApiError {
  error?: string;
}

const HERO_SPEC = [
  { text: "Local-only" },
  { text: "Multi-provider" },
  { text: "Obsidian-ready" },
] as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function formatGranularity(value: Granularity): string {
  return value[0].toUpperCase() + value.slice(1);
}

export default function Page(): JSX.Element {
  const [files, setFiles] = useState<File[]>([]);
  const [granularity, setGranularity] = useState<Granularity>("medium");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [selectedPage, setSelectedPage] = useState<ManifestPage | null>(null);
  const [isInputCollapsed, setIsInputCollapsed] = useState<boolean>(false);
  const [isPipelineCollapsed, setIsPipelineCollapsed] =
    useState<boolean>(false);
  const { snapshot, setQueuedCount, startBatch, importBatch, isImporting } =
    useBatch();
  const previewBatchId = snapshot.manifest?.batchId ?? null;

  const isProcessing = snapshot.stage === "processing";
  const items = snapshot.statuses;
  const totals = snapshot.totals;
  const importResult = snapshot.importResult;
  const hasFiles = items.length > 0;
  const canGenerate = files.length > 0 && !isProcessing;
  const doneCount = items.filter((item) => item.stage === "done").length;

  useEffect(() => {
    setQueuedCount(files.length);
  }, [files.length, setQueuedCount]);

  const generate = useCallback(async (): Promise<void> => {
    if (files.length === 0) {
      toast.error("Add at least one PDF.");
      return;
    }
    const form = new FormData();
    form.append("granularity", granularity);
    for (const file of files) form.append("files", file);

    const response = await fetch("/api/process", {
      method: "POST",
      body: form,
    });
    if (!response.ok) {
      const errorBody = (await response.json().catch(() => ({}))) as ApiError;
      toast.error(`Process failed: ${errorBody.error ?? response.status}`);
      return;
    }
    const body = (await response.json()) as ProcessResponse;
    setBatchId(body.batchId);
    startBatch(body.batchId, body.pdfs);
  }, [files, granularity, startBatch]);

  return (
    <>
      <PageHero
        eyebrow="View 01"
        headline={<>PDF&nbsp;→&nbsp;Wiki.</>}
        description="Drop PDFs, pick a granularity, generate cross-referenced Markdown for Obsidian."
        spec={HERO_SPEC}
      />

      <section className="flex flex-col gap-3">
        <SectionMarker
          index="001"
          label="Input"
          tail={`${files.length} file${files.length === 1 ? "" : "s"} queued`}
          withTopRule={false}
          collapsible
          isCollapsed={isInputCollapsed}
          onToggle={() => setIsInputCollapsed((prev) => !prev)}
        />
        {!isInputCollapsed ? (
          <>
            <UploadZone onFiles={setFiles} disabled={isProcessing} />
            {files.length > 0 ? (
              <ul className="flex flex-col">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${file.size}-${index}`}
                    className="flex items-center gap-3 px-3 py-2 border-t border-rule first:border-t-0"
                  >
                    <span
                      className="t-body text-fg truncate flex-1"
                      title={file.name}
                    >
                      {file.name}
                    </span>
                    <span className="t-meta text-fg-mute num-tabular">
                      {formatBytes(file.size)}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        setFiles((prev) => prev.filter((_, i) => i !== index))
                      }
                      disabled={isProcessing}
                      aria-label={`remove ${file.name}`}
                    >
                      ×
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <SectionMarker
          index="002"
          label="Granularity"
          tail={formatGranularity(granularity)}
        />
        <GranularitySlider value={granularity} onChange={setGranularity} />
        <div className="flex items-center justify-between pt-2">
          <span className="t-meta text-fg-mute">
            {isProcessing
              ? "Processing in flight"
              : `${files.length} file${files.length === 1 ? "" : "s"} queued`}
          </span>
          <Button onClick={generate} disabled={!canGenerate}>
            {isProcessing ? "Processing…" : "Generate Wiki"}
          </Button>
        </div>
      </section>

      {hasFiles ? (
        <section className="flex flex-col gap-3">
          <SectionMarker
            index="003"
            label="Pipeline"
            tail={`${doneCount} / ${items.length} complete`}
            collapsible
            isCollapsed={isPipelineCollapsed}
            onToggle={() => setIsPipelineCollapsed((prev) => !prev)}
          />
          {!isPipelineCollapsed ? (
            <StatusList items={items} onPageOpen={setSelectedPage} />
          ) : null}
        </section>
      ) : null}

      {batchId && totals !== null ? (
        <section className="flex flex-col gap-3">
          <SectionMarker index="004" label="Graph" tail="Preview" />
          <GraphPreview batchId={batchId} />
        </section>
      ) : null}

      {totals !== null ? (
        <section className="flex flex-col gap-3">
          <SectionMarker index="005" label="Output" tail="Ready" />
          <SummaryPanel
            totals={totals}
            importing={isImporting}
            importResult={importResult}
            onImport={importBatch}
          />
        </section>
      ) : null}

      <PagePreviewDialog
        open={selectedPage !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setSelectedPage(null);
        }}
        batchId={previewBatchId}
        filename={selectedPage?.filename ?? null}
        title={selectedPage?.title ?? null}
        source={selectedPage?.source ?? null}
        sourcePages={selectedPage?.sourcePages ?? null}
      />
    </>
  );
}
