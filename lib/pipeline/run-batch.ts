import type { EventBus } from "@/lib/events/bus";
import type {
  BatchEvent,
  ExtractionResult,
  GeneratedPage,
  Granularity,
  Stage,
} from "@/lib/types";
import { writeStaging } from "@/lib/pipeline/write-staging";
import { validateWikilinks } from "@/lib/pipeline/wikilink-validator";

export interface ParsedPageInput {
  pageNumber: number;
  text: string;
  kind: "text" | "image";
}

export interface BatchHooks {
  parsePdf: (bytes: Uint8Array) => Promise<ParsedPageInput[]>;
  renderPdfPageToPng: (bytes: Uint8Array, pageNumber: number) => Promise<Uint8Array>;
  ocrPageImage: (png: Uint8Array) => Promise<string>;
  scanVaultTitles: (vaultPath: string) => Promise<Set<string>>;
  extractConcepts: (args: {
    pdfText: string;
    vaultTitles: string[];
    granularity: Granularity;
  }) => Promise<ExtractionResult>;
}

export interface BatchPdf {
  pdfId: string;
  filename: string;
  bytes: Uint8Array;
}

export interface RunBatchArgs {
  bus: EventBus;
  batchId: string;
  granularity: Granularity;
  stagingDir: string;
  vaultPath: string;
  maxConcurrent: number;
  pdfs: BatchPdf[];
  hooks: BatchHooks;
}

interface PdfResult {
  pagesWritten: number;
  linksKept: number;
  isFailed: boolean;
}

function emitStatus(
  bus: EventBus,
  batchId: string,
  pdfId: string,
  stage: Stage,
  pagesGenerated: number,
  error?: string,
): void {
  const event: BatchEvent = {
    type: "status",
    batchId,
    pdfId,
    stage,
    pagesGenerated,
    error,
  };
  bus.publish(event);
}

async function processPdf(
  args: RunBatchArgs,
  pdf: BatchPdf,
  vaultTitles: Set<string>,
): Promise<PdfResult> {
  const { bus, batchId, granularity, stagingDir, hooks } = args;
  emitStatus(bus, batchId, pdf.pdfId, "parsing", 0);
  try {
    const parsed = await hooks.parsePdf(pdf.bytes);
    const imagePages = parsed.filter((p) => p.kind === "image");
    if (imagePages.length > 0) {
      emitStatus(bus, batchId, pdf.pdfId, "ocr", 0);
      for (const page of imagePages) {
        const png = await hooks.renderPdfPageToPng(pdf.bytes, page.pageNumber);
        page.text = await hooks.ocrPageImage(png);
      }
    }

    emitStatus(bus, batchId, pdf.pdfId, "extracting", 0);
    const fullText = parsed
      .map((p) => `[Page ${p.pageNumber}]\n${p.text}`)
      .join("\n\n");
    const result = await hooks.extractConcepts({
      pdfText: fullText,
      vaultTitles: Array.from(vaultTitles),
      granularity,
    });

    const knownThisBatch = new Set<string>(vaultTitles);
    for (const p of result.pages) knownThisBatch.add(p.title);

    let linksKept = 0;
    const generated: GeneratedPage[] = result.pages.map((p) => {
      const validatedBody = validateWikilinks(p.body, knownThisBatch);
      linksKept += (validatedBody.match(/\[\[/g) ?? []).length;
      return {
        title: p.title,
        body: validatedBody,
        sourcePages: p.sourcePages,
        links: p.links.filter((l) => knownThisBatch.has(l)),
        sourceFilename: pdf.filename,
      };
    });

    emitStatus(bus, batchId, pdf.pdfId, "writing", generated.length);
    await writeStaging({
      stagingDir,
      batchId,
      batchTimestamp: new Date().toISOString(),
      pages: generated,
    });

    emitStatus(bus, batchId, pdf.pdfId, "done", generated.length);
    return { pagesWritten: generated.length, linksKept, isFailed: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emitStatus(bus, batchId, pdf.pdfId, "failed", 0, message);
    return { pagesWritten: 0, linksKept: 0, isFailed: true };
  }
}

export async function runBatch(args: RunBatchArgs): Promise<void> {
  const vaultTitles = await args.hooks.scanVaultTitles(args.vaultPath);

  let totalPages = 0;
  let totalLinks = 0;
  let totalFailed = 0;

  const queue = [...args.pdfs];
  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      const result = await processPdf(args, next, vaultTitles);
      totalPages += result.pagesWritten;
      totalLinks += result.linksKept;
      if (result.isFailed) totalFailed += 1;
    }
  }
  const workerCount = Math.min(args.maxConcurrent, args.pdfs.length);
  const workers = Array.from({ length: workerCount }, () => worker());
  await Promise.all(workers);

  args.bus.publish({
    type: "complete",
    batchId: args.batchId,
    totals: { pages: totalPages, links: totalLinks, failed: totalFailed },
  });
}
