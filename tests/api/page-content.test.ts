import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let staging: string;
const ORIGINAL_STAGING = process.env.WIKI_STAGING_DIR;

beforeEach(async () => {
  staging = await mkdtemp(path.join(tmpdir(), "stg-"));
  process.env.WIKI_STAGING_DIR = staging;
});

afterEach(async () => {
  await rm(staging, { recursive: true, force: true });
  if (ORIGINAL_STAGING === undefined) {
    delete process.env.WIKI_STAGING_DIR;
  } else {
    process.env.WIKI_STAGING_DIR = ORIGINAL_STAGING;
  }
});

const VALID_BATCH_ID = "2026-04-29-batch-1";
const VALID_FILENAME = "Backpropagation.md";

async function seedBatch(batchId: string): Promise<void> {
  const dir = path.join(staging, batchId);
  await mkdir(dir, { recursive: true });
  const manifest = {
    version: "1.0.0",
    batchId,
    createdAt: "2026-04-29T00:00:00.000Z",
    granularity: "medium",
    pages: [
      {
        title: "Backpropagation",
        filename: VALID_FILENAME,
        aliases: [],
        type: "concept",
        source: "alpha.pdf",
        sourcePages: "pp. 14-22",
        tags: ["wiki-generator"],
        links: [],
        createdAt: "2026-04-29T00:00:00.000Z",
      },
    ],
  };
  await writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify(manifest),
    "utf8",
  );
  const md = [
    "---",
    'title: "Backpropagation"',
    'source: "alpha.pdf"',
    "---",
    "",
    "# Backpropagation",
    "",
    "Body content here.",
    "",
    "---",
    "*Source: alpha.pdf, pp. 14-22*",
    "",
  ].join("\n");
  await writeFile(path.join(dir, VALID_FILENAME), md, "utf8");
}

describe("GET /api/batches/:batchId/pages/:filename", () => {
  it("returns cleaned markdown for a valid request", async () => {
    await seedBatch(VALID_BATCH_ID);
    const { GET } = await import(
      "@/app/api/batches/[batchId]/pages/[filename]/route"
    );
    const res = await GET(
      new Request(
        `http://localhost/api/batches/${VALID_BATCH_ID}/pages/${encodeURIComponent(VALID_FILENAME)}`,
      ),
      {
        params: Promise.resolve({
          batchId: VALID_BATCH_ID,
          filename: encodeURIComponent(VALID_FILENAME),
        }),
      },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    const body = await res.text();
    expect(body).toBe("Body content here.");
  });

  it("returns 400 on invalid batch id", async () => {
    const { GET } = await import(
      "@/app/api/batches/[batchId]/pages/[filename]/route"
    );
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({
        batchId: "../etc",
        filename: encodeURIComponent("anything.md"),
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when manifest is missing", async () => {
    const { GET } = await import(
      "@/app/api/batches/[batchId]/pages/[filename]/route"
    );
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({
        batchId: "nonexistent-batch",
        filename: encodeURIComponent("anything.md"),
      }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when filename is not in manifest allowlist", async () => {
    await seedBatch(VALID_BATCH_ID);
    const { GET } = await import(
      "@/app/api/batches/[batchId]/pages/[filename]/route"
    );
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({
        batchId: VALID_BATCH_ID,
        filename: encodeURIComponent("../../etc/passwd"),
      }),
    });
    expect(res.status).toBe(404);
  });
});
