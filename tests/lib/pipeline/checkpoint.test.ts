import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  CHECKPOINT_FILENAME,
  loadCheckpoint,
  markPdfDone,
  type CheckpointEntry,
} from "@/lib/pipeline/checkpoint";

let staging: string;
let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  staging = await mkdtemp(path.join(tmpdir(), "ckpt-"));
  stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});
afterEach(async () => {
  await rm(staging, { recursive: true, force: true });
  stderrSpy.mockRestore();
});

const sampleEntry = (
  overrides: Partial<CheckpointEntry> = {},
): CheckpointEntry => ({
  pdfId: "pdf-1",
  ok: true,
  pagesWritten: 4,
  finishedAt: "2026-04-29T00:00:00.000Z",
  ...overrides,
});

describe("checkpoint", () => {
  it("returns null when no checkpoint file exists", async () => {
    const result = await loadCheckpoint(staging, "missing");
    expect(result).toBeNull();
  });

  it("round-trips a written entry", async () => {
    const entry = sampleEntry();
    await markPdfDone(staging, "b1", entry);
    const loaded = await loadCheckpoint(staging, "b1");
    expect(loaded).not.toBeNull();
    expect(loaded?.batchId).toBe("b1");
    expect(loaded?.entries).toHaveLength(1);
    expect(loaded?.entries[0]).toEqual(entry);
    const filePath = path.join(staging, "b1", CHECKPOINT_FILENAME);
    const raw = await readFile(filePath, "utf8");
    expect(raw).toContain("pdf-1");
  });

  it("replaces an existing entry by pdfId rather than duplicating", async () => {
    await markPdfDone(staging, "b1", sampleEntry({ pagesWritten: 1 }));
    await markPdfDone(staging, "b1", sampleEntry({ pagesWritten: 5 }));
    const loaded = await loadCheckpoint(staging, "b1");
    expect(loaded?.entries).toHaveLength(1);
    expect(loaded?.entries[0]?.pagesWritten).toBe(5);
  });

  it("treats a corrupt file as no checkpoint and logs to stderr", async () => {
    const dir = path.join(staging, "bad");
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, CHECKPOINT_FILENAME),
      "{not valid json",
      "utf8",
    );
    const loaded = await loadCheckpoint(staging, "bad");
    expect(loaded).toBeNull();
    expect(stderrSpy).toHaveBeenCalled();
  });

  it("treats a schema-invalid file as no checkpoint", async () => {
    const dir = path.join(staging, "schema");
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, CHECKPOINT_FILENAME),
      JSON.stringify({ wrongShape: true }),
      "utf8",
    );
    const loaded = await loadCheckpoint(staging, "schema");
    expect(loaded).toBeNull();
    expect(stderrSpy).toHaveBeenCalled();
  });

  it("serializes concurrent writes so no entries are lost", async () => {
    const writes: Promise<void>[] = [];
    for (let i = 0; i < 20; i++) {
      writes.push(
        markPdfDone(
          staging,
          "bconc",
          sampleEntry({
            pdfId: `pdf-${i}`,
            pagesWritten: i,
          }),
        ),
      );
    }
    await Promise.all(writes);
    const loaded = await loadCheckpoint(staging, "bconc");
    expect(loaded?.entries).toHaveLength(20);
    const ids = new Set(loaded?.entries.map((e) => e.pdfId));
    for (let i = 0; i < 20; i++) {
      expect(ids.has(`pdf-${i}`)).toBe(true);
    }
  });
});
