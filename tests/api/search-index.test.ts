import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const ORIGINAL_ENV = process.env.WIKI_STAGING_DIR;
let stagingDir: string;

beforeEach(async () => {
  stagingDir = await mkdtemp(path.join(tmpdir(), "wikigen-search-test-"));
  process.env.WIKI_STAGING_DIR = stagingDir;
});

afterEach(async () => {
  await rm(stagingDir, { recursive: true, force: true });
  if (ORIGINAL_ENV === undefined) delete process.env.WIKI_STAGING_DIR;
  else process.env.WIKI_STAGING_DIR = ORIGINAL_ENV;
});

async function writeBatch(batchId: string, manifest: unknown): Promise<void> {
  const dir = path.join(stagingDir, batchId);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify(manifest),
    "utf8",
  );
}

describe("GET /api/search-index", () => {
  it("returns empty records when staging dir is missing", async () => {
    await rm(stagingDir, { recursive: true, force: true });
    const { GET } = await import("@/app/api/search-index/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ records: [] });
  });

  it("flattens manifest pages across batches with stable ids", async () => {
    await writeBatch("a", {
      version: "1.0.0",
      batchId: "a",
      createdAt: "2026-04-25T00:00:00.000Z",
      granularity: "medium",
      pages: [
        {
          title: "Alpha",
          filename: "Alpha.md",
          aliases: ["A1"],
          type: "concept",
          source: "a.pdf",
          sourcePages: "p. 1",
          tags: [],
          links: [],
          createdAt: "2026-04-25T00:00:00.000Z",
        },
      ],
    });
    await writeBatch("b", {
      version: "1.0.0",
      batchId: "b",
      createdAt: "2026-04-27T00:00:00.000Z",
      granularity: "fine",
      pages: [
        {
          title: "Beta",
          filename: "Beta.md",
          aliases: [],
          type: "concept",
          source: "b.pdf",
          sourcePages: "pp. 2-3",
          tags: [],
          links: [],
          createdAt: "2026-04-27T00:00:00.000Z",
        },
      ],
    });

    const { GET } = await import("@/app/api/search-index/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.records).toHaveLength(2);
    const ids = json.records.map((r: { id: string }) => r.id).sort();
    expect(ids).toEqual(["a::Alpha.md", "b::Beta.md"]);
    const alpha = json.records.find(
      (r: { id: string }) => r.id === "a::Alpha.md",
    );
    expect(alpha).toMatchObject({
      batchId: "a",
      filename: "Alpha.md",
      title: "Alpha",
      aliases: ["A1"],
      source: "a.pdf",
      sourcePages: "p. 1",
    });
  });

  it("skips invalid manifests and invalid batch directory names", async () => {
    await mkdir(path.join(stagingDir, "broken"), { recursive: true });
    await writeFile(
      path.join(stagingDir, "broken", "manifest.json"),
      "{ not json",
      "utf8",
    );
    await mkdir(path.join(stagingDir, "../escape"), { recursive: true }).catch(
      () => undefined,
    );
    await writeBatch("ok", {
      version: "1.0.0",
      batchId: "ok",
      createdAt: "2026-04-26T00:00:00.000Z",
      granularity: "medium",
      pages: [
        {
          title: "OK",
          filename: "OK.md",
          aliases: [],
          type: "concept",
          source: "ok.pdf",
          sourcePages: "p. 1",
          tags: [],
          links: [],
          createdAt: "2026-04-26T00:00:00.000Z",
        },
      ],
    });

    const { GET } = await import("@/app/api/search-index/route");
    const res = await GET();
    const json = await res.json();
    expect(json.records).toHaveLength(1);
    expect(json.records[0].batchId).toBe("ok");
  });
});
