import { NextResponse } from "next/server";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { loadConfig } from "@/lib/config";
import { createLlmClient } from "@/lib/llm";
import { getEventBus } from "@/lib/events/bus";
import { runBatch } from "@/lib/pipeline/run-batch";
import { parsePdf } from "@/lib/pipeline/parse-pdf";
import { renderPdfPageToPng } from "@/lib/pipeline/render-page";
import { ocrPageImage } from "@/lib/pipeline/ocr-fallback";
import { scanVaultTitles } from "@/lib/pipeline/scan-vault";
import { extractConcepts } from "@/lib/pipeline/extract-concepts";
import { pickGranularity } from "@/lib/pipeline/pick-granularity";
import type { Granularity } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 600;

const GranularitySchema = z.enum(["coarse", "medium", "fine", "auto"]);

export async function POST(req: Request): Promise<Response> {
  const cfg = loadConfig();
  const form = await req.formData();
  const rawGranularity = form.get("granularity");
  const parsedGranularity = GranularitySchema.safeParse(rawGranularity);
  if (!parsedGranularity.success) {
    return NextResponse.json({ error: "invalid granularity" }, { status: 400 });
  }
  const granularity: Granularity = parsedGranularity.data;

  const fileEntries = form
    .getAll("files")
    .filter((v): v is File => v instanceof File);
  if (fileEntries.length === 0) {
    return NextResponse.json({ error: "no files" }, { status: 400 });
  }

  const batchId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const stagingDir =
    process.env.WIKI_STAGING_DIR ?? path.join(process.cwd(), "staging");

  const pdfs = await Promise.all(
    fileEntries.map(async (file) => ({
      pdfId: randomUUID(),
      filename: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })),
  );

  const llm = createLlmClient({
    provider: cfg.llmProvider,
    anthropicApiKey: cfg.anthropicApiKey,
    openaiApiKey: cfg.openaiApiKey,
  });
  const bus = getEventBus();

  void runBatch({
    bus,
    batchId,
    granularity,
    stagingDir,
    vaultPath: cfg.vaultPath,
    maxConcurrent: cfg.maxConcurrentPdfs,
    pdfs,
    hooks: {
      parsePdf: (bytes) =>
        parsePdf(bytes, { textThreshold: cfg.ocrTextThreshold }),
      renderPdfPageToPng: (bytes, pageNumber) =>
        renderPdfPageToPng(bytes, pageNumber),
      ocrPageImage: (png) =>
        ocrPageImage({ client: llm, model: cfg.ocrModel }, png),
      scanVaultTitles: (vaultPath) => scanVaultTitles(vaultPath),
      pickGranularity: (args) =>
        pickGranularity({
          client: llm,
          model: cfg.granularityPickerModel,
          pdfText: args.pdfText,
          pageCount: args.pageCount,
        }),
      extractConcepts: (args) =>
        extractConcepts({
          client: llm,
          model: cfg.extractionModel,
          pdfText: args.pdfText,
          vaultTitles: args.vaultTitles,
          granularity: args.granularity,
        }),
    },
  });

  return NextResponse.json({
    batchId,
    pdfs: pdfs.map((p) => ({ pdfId: p.pdfId, filename: p.filename })),
  });
}
