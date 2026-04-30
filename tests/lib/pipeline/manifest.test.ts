import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  BatchManifestSchema,
  buildManifest,
  MANIFEST_FILENAME,
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
