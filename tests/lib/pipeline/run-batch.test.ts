import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runBatch, type BatchPdf } from "@/lib/pipeline/run-batch";
import { EventBus } from "@/lib/events/bus";
import type { BatchEvent } from "@/lib/types";

let staging: string;
let vault: string;
let pdfsDir: string;
let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  staging = await mkdtemp(path.join(tmpdir(), "stg-"));
  vault = await mkdtemp(path.join(tmpdir(), "vlt-"));
  pdfsDir = await mkdtemp(path.join(tmpdir(), "pdfs-"));
  consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  await rm(staging, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
  await rm(pdfsDir, { recursive: true, force: true });
  consoleWarnSpy.mockRestore();
});

async function makePdf(name: string, contents: Uint8Array): Promise<BatchPdf> {
  const filePath = path.join(pdfsDir, name);
  await writeFile(filePath, contents);
  return { pdfId: name.replace(/\W/g, ""), filename: name, filePath };
}

describe("runBatch", () => {
  it("runs the pipeline per PDF, emits events, writes staging", async () => {
    const bus = new EventBus();
    const events: BatchEvent[] = [];
    bus.subscribe("b1", (e) => events.push(e));

    const pdf1 = await makePdf("a.pdf", new Uint8Array([1, 2, 3]));
    const pdf2 = await makePdf("b.pdf", new Uint8Array([4, 5, 6]));

    await runBatch({
      bus,
      batchId: "b1",
      granularity: "medium",
      stagingDir: staging,
      vaultPath: vault,
      maxConcurrent: 2,
      maxConcurrentLlm: 4,
      pdfs: [pdf1, pdf2],
      hooks: {
        parsePdf: vi
          .fn()
          .mockResolvedValue([
            { pageNumber: 1, text: "the page", kind: "text" },
          ]),
        renderPdfPageToPng: vi.fn(),
        ocrPageImage: vi.fn(),
        scanVaultTitles: vi
          .fn()
          .mockResolvedValue(new Set<string>(["Existing"])),
        pickGranularity: vi.fn().mockResolvedValue("medium"),
        extractConcepts: vi.fn().mockResolvedValue({
          pages: [
            {
              title: "Concept",
              body: "Body [[Existing]]",
              sourcePages: "p.1",
              aliases: [],
              links: ["Existing"],
            },
          ],
        }),
      },
    });

    const stages = events
      .filter((e) => e.type === "status")
      .map((e) => (e.type === "status" ? e.stage : ""));
    expect(stages).toContain("parsing");
    expect(stages).toContain("extracting");
    expect(stages).toContain("writing");
    expect(stages).toContain("done");
    const completion = events.find((e) => e.type === "complete");
    expect(completion).toBeDefined();

    const filesP1 = await readdir(path.join(staging, "b1"));
    expect(filesP1).toContain("Concept.md");
    expect(filesP1).toContain("manifest.json");
    expect(filesP1).not.toContain("manifest.partial.ndjson");
    const manifestRaw = await readFile(
      path.join(staging, "b1", "manifest.json"),
      "utf8",
    );
    const manifest = JSON.parse(manifestRaw) as {
      version: string;
      pages: Array<{ title: string; filename: string }>;
    };
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.pages.map((p) => p.title)).toContain("Concept");
  });

  it("emits a manifest.json even when every PDF fails", async () => {
    const bus = new EventBus();
    const pdf1 = await makePdf("a.pdf", new Uint8Array([1]));
    await runBatch({
      bus,
      batchId: "ballfail",
      granularity: "medium",
      stagingDir: staging,
      vaultPath: vault,
      maxConcurrent: 1,
      maxConcurrentLlm: 1,
      pdfs: [pdf1],
      hooks: {
        parsePdf: vi.fn().mockRejectedValue(new Error("boom")),
        renderPdfPageToPng: vi.fn(),
        ocrPageImage: vi.fn(),
        scanVaultTitles: vi.fn().mockResolvedValue(new Set<string>()),
        pickGranularity: vi.fn().mockResolvedValue("medium"),
        extractConcepts: vi.fn(),
      },
    });
    expect(existsSync(path.join(staging, "ballfail", "manifest.json"))).toBe(
      true,
    );
    const manifestRaw = await readFile(
      path.join(staging, "ballfail", "manifest.json"),
      "utf8",
    );
    const manifest = JSON.parse(manifestRaw) as { pages: unknown[] };
    expect(manifest.pages).toEqual([]);
  });

  it("triggers ocr fallback for image pages", async () => {
    const bus = new EventBus();
    const ocr = vi.fn().mockResolvedValue("recovered text");
    const pdf1 = await makePdf("a.pdf", new Uint8Array([1]));
    await runBatch({
      bus,
      batchId: "b2",
      granularity: "medium",
      stagingDir: staging,
      vaultPath: vault,
      maxConcurrent: 1,
      maxConcurrentLlm: 2,
      pdfs: [pdf1],
      hooks: {
        parsePdf: vi
          .fn()
          .mockResolvedValue([{ pageNumber: 1, text: "", kind: "image" }]),
        renderPdfPageToPng: vi.fn().mockResolvedValue(new Uint8Array([0x89])),
        ocrPageImage: ocr,
        scanVaultTitles: vi.fn().mockResolvedValue(new Set<string>()),
        pickGranularity: vi.fn().mockResolvedValue("medium"),
        extractConcepts: vi.fn().mockResolvedValue({
          pages: [
            {
              title: "X",
              body: "B",
              sourcePages: "p.1",
              aliases: [],
              links: [],
            },
          ],
        }),
      },
    });
    expect(ocr).toHaveBeenCalledTimes(1);
  });

  it("marks a PDF failed without aborting the batch", async () => {
    const bus = new EventBus();
    const events: BatchEvent[] = [];
    bus.subscribe("b3", (e) => events.push(e));

    const good = await makePdf("good.pdf", new Uint8Array([1]));
    const bad = await makePdf("bad.pdf", new Uint8Array([2]));

    await runBatch({
      bus,
      batchId: "b3",
      granularity: "medium",
      stagingDir: staging,
      vaultPath: vault,
      maxConcurrent: 2,
      maxConcurrentLlm: 2,
      pdfs: [good, bad],
      hooks: {
        parsePdf: vi
          .fn()
          .mockImplementation((bytes: Uint8Array) =>
            bytes[0] === 2
              ? Promise.reject(new Error("boom"))
              : Promise.resolve([{ pageNumber: 1, text: "ok", kind: "text" }]),
          ),
        renderPdfPageToPng: vi.fn(),
        ocrPageImage: vi.fn(),
        scanVaultTitles: vi.fn().mockResolvedValue(new Set<string>()),
        pickGranularity: vi.fn().mockResolvedValue("medium"),
        extractConcepts: vi.fn().mockResolvedValue({
          pages: [
            {
              title: "T",
              body: "B",
              sourcePages: "p.1",
              aliases: [],
              links: [],
            },
          ],
        }),
      },
    });

    const failed = events.find(
      (e) => e.type === "status" && e.stage === "failed",
    );
    const done = events.find((e) => e.type === "status" && e.stage === "done");
    expect(failed).toBeDefined();
    expect(done).toBeDefined();
  });

  it("ocr failure on one page does not abort the pdf", async () => {
    const bus = new EventBus();
    const events: BatchEvent[] = [];
    bus.subscribe("b4", (e) => events.push(e));
    const pdf1 = await makePdf("a.pdf", new Uint8Array([1]));
    await runBatch({
      bus,
      batchId: "b4",
      granularity: "medium",
      stagingDir: staging,
      vaultPath: vault,
      maxConcurrent: 1,
      maxConcurrentLlm: 1,
      pdfs: [pdf1],
      hooks: {
        parsePdf: vi.fn().mockResolvedValue([
          { pageNumber: 1, text: "", kind: "image" },
          { pageNumber: 2, text: "", kind: "image" },
        ]),
        renderPdfPageToPng: vi.fn().mockResolvedValue(new Uint8Array([0x89])),
        ocrPageImage: vi
          .fn()
          .mockRejectedValueOnce(new Error("vision down"))
          .mockResolvedValueOnce("recovered"),
        scanVaultTitles: vi.fn().mockResolvedValue(new Set<string>()),
        pickGranularity: vi.fn().mockResolvedValue("medium"),
        extractConcepts: vi.fn().mockResolvedValue({
          pages: [
            {
              title: "T",
              body: "B",
              sourcePages: "p.1-2",
              aliases: [],
              links: [],
            },
          ],
        }),
      },
    });
    const done = events.find((e) => e.type === "status" && e.stage === "done");
    expect(done).toBeDefined();
  });

  it("calls pickGranularity per pdf when granularity is auto and forwards the result", async () => {
    const bus = new EventBus();
    const picker = vi.fn().mockResolvedValue("fine");
    const extract = vi.fn().mockResolvedValue({
      pages: [
        { title: "T", body: "B", sourcePages: "p.1", aliases: [], links: [] },
      ],
    });

    const pdf1 = await makePdf("a.pdf", new Uint8Array([1]));
    const pdf2 = await makePdf("b.pdf", new Uint8Array([2]));

    await runBatch({
      bus,
      batchId: "bauto",
      granularity: "auto",
      stagingDir: staging,
      vaultPath: vault,
      maxConcurrent: 2,
      maxConcurrentLlm: 4,
      pdfs: [pdf1, pdf2],
      hooks: {
        parsePdf: vi
          .fn()
          .mockResolvedValue([
            { pageNumber: 1, text: "the page", kind: "text" },
          ]),
        renderPdfPageToPng: vi.fn(),
        ocrPageImage: vi.fn(),
        scanVaultTitles: vi.fn().mockResolvedValue(new Set<string>()),
        pickGranularity: picker,
        extractConcepts: extract,
      },
    });

    expect(picker).toHaveBeenCalledTimes(2);
    expect(extract).toHaveBeenCalledTimes(2);
    expect(extract.mock.calls[0]?.[0]?.granularity).toBe("fine");
    expect(extract.mock.calls[1]?.[0]?.granularity).toBe("fine");
  });

  it("does not call pickGranularity when granularity is non-auto", async () => {
    const bus = new EventBus();
    const picker = vi.fn().mockResolvedValue("fine");
    const pdf1 = await makePdf("a.pdf", new Uint8Array([1]));
    await runBatch({
      bus,
      batchId: "bskip",
      granularity: "coarse",
      stagingDir: staging,
      vaultPath: vault,
      maxConcurrent: 1,
      maxConcurrentLlm: 1,
      pdfs: [pdf1],
      hooks: {
        parsePdf: vi
          .fn()
          .mockResolvedValue([{ pageNumber: 1, text: "ok", kind: "text" }]),
        renderPdfPageToPng: vi.fn(),
        ocrPageImage: vi.fn(),
        scanVaultTitles: vi.fn().mockResolvedValue(new Set<string>()),
        pickGranularity: picker,
        extractConcepts: vi.fn().mockResolvedValue({
          pages: [
            {
              title: "T",
              body: "B",
              sourcePages: "p.1",
              aliases: [],
              links: [],
            },
          ],
        }),
      },
    });
    expect(picker).not.toHaveBeenCalled();
  });

  it("falls back to medium and continues when pickGranularity throws", async () => {
    const bus = new EventBus();
    const events: BatchEvent[] = [];
    bus.subscribe("bfail", (e) => events.push(e));
    const picker = vi.fn().mockRejectedValue(new Error("classifier down"));
    const extract = vi.fn().mockResolvedValue({
      pages: [
        { title: "T", body: "B", sourcePages: "p.1", aliases: [], links: [] },
      ],
    });
    const pdf1 = await makePdf("a.pdf", new Uint8Array([1]));

    await runBatch({
      bus,
      batchId: "bfail",
      granularity: "auto",
      stagingDir: staging,
      vaultPath: vault,
      maxConcurrent: 1,
      maxConcurrentLlm: 1,
      pdfs: [pdf1],
      hooks: {
        parsePdf: vi
          .fn()
          .mockResolvedValue([{ pageNumber: 1, text: "ok", kind: "text" }]),
        renderPdfPageToPng: vi.fn(),
        ocrPageImage: vi.fn(),
        scanVaultTitles: vi.fn().mockResolvedValue(new Set<string>()),
        pickGranularity: picker,
        extractConcepts: extract,
      },
    });

    expect(picker).toHaveBeenCalledTimes(1);
    expect(extract.mock.calls[0]?.[0]?.granularity).toBe("medium");
    const done = events.find((e) => e.type === "status" && e.stage === "done");
    expect(done).toBeDefined();
  });

  it("skips PDFs already marked done in the checkpoint", async () => {
    const bus = new EventBus();
    const events: BatchEvent[] = [];
    bus.subscribe("bresume", (e) => events.push(e));

    const pdf1 = await makePdf("done.pdf", new Uint8Array([1]));
    const pdf2 = await makePdf("todo.pdf", new Uint8Array([2]));

    await mkdir(path.join(staging, "bresume"), { recursive: true });
    const checkpointPath = path.join(staging, "bresume", "_progress.json");
    await writeFile(
      checkpointPath,
      JSON.stringify({
        batchId: "bresume",
        entries: [
          {
            pdfId: pdf1.pdfId,
            ok: true,
            pagesWritten: 3,
            finishedAt: "2026-04-29T00:00:00.000Z",
          },
        ],
      }),
      "utf8",
    );

    const parsePdf = vi
      .fn()
      .mockResolvedValue([{ pageNumber: 1, text: "x", kind: "text" }]);
    const extractConcepts = vi.fn().mockResolvedValue({
      pages: [
        { title: "T", body: "B", sourcePages: "p.1", aliases: [], links: [] },
      ],
    });

    await runBatch({
      bus,
      batchId: "bresume",
      granularity: "medium",
      stagingDir: staging,
      vaultPath: vault,
      maxConcurrent: 2,
      maxConcurrentLlm: 2,
      pdfs: [pdf1, pdf2],
      hooks: {
        parsePdf,
        renderPdfPageToPng: vi.fn(),
        ocrPageImage: vi.fn(),
        scanVaultTitles: vi.fn().mockResolvedValue(new Set<string>()),
        pickGranularity: vi.fn().mockResolvedValue("medium"),
        extractConcepts,
      },
    });

    expect(parsePdf).toHaveBeenCalledTimes(1);
    expect(extractConcepts).toHaveBeenCalledTimes(1);
    const doneEvents = events.filter(
      (e) => e.type === "status" && e.stage === "done",
    );
    expect(doneEvents).toHaveLength(2);
    const resumed = doneEvents.find(
      (e) => e.type === "status" && e.pdfId === pdf1.pdfId,
    );
    expect(resumed && resumed.type === "status" && resumed.pagesGenerated).toBe(
      3,
    );
  });

  it("respects maxConcurrentLlm across concurrent PDFs", async () => {
    const bus = new EventBus();
    const limit = 2;
    let active = 0;
    let observedMax = 0;
    const extractConcepts = vi.fn().mockImplementation(async () => {
      active += 1;
      observedMax = Math.max(observedMax, active);
      await new Promise((resolve) => setTimeout(resolve, 25));
      active -= 1;
      return {
        pages: [
          {
            title: "T",
            body: "B",
            sourcePages: "p.1",
            aliases: [],
            links: [],
          },
        ],
      };
    });

    const pdfs: BatchPdf[] = [];
    for (let i = 0; i < 6; i++) {
      pdfs.push(await makePdf(`f${i}.pdf`, new Uint8Array([i])));
    }

    await runBatch({
      bus,
      batchId: "blimit",
      granularity: "medium",
      stagingDir: staging,
      vaultPath: vault,
      maxConcurrent: 6,
      maxConcurrentLlm: limit,
      pdfs,
      hooks: {
        parsePdf: vi
          .fn()
          .mockResolvedValue([{ pageNumber: 1, text: "ok", kind: "text" }]),
        renderPdfPageToPng: vi.fn(),
        ocrPageImage: vi.fn(),
        scanVaultTitles: vi.fn().mockResolvedValue(new Set<string>()),
        pickGranularity: vi.fn().mockResolvedValue("medium"),
        extractConcepts,
      },
    });

    expect(extractConcepts).toHaveBeenCalledTimes(6);
    expect(observedMax).toBeLessThanOrEqual(limit);
    expect(observedMax).toBeGreaterThan(0);
  });

  it("reads PDF bytes lazily from filePath", async () => {
    const bus = new EventBus();
    const pdfPath = path.join(pdfsDir, "lazy.pdf");
    await writeFile(pdfPath, new Uint8Array([0xab, 0xcd]));

    const parsePdf = vi.fn().mockImplementation(async (bytes: Uint8Array) => {
      expect(bytes).toBeInstanceOf(Uint8Array);
      expect(bytes.length).toBe(2);
      return [{ pageNumber: 1, text: "ok", kind: "text" as const }];
    });

    await runBatch({
      bus,
      batchId: "blazy",
      granularity: "medium",
      stagingDir: staging,
      vaultPath: vault,
      maxConcurrent: 1,
      maxConcurrentLlm: 1,
      pdfs: [{ pdfId: "p1", filename: "lazy.pdf", filePath: pdfPath }],
      hooks: {
        parsePdf,
        renderPdfPageToPng: vi.fn(),
        ocrPageImage: vi.fn(),
        scanVaultTitles: vi.fn().mockResolvedValue(new Set<string>()),
        pickGranularity: vi.fn().mockResolvedValue("medium"),
        extractConcepts: vi.fn().mockResolvedValue({
          pages: [
            {
              title: "T",
              body: "B",
              sourcePages: "p.1",
              aliases: [],
              links: [],
            },
          ],
        }),
      },
    });

    expect(parsePdf).toHaveBeenCalledTimes(1);
  });
});
