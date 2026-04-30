import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const ORIGINAL_ENV = process.env.WIKI_STAGING_DIR;
let stagingDir: string;

beforeEach(async () => {
  stagingDir = await mkdtemp(path.join(tmpdir(), "wikigen-test-"));
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

describe("GET /api/batches", () => {
  it("returns [] when staging dir doesn't exist", async () => {
    await rm(stagingDir, { recursive: true, force: true });
    const { GET } = await import("@/app/api/batches/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual([]);
  });

  it("lists batches sorted by createdAt desc", async () => {
    await writeBatch("a", {
      version: "1.0.0",
      batchId: "a",
      createdAt: "2026-04-25T00:00:00.000Z",
      granularity: "medium",
      pages: [
        {
          title: "T1",
          filename: "T1.md",
          aliases: [],
          type: "concept",
          source: "a.pdf",
          sourcePages: "p.1",
          tags: [],
          links: ["X"],
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
          title: "T2",
          filename: "T2.md",
          aliases: [],
          type: "concept",
          source: "b.pdf",
          sourcePages: "p.2",
          tags: [],
          links: [],
          createdAt: "2026-04-27T00:00:00.000Z",
        },
        {
          title: "T3",
          filename: "T3.md",
          aliases: [],
          type: "concept",
          source: "c.pdf",
          sourcePages: "p.3",
          tags: [],
          links: ["X", "Y"],
          createdAt: "2026-04-27T00:00:00.000Z",
        },
      ],
    });

    const { GET } = await import("@/app/api/batches/route");
    const res = await GET();
    const json = await res.json();
    expect(json).toHaveLength(2);
    expect(json[0].batchId).toBe("b");
    expect(json[0].pageCount).toBe(2);
    expect(json[0].linkCount).toBe(2);
    expect(json[0].sources).toEqual(["b.pdf", "c.pdf"]);
    expect(json[1].batchId).toBe("a");
    expect(json[1].pageCount).toBe(1);
    expect(json[1].linkCount).toBe(1);
  });

  it("skips batches without a valid manifest", async () => {
    await mkdir(path.join(stagingDir, "broken"), { recursive: true });
    await writeFile(
      path.join(stagingDir, "broken", "manifest.json"),
      "{ not json",
      "utf8",
    );
    await writeBatch("ok", {
      version: "1.0.0",
      batchId: "ok",
      createdAt: "2026-04-26T00:00:00.000Z",
      granularity: "medium",
      pages: [],
    });

    const { GET } = await import("@/app/api/batches/route");
    const res = await GET();
    const json = await res.json();
    expect(json).toHaveLength(1);
    expect(json[0].batchId).toBe("ok");
  });
});
