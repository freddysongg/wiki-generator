import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderPdfPageToPng } from "@/lib/pipeline/render-page";

describe("renderPdfPageToPng", () => {
  it("returns a PNG buffer for a given page", async () => {
    const data = await readFile(
      path.join(process.cwd(), "tests/fixtures/hello.pdf"),
    );
    const png = await renderPdfPageToPng(new Uint8Array(data), 1, {
      maxWidth: 1024,
    });
    expect(png).toBeInstanceOf(Uint8Array);
    expect(png.byteLength).toBeGreaterThan(100);
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);
  });
});
