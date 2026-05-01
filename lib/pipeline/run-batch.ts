import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { EventBus } from "@/lib/events/bus";
import type {
  BatchEvent,
  ExtractionResult,
  GeneratedPage,
  Granularity,
  ResolvedGranularity,
  Stage,
} from "@/lib/types";
import { writeStaging } from "@/lib/pipeline/write-staging";
import {
  appendManifestEntry,
  finalizeManifest,
  writeManifest,
} from "@/lib/pipeline/manifest";
import { validateWikilinks } from "@/lib/pipeline/wikilink-validator";
import {
  loadCheckpoint,
  markPdfDone,
  type CheckpointEntry,
} from "@/lib/pipeline/checkpoint";
import { withRetry } from "@/lib/llm/retry";

export { writeManifest };

export interface ParsedPageInput {
  pageNumber: number;
  text: string;
  kind: "text" | "image";
}

export interface BatchHooks {
  parsePdf: (bytes: Uint8Array) => Promise<ParsedPageInput[]>;
  renderPdfPageToPng: (
    bytes: Uint8Array,
    pageNumber: number,
  ) => Promise<Uint8Array>;
  ocrPageImage: (png: Uint8Array) => Promise<string>;
  scanVaultTitles: (vaultPath: string) => Promise<Set<string>>;
  pickGranularity: (args: {
    pdfText: string;
    pageCount: number;
  }) => Promise<ResolvedGranularity>;
  extractConcepts: (args: {
    pdfText: string;
    vaultTitles: string[];
    granularity: ResolvedGranularity;
  }) => Promise<ExtractionResult>;
}

export interface BatchPdf {
  pdfId: string;
  filename: string;
  filePath: string;
}

export interface RunBatchArgs {
  bus: EventBus;
  batchId: string;
  granularity: Granularity;
  stagingDir: string;
  vaultPath: string;
  maxConcurrent: number;
  maxConcurrentLlm: number;
  pdfs: BatchPdf[];
  hooks: BatchHooks;
}

interface PdfResult {
  pagesWritten: number;
  linksKept: number;
  isFailed: boolean;
  pages: GeneratedPage[];
}

interface Semaphore {
  acquire: () => Promise<() => void>;
}

function createSemaphore(limit: number): Semaphore {
  const effectiveLimit = Math.max(1, limit);
  let active = 0;
  const waiters: Array<() => void> = [];
  const release = (): void => {
    active -= 1;
    const next = waiters.shift();
    if (next) next();
  };
  return {
    acquire: () =>
      new Promise<() => void>((resolve) => {
        const tryAcquire = (): void => {
          if (active < effectiveLimit) {
            active += 1;
            resolve(release);
            return;
          }
          waiters.push(tryAcquire);
        };
        tryAcquire();
      }),
  };
}

async function withLlmSlot<T>(
  semaphore: Semaphore,
  task: () => Promise<T>,
): Promise<T> {
  const release = await semaphore.acquire();
  try {
    return await task();
  } finally {
    release();
  }
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
  llmSemaphore: Semaphore,
): Promise<PdfResult> {
  const { bus, batchId, granularity, stagingDir, hooks } = args;
  emitStatus(bus, batchId, pdf.pdfId, "parsing", 0);
  try {
    let parseBytes: Uint8Array | null = await readFile(pdf.filePath);
    const parsed = await hooks.parsePdf(parseBytes);
    parseBytes = null;

    const imagePages = parsed.filter((p) => p.kind === "image");
    if (imagePages.length > 0) {
      emitStatus(bus, batchId, pdf.pdfId, "ocr", 0);
      let ocrBytes: Uint8Array | null = await readFile(pdf.filePath);
      try {
        for (const page of imagePages) {
          try {
            const png = await hooks.renderPdfPageToPng(
              ocrBytes,
              page.pageNumber,
            );
            page.text = await withLlmSlot(llmSemaphore, () =>
              withRetry(() => hooks.ocrPageImage(png)),
            );
          } catch (err) {
            console.warn(
              `[run-batch] ocr failed for ${pdf.filename} page ${page.pageNumber}:`,
              err,
            );
            page.text = "";
          }
        }
      } finally {
        ocrBytes = null;
      }
    }

    emitStatus(bus, batchId, pdf.pdfId, "extracting", 0);
    const fullText = parsed
      .map((p) => `[Page ${p.pageNumber}]\n${p.text}`)
      .join("\n\n");

    let resolvedGranularity: ResolvedGranularity;
    if (granularity === "auto") {
      try {
        resolvedGranularity = await withLlmSlot(llmSemaphore, () =>
          withRetry(() =>
            hooks.pickGranularity({
              pdfText: fullText,
              pageCount: parsed.length,
            }),
          ),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          `[run-batch] pickGranularity failed for ${pdf.filename}; falling back to medium:`,
          message,
        );
        resolvedGranularity = "medium";
      }
    } else {
      resolvedGranularity = granularity;
    }

    const result = await withLlmSlot(llmSemaphore, () =>
      hooks.extractConcepts({
        pdfText: fullText,
        vaultTitles: Array.from(vaultTitles),
        granularity: resolvedGranularity,
      }),
    );

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
        aliases: p.aliases,
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
    return {
      pagesWritten: generated.length,
      linksKept,
      isFailed: false,
      pages: generated,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emitStatus(bus, batchId, pdf.pdfId, "failed", 0, message);
    return { pagesWritten: 0, linksKept: 0, isFailed: true, pages: [] };
  }
}

export async function runBatch(args: RunBatchArgs): Promise<void> {
  await mkdir(path.join(args.stagingDir, args.batchId), { recursive: true });

  const checkpoint = await loadCheckpoint(args.stagingDir, args.batchId);
  const completedById = new Map<string, CheckpointEntry>();
  if (checkpoint) {
    for (const entry of checkpoint.entries) {
      completedById.set(entry.pdfId, entry);
    }
  }

  const vaultTitles = await args.hooks.scanVaultTitles(args.vaultPath);

  let totalPages = 0;
  let totalLinks = 0;
  let totalFailed = 0;

  const remainingPdfs: BatchPdf[] = [];
  for (const pdf of args.pdfs) {
    const prior = completedById.get(pdf.pdfId);
    if (prior && prior.ok) {
      emitStatus(args.bus, args.batchId, pdf.pdfId, "done", prior.pagesWritten);
      totalPages += prior.pagesWritten;
      continue;
    }
    remainingPdfs.push(pdf);
  }

  const llmSemaphore = createSemaphore(args.maxConcurrentLlm);
  const queue = [...remainingPdfs];
  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      const result = await processPdf(args, next, vaultTitles, llmSemaphore);
      totalPages += result.pagesWritten;
      totalLinks += result.linksKept;
      if (result.isFailed) totalFailed += 1;

      if (!result.isFailed) {
        await appendManifestEntry({
          stagingDir: args.stagingDir,
          batchId: args.batchId,
          pdfId: next.pdfId,
          pages: result.pages,
        });
      }
      const entry: CheckpointEntry = {
        pdfId: next.pdfId,
        ok: !result.isFailed,
        pagesWritten: result.pagesWritten,
        finishedAt: new Date().toISOString(),
      };
      try {
        await markPdfDone(args.stagingDir, args.batchId, entry);
      } catch (err) {
        console.warn("[run-batch] failed to write checkpoint:", err);
      }
    }
  }

  const workerCount = Math.max(
    1,
    Math.min(args.maxConcurrent, remainingPdfs.length),
  );
  const workers = Array.from(
    { length: remainingPdfs.length === 0 ? 0 : workerCount },
    () => worker(),
  );
  await Promise.all(workers);

  await finalizeManifest({
    stagingDir: args.stagingDir,
    batchId: args.batchId,
    granularity: args.granularity,
  });

  args.bus.publish({
    type: "complete",
    batchId: args.batchId,
    totals: { pages: totalPages, links: totalLinks, failed: totalFailed },
  });
}
