import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runBatch } from "@/lib/pipeline/run-batch";
import { EventBus } from "@/lib/events/bus";
import type { BatchEvent } from "@/lib/types";

let staging: string;
let vault: string;
let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  staging = await mkdtemp(path.join(tmpdir(), "stg-"));
  vault = await mkdtemp(path.join(tmpdir(), "vlt-"));
  consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  await rm(staging, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
  consoleWarnSpy.mockRestore();
});

describe("runBatch", () => {
  it("runs the pipeline per PDF, emits events, writes staging", async () => {
    const bus = new EventBus();
    const events: BatchEvent[] = [];
    bus.subscribe("b1", (e) => events.push(e));

    await runBatch({
      bus,
      batchId: "b1",
      granularity: "medium",
      stagingDir: staging,
      vaultPath: vault,
      maxConcurrent: 2,
      pdfs: [
        { pdfId: "p1", filename: "a.pdf", bytes: new Uint8Array([1, 2, 3]) },
        { pdfId: "p2", filename: "b.pdf", bytes: new Uint8Array([4, 5, 6]) },
      ],
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
    await runBatch({
      bus,
      batchId: "ballfail",
      granularity: "medium",
      stagingDir: staging,
      vaultPath: vault,
      maxConcurrent: 1,
      pdfs: [{ pdfId: "p1", filename: "a.pdf", bytes: new Uint8Array([1]) }],
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
    await runBatch({
      bus,
      batchId: "b2",
      granularity: "medium",
      stagingDir: staging,
      vaultPath: vault,
      maxConcurrent: 1,
      pdfs: [{ pdfId: "p1", filename: "a.pdf", bytes: new Uint8Array([1]) }],
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

    await runBatch({
      bus,
      batchId: "b3",
      granularity: "medium",
      stagingDir: staging,
      vaultPath: vault,
      maxConcurrent: 2,
      pdfs: [
        { pdfId: "p1", filename: "good.pdf", bytes: new Uint8Array([1]) },
        { pdfId: "p2", filename: "bad.pdf", bytes: new Uint8Array([2]) },
      ],
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
    await runBatch({
      bus,
      batchId: "b4",
      granularity: "medium",
      stagingDir: staging,
      vaultPath: vault,
      maxConcurrent: 1,
      pdfs: [{ pdfId: "p1", filename: "a.pdf", bytes: new Uint8Array([1]) }],
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

    await runBatch({
      bus,
      batchId: "bauto",
      granularity: "auto",
      stagingDir: staging,
      vaultPath: vault,
      maxConcurrent: 2,
      pdfs: [
        { pdfId: "p1", filename: "a.pdf", bytes: new Uint8Array([1]) },
        { pdfId: "p2", filename: "b.pdf", bytes: new Uint8Array([2]) },
      ],
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
    await runBatch({
      bus,
      batchId: "bskip",
      granularity: "coarse",
      stagingDir: staging,
      vaultPath: vault,
      maxConcurrent: 1,
      pdfs: [{ pdfId: "p1", filename: "a.pdf", bytes: new Uint8Array([1]) }],
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

    await runBatch({
      bus,
      batchId: "bfail",
      granularity: "auto",
      stagingDir: staging,
      vaultPath: vault,
      maxConcurrent: 1,
      pdfs: [{ pdfId: "p1", filename: "a.pdf", bytes: new Uint8Array([1]) }],
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
});
