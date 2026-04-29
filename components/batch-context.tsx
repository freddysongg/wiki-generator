"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type JSX,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { subscribeToBatch } from "@/lib/sse-client";
import type {
  BatchEvent,
  BatchManifest,
  BatchTotals,
  ImportResult,
  ManifestPage,
  PdfStatus,
} from "@/lib/types";

export type BatchStage = "idle" | "queued" | "processing" | "complete";

export interface BatchSnapshot {
  stage: BatchStage;
  queuedCount: number;
  statuses: PdfStatus[];
  totals: BatchTotals | null;
  importResult: ImportResult | null;
  manifest: BatchManifest | null;
}

interface SeedPdf {
  pdfId: string;
  filename: string;
}

interface BatchContextValue {
  snapshot: BatchSnapshot;
  setQueuedCount: (count: number) => void;
  startBatch: (batchId: string, pdfs: ReadonlyArray<SeedPdf>) => void;
  importBatch: () => Promise<void>;
  isImporting: boolean;
  resetBatch: () => void;
  getPagesForSource: (source: string) => ManifestPage[];
}

const BatchContext = createContext<BatchContextValue | null>(null);

interface DeriveStageInput {
  batchId: string | null;
  totals: BatchTotals | null;
  queuedCount: number;
}

function deriveStage(input: DeriveStageInput): BatchStage {
  if (input.totals !== null) return "complete";
  if (input.batchId !== null) return "processing";
  if (input.queuedCount > 0) return "queued";
  return "idle";
}

export function BatchProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const [queuedCount, setQueuedCountState] = useState<number>(0);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, PdfStatus>>({});
  const [totals, setTotals] = useState<BatchTotals | null>(null);
  const [importResult, setImportResultState] = useState<ImportResult | null>(
    null,
  );
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [manifest, setManifest] = useState<BatchManifest | null>(null);

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

  useEffect(() => {
    if (totals === null || !batchId || manifest !== null) return;
    let isCancelled = false;
    void (async (): Promise<void> => {
      try {
        const response = await fetch(
          `/api/manifest/${encodeURIComponent(batchId)}`,
        );
        if (!response.ok) return;
        const json = (await response.json()) as BatchManifest;
        if (!isCancelled) setManifest(json);
      } catch {
        // manifest fetch is best-effort; UI degrades gracefully without it
      }
    })();
    return () => {
      isCancelled = true;
    };
  }, [totals, batchId, manifest]);

  const setQueuedCount = useCallback((count: number): void => {
    setQueuedCountState(count);
  }, []);

  const startBatch = useCallback(
    (id: string, pdfs: ReadonlyArray<SeedPdf>): void => {
      const seeded: Record<string, PdfStatus> = {};
      for (const pdf of pdfs) {
        seeded[pdf.pdfId] = {
          pdfId: pdf.pdfId,
          filename: pdf.filename,
          stage: "queued",
          pagesGenerated: 0,
        };
      }
      setStatuses(seeded);
      setTotals(null);
      setImportResultState(null);
      setManifest(null);
      setBatchId(id);
    },
    [],
  );

  const importBatch = useCallback(async (): Promise<void> => {
    if (!batchId || totals === null) return;
    setIsImporting(true);
    try {
      const response = await fetch(
        `/api/import/${encodeURIComponent(batchId)}`,
        { method: "POST" },
      );
      if (!response.ok) {
        const errorBody = (await response
          .json()
          .catch(() => ({}))) as { error?: string };
        toast.error(`Import failed: ${errorBody.error ?? response.status}`);
        return;
      }
      const result = (await response.json()) as ImportResult;
      setImportResultState(result);
      toast.success(`Imported ${result.imported} pages.`);
    } finally {
      setIsImporting(false);
    }
  }, [batchId, totals]);

  const resetBatch = useCallback((): void => {
    setBatchId(null);
    setStatuses({});
    setTotals(null);
    setImportResultState(null);
    setManifest(null);
  }, []);

  const statusList = useMemo(() => Object.values(statuses), [statuses]);

  const snapshot = useMemo<BatchSnapshot>(() => {
    const stage = deriveStage({ batchId, totals, queuedCount });
    return {
      stage,
      queuedCount,
      statuses: statusList,
      totals,
      importResult,
      manifest,
    };
  }, [batchId, totals, queuedCount, statusList, importResult, manifest]);

  const getPagesForSource = useCallback(
    (source: string): ManifestPage[] => {
      if (!manifest) return [];
      return manifest.pages.filter((p) => p.source === source);
    },
    [manifest],
  );

  const value = useMemo<BatchContextValue>(
    () => ({
      snapshot,
      setQueuedCount,
      startBatch,
      importBatch,
      isImporting,
      resetBatch,
      getPagesForSource,
    }),
    [
      snapshot,
      setQueuedCount,
      startBatch,
      importBatch,
      isImporting,
      resetBatch,
      getPagesForSource,
    ],
  );

  return (
    <BatchContext.Provider value={value}>{children}</BatchContext.Provider>
  );
}

export function useBatch(): BatchContextValue {
  const ctx = useContext(BatchContext);
  if (!ctx) {
    throw new Error("useBatch must be used inside <BatchProvider>");
  }
  return ctx;
}

export function useBatchSnapshot(): BatchSnapshot {
  return useBatch().snapshot;
}
