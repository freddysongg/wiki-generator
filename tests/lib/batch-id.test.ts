import { describe, it, expect } from "vitest";
import { isValidBatchId } from "@/lib/batch-id";

describe("isValidBatchId", () => {
  it("accepts iso-timestamp + uuid8 batches", () => {
    expect(isValidBatchId("2026-04-26T22-30-15-123Z-a1b2c3d4")).toBe(true);
  });
  it("rejects empty string", () => {
    expect(isValidBatchId("")).toBe(false);
  });
  it("rejects path-traversal segments", () => {
    expect(isValidBatchId("../etc")).toBe(false);
    expect(isValidBatchId("..")).toBe(false);
    expect(isValidBatchId("a/b")).toBe(false);
    expect(isValidBatchId("a\\b")).toBe(false);
  });
  it("rejects null byte", () => {
    expect(isValidBatchId("a\x00b")).toBe(false);
  });
  it("rejects very long ids", () => {
    expect(isValidBatchId("a".repeat(200))).toBe(false);
  });
});
