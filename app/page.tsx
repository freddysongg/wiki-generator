"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { Header } from "@/components/header";
import { UploadZone } from "@/components/upload-zone";
import { GranularitySlider } from "@/components/granularity-slider";
import { StatusList } from "@/components/status-list";
import { SummaryPanel, type ImportResult } from "@/components/summary-panel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
}

interface ApiError {
  error?: string;
}

export default function Page(): JSX.Element {
  const [files, setFiles] = useState<File[]>([]);
  const [granularity, setGranularity] = useState<Granularity>("medium");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, PdfStatus>>({});
  const [totals, setTotals] = useState<BatchTotals | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  const items = useMemo(() => Object.values(statuses), [statuses]);
  const isProcessing = Boolean(batchId) && totals === null;

  const handleEvent = useCallback((event: BatchEvent): void => {
    if (event.type === "status") {
      setStatuses((prev) => {
        const existing = prev[event.pdfId];
        return {
          ...prev,
          [event.pdfId]: {
            pdfId: event.pdfId,
            filename: existing?.filename ?? event.pdfId,
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
      return;
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
    const initial: Record<string, PdfStatus> = {};
    for (const file of files) {
      const id = `pending:${file.name}:${file.size}`;
      initial[id] = {
        pdfId: id,
        filename: file.name,
        stage: "queued",
        pagesGenerated: 0,
      };
    }
    setStatuses(initial);
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
      return;
    }
    const body = (await response.json()) as ProcessResponse;
    setBatchId(body.batchId);
    setStatuses({});
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
      <Header />
      <main className="container mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
        <Card className="flex flex-col gap-5 p-5">
          <UploadZone onFiles={setFiles} disabled={isProcessing} />
          {files.length > 0 ? (
            <ul className="flex flex-wrap gap-2 text-xs font-mono text-muted-foreground">
              {files.map((file) => (
                <li
                  key={`${file.name}:${file.size}`}
                  className="rounded bg-muted px-2 py-1"
                >
                  {file.name}
                </li>
              ))}
            </ul>
          ) : null}
          <GranularitySlider value={granularity} onChange={setGranularity} />
          <Button
            onClick={generate}
            disabled={files.length === 0 || isProcessing}
            className="self-start"
          >
            Generate Wiki
          </Button>
        </Card>
        {items.length > 0 ? <StatusList items={items} /> : null}
        {totals !== null ? (
          <SummaryPanel
            totals={totals}
            importing={isImporting}
            importResult={importResult}
            onImport={importToVault}
          />
        ) : null}
      </main>
    </>
  );
}
