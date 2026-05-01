"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type JSX } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const PdfRenderer = dynamic(
  () => import("./pdf-renderer").then((m) => m.PdfRenderer),
  { ssr: false },
);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batchId: string | null;
  filename: string | null;
  initialPage?: number;
}

export function PdfViewerDialog({
  open,
  onOpenChange,
  batchId,
  filename,
  initialPage,
}: Props): JSX.Element {
  const [pageNumber, setPageNumber] = useState<number>(initialPage ?? 1);
  const [numPages, setNumPages] = useState<number | null>(null);
  const lastSyncedInitialRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    if (lastSyncedInitialRef.current === initialPage) return;
    lastSyncedInitialRef.current = initialPage;
    setPageNumber(initialPage ?? 1);
    setNumPages(null);
  }, [open, initialPage, batchId, filename]);

  const pdfUrl =
    batchId && filename
      ? `/api/batches/${encodeURIComponent(batchId)}/sources/${encodeURIComponent(filename)}`
      : null;

  const canGoPrev = pageNumber > 1;
  const canGoNext = numPages !== null && pageNumber < numPages;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl border border-rule bg-bg text-fg">
        <DialogHeader>
          <DialogTitle className="t-display text-fg">
            {filename ?? ""}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 max-h-[70vh] overflow-auto">
          {pdfUrl ? (
            <PdfRenderer
              fileUrl={pdfUrl}
              pageNumber={pageNumber}
              onLoadSuccess={(loadedNumPages) => setNumPages(loadedNumPages)}
            />
          ) : (
            <p className="t-meta text-fg-mute">No source selected.</p>
          )}
        </div>
        <DialogFooter className="items-center justify-between sm:justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!canGoPrev}
              onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
            >
              Prev
            </Button>
            <span className="t-meta text-fg-mute num-tabular">
              {numPages === null
                ? `Page ${pageNumber}`
                : `Page ${pageNumber} of ${numPages}`}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={!canGoNext}
              onClick={() =>
                setPageNumber((p) =>
                  numPages === null ? p : Math.min(numPages, p + 1),
                )
              }
            >
              Next
            </Button>
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
