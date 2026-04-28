"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { PageHero } from "@/components/page-hero";
import { SectionMarker } from "@/components/section-marker";
import { UploadZone } from "@/components/upload-zone";
import { GranularitySlider } from "@/components/granularity-slider";
import { StatusList } from "@/components/status-list";
import { SummaryPanel, type ImportResult } from "@/components/summary-panel";
import { Button } from "@/components/ui/button";
import { useBatch } from "@/components/batch-context";
import { toast } from "sonner";
import { subscribeToBatch } from "@/lib/sse-client";
import type { BatchEvent, Granularity, PdfStatus } from "@/lib/types";

interface BatchTotals {
  pages: number;
  links: number;
  failed: number;
}

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

export default function Page(): JSX.Element {
  const [files, setFiles] = useState<File[]>([]);
  const [granularity, setGranularity] = useState<Granularity>("medium");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, PdfStatus>>({});
  const [totals, setTotals] = useState<BatchTotals | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const { setSnapshot } = useBatch();

  const items = useMemo(() => Object.values(statuses), [statuses]);
  const isProcessing = Boolean(batchId) && totals === null;
  const hasFiles = items.length > 0;
  const canGenerate = files.length > 0 && !isProcessing;

  useEffect(() => {
    let stage: "idle" | "queued" | "processing" | "complete" = "idle";
    if (totals !== null) stage = "complete";
    else if (isProcessing) stage = "processing";
    else if (files.length > 0) stage = "queued";
    setSnapshot({
      stage,
      fileCount: files.length || items.length,
      statuses: items,
      totals,
    });
  }, [files.length, items, isProcessing, totals, setSnapshot]);

  const handleEvent = useCallback((event: BatchEvent): void => {
    if (event.type === "status") {
      setStatuses((prev) => {
        const existing = prev[event.pdfId];
        if (!existing) return prev;
        return {
          ...prev,
          [event.pdfId]: {
            ...existing,
            stage: event.stage,
            pagesGenerated: event.pagesGenerated,
            error: event.error,
          },
        };
      });
      return;
    }
    if (event.type === "complete") {
      setTotals(event.totals);
    }
  }, []);

  useEffect(() => {
    if (!batchId) return;
    const unsubscribe = subscribeToBatch({
      batchId,
      onEvent: handleEvent,
      onError: () => toast.error("Lost connection to batch stream"),
    });
    return unsubscribe;
  }, [batchId, handleEvent]);

  const generate = useCallback(async (): Promise<void> => {
    if (files.length === 0) {
      toast.error("Add at least one PDF.");
      return;
    }
    setTotals(null);
    setImportResult(null);

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
      setStatuses({});
      return;
    }
    const body = (await response.json()) as ProcessResponse;

    const seeded: Record<string, PdfStatus> = {};
    for (const pdf of body.pdfs) {
      seeded[pdf.pdfId] = {
        pdfId: pdf.pdfId,
        filename: pdf.filename,
        stage: "queued",
        pagesGenerated: 0,
      };
    }
    setStatuses(seeded);
    setBatchId(body.batchId);
  }, [files, granularity]);

  const importToVault = useCallback(async (): Promise<void> => {
    if (!batchId) return;
    setIsImporting(true);
    try {
      const response = await fetch(
        `/api/import/${encodeURIComponent(batchId)}`,
        { method: "POST" },
      );
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as ApiError;
        toast.error(`Import failed: ${errorBody.error ?? response.status}`);
        return;
      }
      const result = (await response.json()) as ImportResult;
      setImportResult(result);
      toast.success(`Imported ${result.imported} pages.`);
    } finally {
      setIsImporting(false);
    }
  }, [batchId]);

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
        />
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
      </section>

      <section className="flex flex-col gap-3">
        <SectionMarker
          index="002"
          label="Granularity"
          tail={granularity[0].toUpperCase() + granularity.slice(1)}
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
            tail={`${items.filter((i) => i.stage === "done").length} / ${items.length} complete`}
          />
          <StatusList items={items} />
        </section>
      ) : null}

      {totals !== null ? (
        <section className="flex flex-col gap-3">
          <SectionMarker index="004" label="Output" tail="Ready" />
          <SummaryPanel
            totals={totals}
            importing={isImporting}
            importResult={importResult}
            onImport={importToVault}
          />
        </section>
      ) : null}
    </>
  );
}
