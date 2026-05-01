import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  appendManifestEntry,
  BatchManifestSchema,
  buildManifest,
  finalizeManifest,
  MANIFEST_FILENAME,
  MANIFEST_PARTIAL_FILENAME,
  MANIFEST_VERSION,
  writeManifest,
} from "@/lib/pipeline/manifest";
import type { GeneratedPage } from "@/lib/types";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "manifest-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const samplePage = (overrides: Partial<GeneratedPage> = {}): GeneratedPage => ({
  title: "Backpropagation",
  body: "B",
  sourcePages: "pp. 14-22",
  aliases: ["Backprop"],
  links: ["Gradient Descent"],
  sourceFilename: "Goodfellow_DeepLearning.pdf",
  ...overrides,
});

describe("buildManifest", () => {
  it("produces a manifest matching the contract shape", () => {
    const manifest = buildManifest({
      batchId: "b1",
      granularity: "medium",
      pages: [samplePage()],
      createdAt: "2026-04-27T00:00:00.000Z",
    });
    expect(manifest.version).toBe(MANIFEST_VERSION);
    expect(manifest.batchId).toBe("b1");
    expect(manifest.granularity).toBe("medium");
    expect(manifest.createdAt).toBe("2026-04-27T00:00:00.000Z");
    expect(manifest.pages).toHaveLength(1);
    const [page] = manifest.pages;
    expect(page.title).toBe("Backpropagation");
    expect(page.filename).toBe("Backpropagation.md");
    expect(page.aliases).toEqual(["Backprop"]);
    expect(page.type).toBe("concept");
    expect(page.source).toBe("Goodfellow_DeepLearning.pdf");
    expect(page.sourcePages).toBe("pp. 14-22");
    expect(page.tags).toEqual(["wiki-generator"]);
    expect(page.links).toEqual(["Gradient Descent"]);
    expect(page.createdAt).toBe("2026-04-27T00:00:00.000Z");
  });

  it("handles the empty pages case", () => {
    const manifest = buildManifest({
      batchId: "empty",
      granularity: "auto",
      pages: [],
    });
    expect(manifest.pages).toEqual([]);
    expect(BatchManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it("validates against BatchManifestSchema", () => {
    const manifest = buildManifest({
      batchId: "b1",
      granularity: "fine",
      pages: [samplePage(), samplePage({ title: "Other", aliases: [] })],
    });
    expect(BatchManifestSchema.safeParse(manifest).success).toBe(true);
  });
});

describe("writeManifest", () => {
  it("writes a parseable JSON file at <staging>/<batchId>/manifest.json", async () => {
    await mkdir(path.join(dir, "b1"));
    const filePath = await writeManifest({
      stagingDir: dir,
      batchId: "b1",
      granularity: "coarse",
      pages: [samplePage()],
      createdAt: "2026-04-27T00:00:00.000Z",
    });
    expect(filePath).toBe(path.join(dir, "b1", MANIFEST_FILENAME));
    const raw = await readFile(filePath, "utf8");
    const parsed = BatchManifestSchema.parse(JSON.parse(raw));
    expect(parsed.batchId).toBe("b1");
    expect(parsed.pages[0].filename).toBe("Backpropagation.md");
  });
});

describe("appendManifestEntry + finalizeManifest", () => {
  it("produces the same manifest shape as writeManifest for the same inputs", async () => {
    const pages = [
      samplePage({ title: "Backpropagation" }),
      samplePage({ title: "Gradient Descent", aliases: [] }),
    ];

    const streamingDir = path.join(dir, "stream");
    await mkdir(path.join(streamingDir, "bx"), { recursive: true });
    await appendManifestEntry({
      stagingDir: streamingDir,
      batchId: "bx",
      pdfId: "pdf-a",
      pages: [pages[0]],
    });
    await appendManifestEntry({
      stagingDir: streamingDir,
      batchId: "bx",
      pdfId: "pdf-b",
      pages: [pages[1]],
    });
    const finalPath = await finalizeManifest({
      stagingDir: streamingDir,
      batchId: "bx",
      granularity: "medium",
      createdAt: "2026-04-29T00:00:00.000Z",
    });

    const direct = buildManifest({
      batchId: "bx",
      granularity: "medium",
      pages,
      createdAt: "2026-04-29T00:00:00.000Z",
    });
    const streamed = JSON.parse(await readFile(finalPath, "utf8"));
    expect(streamed).toEqual(direct);
    expect(
      existsSync(path.join(streamingDir, "bx", MANIFEST_PARTIAL_FILENAME)),
    ).toBe(false);
  });

  it("finalizes to an empty pages array when nothing was appended", async () => {
    const finalPath = await finalizeManifest({
      stagingDir: dir,
      batchId: "empty",
      granularity: "auto",
      createdAt: "2026-04-29T00:00:00.000Z",
    });
    const raw = await readFile(finalPath, "utf8");
    const parsed = BatchManifestSchema.parse(JSON.parse(raw));
    expect(parsed.pages).toEqual([]);
    expect(parsed.batchId).toBe("empty");
  });

  it("preserves entry order across multiple appends", async () => {
    const titles = ["A", "B", "C", "D"];
    await mkdir(path.join(dir, "bord"), { recursive: true });
    for (const title of titles) {
      await appendManifestEntry({
        stagingDir: dir,
        batchId: "bord",
        pdfId: `pdf-${title}`,
        pages: [samplePage({ title })],
      });
    }
    const finalPath = await finalizeManifest({
      stagingDir: dir,
      batchId: "bord",
      granularity: "medium",
    });
    const parsed = BatchManifestSchema.parse(
      JSON.parse(await readFile(finalPath, "utf8")),
    );
    expect(parsed.pages.map((p) => p.title)).toEqual(titles);
  });

  it("dedupes by pdfId so duplicate appends do not duplicate pages", async () => {
    await mkdir(path.join(dir, "dedupe"), { recursive: true });
    await appendManifestEntry({
      stagingDir: dir,
      batchId: "dedupe",
      pdfId: "pdf-1",
      pages: [samplePage({ title: "Stale" })],
    });
    await appendManifestEntry({
      stagingDir: dir,
      batchId: "dedupe",
      pdfId: "pdf-1",
      pages: [samplePage({ title: "Fresh" })],
    });
    const finalPath = await finalizeManifest({
      stagingDir: dir,
      batchId: "dedupe",
      granularity: "medium",
    });
    const parsed = BatchManifestSchema.parse(
      JSON.parse(await readFile(finalPath, "utf8")),
    );
    expect(parsed.pages.map((p) => p.title)).toEqual(["Fresh"]);
  });

  it("preserves an existing manifest when partial is absent", async () => {
    const existingDir = path.join(dir, "preserve");
    await mkdir(existingDir, { recursive: true });
    const firstPath = await writeManifest({
      stagingDir: dir,
      batchId: "preserve",
      granularity: "fine",
      pages: [samplePage({ title: "Important" })],
      createdAt: "2026-04-29T00:00:00.000Z",
    });
    const before = await readFile(firstPath, "utf8");

    const finalPath = await finalizeManifest({
      stagingDir: dir,
      batchId: "preserve",
      granularity: "fine",
    });
    expect(finalPath).toBe(firstPath);
    const after = await readFile(finalPath, "utf8");
    expect(after).toBe(before);
  });
});
