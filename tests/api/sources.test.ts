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
const VALID_SOURCE = "alpha.pdf";
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

async function seedBatch(
  batchId: string,
  options: { writePdf: boolean; sourceInManifest?: string } = { writePdf: true },
): Promise<void> {
  const dir = path.join(staging, batchId);
  await mkdir(path.join(dir, "sources"), { recursive: true });
  const sourceField = options.sourceInManifest ?? VALID_SOURCE;
  const manifest = {
    version: "1.0.0",
    batchId,
    createdAt: "2026-04-29T00:00:00.000Z",
    granularity: "medium",
    pages: [
      {
        title: "Backpropagation",
        filename: "Backpropagation.md",
        aliases: [],
        type: "concept",
        source: sourceField,
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
  if (options.writePdf) {
    await writeFile(path.join(dir, "sources", VALID_SOURCE), PDF_BYTES);
  }
}

describe("GET /api/batches/:batchId/sources/:filename", () => {
  it("returns pdf bytes for a valid request", async () => {
    await seedBatch(VALID_BATCH_ID);
    const { GET } = await import(
      "@/app/api/batches/[batchId]/sources/[filename]/route"
    );
    const res = await GET(
      new Request(
        `http://localhost/api/batches/${VALID_BATCH_ID}/sources/${encodeURIComponent(VALID_SOURCE)}`,
      ),
      {
        params: Promise.resolve({
          batchId: VALID_BATCH_ID,
          filename: VALID_SOURCE,
        }),
      },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const buf = new Uint8Array(await res.arrayBuffer());
    expect(buf).toEqual(PDF_BYTES);
  });

  it("returns 400 on invalid batch id", async () => {
    const { GET } = await import(
      "@/app/api/batches/[batchId]/sources/[filename]/route"
    );
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({
        batchId: "../etc",
        filename: "anything.pdf",
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when filename contains a path separator", async () => {
    const { GET } = await import(
      "@/app/api/batches/[batchId]/sources/[filename]/route"
    );
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({
        batchId: VALID_BATCH_ID,
        filename: "../../etc/passwd",
      }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when manifest is missing", async () => {
    const { GET } = await import(
      "@/app/api/batches/[batchId]/sources/[filename]/route"
    );
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({
        batchId: "nonexistent-batch",
        filename: "anything.pdf",
      }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when filename is not referenced by the manifest", async () => {
    await seedBatch(VALID_BATCH_ID, {
      writePdf: true,
      sourceInManifest: "different.pdf",
    });
    const { GET } = await import(
      "@/app/api/batches/[batchId]/sources/[filename]/route"
    );
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({
        batchId: VALID_BATCH_ID,
        filename: VALID_SOURCE,
      }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when the pdf file is missing on disk", async () => {
    await seedBatch(VALID_BATCH_ID, { writePdf: false });
    const { GET } = await import(
      "@/app/api/batches/[batchId]/sources/[filename]/route"
    );
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({
        batchId: VALID_BATCH_ID,
        filename: VALID_SOURCE,
      }),
    });
    expect(res.status).toBe(404);
  });
});
