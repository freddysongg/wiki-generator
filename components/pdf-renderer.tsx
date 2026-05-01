"use client";

import { useState, type JSX } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const PAGE_WIDTH_PX = 720;

type LoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error" };

interface Props {
  fileUrl: string;
  pageNumber: number;
  onLoadSuccess: (numPages: number) => void;
}

interface DocumentLoadSuccess {
  numPages: number;
}

export function PdfRenderer({
  fileUrl,
  pageNumber,
  onLoadSuccess,
}: Props): JSX.Element {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });

  return (
    <Document
      file={fileUrl}
      onLoadSuccess={({ numPages }: DocumentLoadSuccess) => {
        setLoadState({ status: "ready" });
        onLoadSuccess(numPages);
      }}
      onLoadError={() => setLoadState({ status: "error" })}
      loading={<p className="t-meta text-fg-mute">Loading PDF…</p>}
      error={
        <p className="t-meta text-brand-accent">Could not load PDF.</p>
      }
    >
      {loadState.status === "ready" ? (
        <Page
          pageNumber={pageNumber}
          width={PAGE_WIDTH_PX}
          renderTextLayer={true}
          renderAnnotationLayer={true}
        />
      ) : null}
    </Document>
  );
}
