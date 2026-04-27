import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parsePdf } from "@/lib/pipeline/parse-pdf";

describe("parsePdf", () => {
  it("returns one entry per page with extracted text", async () => {
    const data = await readFile(
      path.join(process.cwd(), "tests/fixtures/hello.pdf"),
    );
    const pages = await parsePdf(new Uint8Array(data));
    expect(pages).toHaveLength(2);
    expect(pages[0].text).toContain("Page one");
    expect(pages[1].text).toContain("Page two");
    expect(pages[0].pageNumber).toBe(1);
    expect(pages[1].pageNumber).toBe(2);
  });

  it("flags pages as image-only when text length is below threshold", async () => {
    const data = await readFile(
      path.join(process.cwd(), "tests/fixtures/hello.pdf"),
    );
    const pages = await parsePdf(new Uint8Array(data), { textThreshold: 1000 });
    for (const page of pages) {
      expect(page.kind).toBe("image");
    }
  });
});
