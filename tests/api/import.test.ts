import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let staging: string;
let vault: string;

beforeEach(async () => {
  staging = await mkdtemp(path.join(tmpdir(), "stg-"));
  vault = await mkdtemp(path.join(tmpdir(), "vlt-"));
  vi.resetModules();
  vi.doMock("@/lib/config", () => ({
    loadConfig: () => ({
      anthropicApiKey: "k",
      vaultPath: vault,
      wikiSubfolder: "wiki",
      extractionModel: "x",
      ocrModel: "y",
      maxConcurrentPdfs: 1,
      ocrTextThreshold: 100,
    }),
  }));
  vi.doMock("@/lib/pipeline/import-to-vault", async () => {
    const actual = await vi.importActual<typeof import("@/lib/pipeline/import-to-vault")>(
      "@/lib/pipeline/import-to-vault",
    );
    return actual;
  });
  process.env.WIKI_STAGING_DIR = staging;
});
afterEach(async () => {
  await rm(staging, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
  delete process.env.WIKI_STAGING_DIR;
});

describe("POST /api/import/[batchId]", () => {
  it("imports staging files into the vault", async () => {
    await mkdir(path.join(staging, "b1"));
    await writeFile(path.join(staging, "b1", "Note.md"), "x");
    const { POST } = await import("@/app/api/import/[batchId]/route");
    const req = new Request(`http://localhost/api/import/b1`, { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ batchId: "b1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.imported).toBe(1);
    const files = await readdir(path.join(vault, "wiki"));
    expect(files).toEqual(["Note.md"]);
  });

  it("returns 404 if batch directory missing", async () => {
    const { POST } = await import("@/app/api/import/[batchId]/route");
    const req = new Request(`http://localhost/api/import/missing`, { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ batchId: "missing" }) });
    expect(res.status).toBe(404);
  });

  it("rejects path-traversal batchId with 400", async () => {
    const { POST } = await import("@/app/api/import/[batchId]/route");
    const req = new Request(`http://localhost/api/import/..%2Fetc`, { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ batchId: "../etc" }) });
    expect(res.status).toBe(400);
  });
});
