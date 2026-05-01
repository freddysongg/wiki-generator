import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let staging: string;

beforeEach(async () => {
  staging = await mkdtemp(path.join(tmpdir(), "stg-"));
  process.env.WIKI_STAGING_DIR = staging;
});
afterEach(async () => {
  await rm(staging, { recursive: true, force: true });
  delete process.env.WIKI_STAGING_DIR;
});

describe("GET /api/manifest/[batchId]", () => {
  it("returns 200 with the manifest body when the file exists", async () => {
    await mkdir(path.join(staging, "b1"));
    const manifest = {
      version: "1.0.0",
      batchId: "b1",
      createdAt: "2026-04-27T00:00:00.000Z",
      granularity: "medium",
      pages: [],
    };
    await writeFile(
      path.join(staging, "b1", "manifest.json"),
      JSON.stringify(manifest),
    );
    const { GET } = await import("@/app/api/manifest/[batchId]/route");
    const req = new Request("http://localhost/api/manifest/b1");
    const res = await GET(req, { params: Promise.resolve({ batchId: "b1" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const json = (await res.json()) as { batchId: string; version: string };
    expect(json.batchId).toBe("b1");
    expect(json.version).toBe("1.0.0");
  });

  it("returns 404 when the manifest does not exist", async () => {
    const { GET } = await import("@/app/api/manifest/[batchId]/route");
    const req = new Request("http://localhost/api/manifest/missing");
    const res = await GET(req, {
      params: Promise.resolve({ batchId: "missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("rejects an invalid batchId with 400", async () => {
    const { GET } = await import("@/app/api/manifest/[batchId]/route");
    const req = new Request("http://localhost/api/manifest/..%2Fetc");
    const res = await GET(req, {
      params: Promise.resolve({ batchId: "../etc" }),
    });
    expect(res.status).toBe(400);
  });

  it("returns paginated summary pages with summary=true", async () => {
    await mkdir(path.join(staging, "bp"));
    const pages = Array.from({ length: 250 }, (_, i) => ({
      title: `Concept ${i}`,
      filename: `Concept-${i}.md`,
      aliases: [`c${i}`],
      type: "concept",
      source: "x.pdf",
      sourcePages: `p. ${i}`,
      tags: [],
      links: ["something-else", "another-thing"],
      createdAt: "2026-04-27T00:00:00.000Z",
    }));
    const manifest = {
      version: "1.0.0",
      batchId: "bp",
      createdAt: "2026-04-27T00:00:00.000Z",
      granularity: "medium",
      pages,
    };
    await writeFile(
      path.join(staging, "bp", "manifest.json"),
      JSON.stringify(manifest),
    );
    const { GET } = await import("@/app/api/manifest/[batchId]/route");
    const req = new Request(
      "http://localhost/api/manifest/bp?summary=true&offset=100&limit=50",
    );
    const res = await GET(req, { params: Promise.resolve({ batchId: "bp" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("max-age=43200");
    const json = (await res.json()) as {
      total: number;
      offset: number;
      limit: number;
      pages: Array<{ title: string; filename: string; aliases: string[] }>;
    };
    expect(json.total).toBe(250);
    expect(json.offset).toBe(100);
    expect(json.limit).toBe(50);
    expect(json.pages).toHaveLength(50);
    expect(json.pages[0]).toMatchObject({
      title: "Concept 100",
      filename: "Concept-100.md",
      aliases: ["c100"],
    });
    expect(json.pages[0]).not.toHaveProperty("links");
    expect(json.pages[0]).not.toHaveProperty("tags");
  });

  it("returns full manifest with cache header when no summary param", async () => {
    await mkdir(path.join(staging, "bf"));
    const manifest = {
      version: "1.0.0",
      batchId: "bf",
      createdAt: "2026-04-27T00:00:00.000Z",
      granularity: "medium",
      pages: [],
    };
    await writeFile(
      path.join(staging, "bf", "manifest.json"),
      JSON.stringify(manifest),
    );
    const { GET } = await import("@/app/api/manifest/[batchId]/route");
    const req = new Request("http://localhost/api/manifest/bf");
    const res = await GET(req, { params: Promise.resolve({ batchId: "bf" }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("max-age=43200");
    const json = (await res.json()) as { version: string };
    expect(json.version).toBe("1.0.0");
  });
});
