export type Stage =
  | "queued"
  | "parsing"
  | "ocr"
  | "extracting"
  | "writing"
  | "done"
  | "failed";

export type ResolvedGranularity = "coarse" | "medium" | "fine";

export type Granularity = ResolvedGranularity | "auto";

export interface PdfStatus {
  pdfId: string;
  filename: string;
  stage: Stage;
  pagesGenerated: number;
  error?: string;
}

export interface BatchState {
  batchId: string;
  granularity: Granularity;
  pdfs: Record<string, PdfStatus>;
  vaultTitles: string[];
  startedAt: string;
  completedAt?: string;
}

export interface GeneratedPage {
  title: string;
  body: string;
  sourcePages: string;
  links: string[];
  sourceFilename: string;
}

export interface ExtractionResult {
  pages: Array<{
    title: string;
    body: string;
    sourcePages: string;
    links: string[];
  }>;
}

export interface BatchTotals {
  pages: number;
  links: number;
  failed: number;
}

export interface ImportResult {
  imported: number;
  conflicts: number;
}

export type BatchEvent =
  | {
      type: "status";
      batchId: string;
      pdfId: string;
      stage: Stage;
      pagesGenerated: number;
      error?: string;
    }
  | { type: "page"; batchId: string; pdfId: string; title: string }
  | {
      type: "complete";
      batchId: string;
      totals: BatchTotals;
    };
