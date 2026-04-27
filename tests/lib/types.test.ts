import { describe, it, expect } from "vitest";
import type { Stage, PdfStatus, BatchState, Granularity, GeneratedPage, ExtractionResult, BatchEvent } from "@/lib/types";

describe("types", () => {
  it("exposes the Stage union", () => {
    const stages: Stage[] = ["queued", "parsing", "ocr", "extracting", "writing", "done", "failed"];
    expect(stages).toHaveLength(7);
  });

  it("Granularity is a tagged union of three values", () => {
    const values: Granularity[] = ["coarse", "medium", "fine"];
    expect(values).toEqual(["coarse", "medium", "fine"]);
  });

  it("BatchEvent discriminator covers status, page, and complete events", () => {
    const events: BatchEvent[] = [
      { type: "status", batchId: "b", pdfId: "p", stage: "queued", pagesGenerated: 0 },
      { type: "page", batchId: "b", pdfId: "p", title: "X" },
      { type: "complete", batchId: "b", totals: { pages: 0, links: 0, failed: 0 } },
    ];
    expect(events).toHaveLength(3);
  });
});
