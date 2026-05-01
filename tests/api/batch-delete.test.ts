import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, mkdir, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const ORIGINAL_ENV = process.env.WIKI_STAGING_DIR;
let stagingDir: string;

beforeEach(async () => {
  stagingDir = await mkdtemp(path.join(tmpdir(), "wikigen-delete-test-"));
  process.env.WIKI_STAGING_DIR = stagingDir;
});

afterEach(async () => {
  await rm(stagingDir, { recursive: true, force: true });
  if (ORIGINAL_ENV === undefined) delete process.env.WIKI_STAGING_DIR;
  else process.env.WIKI_STAGING_DIR = ORIGINAL_ENV;
});

interface RouteContext {
  params: Promise<{ batchId: string }>;
}

function buildContext(batchId: string): RouteContext {
  return { params: Promise.resolve({ batchId }) };
}

describe("DELETE /api/batches/[batchId]", () => {
  it("removes the batch directory", async () => {
    const batchId = "todelete";
    const batchDir = path.join(stagingDir, batchId);
    await mkdir(batchDir, { recursive: true });
    await writeFile(path.join(batchDir, "manifest.json"), "{}", "utf8");

    const { DELETE } = await import("@/app/api/batches/[batchId]/route");
    const res = await DELETE(new Request("http://localhost"), buildContext(batchId));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ deleted: batchId });

    await expect(stat(batchDir)).rejects.toThrow();
  });

  it("rejects invalid batch ids", async () => {
    const { DELETE } = await import("@/app/api/batches/[batchId]/route");
    const res = await DELETE(
      new Request("http://localhost"),
      buildContext("../escape"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 404 when the batch is missing", async () => {
    const { DELETE } = await import("@/app/api/batches/[batchId]/route");
    const res = await DELETE(
      new Request("http://localhost"),
      buildContext("nope"),
    );
    expect(res.status).toBe(404);
  });
});
