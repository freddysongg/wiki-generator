import { describe, it, expect, vi } from "vitest";
import { pickGranularity } from "@/lib/pipeline/pick-granularity";
import type { LlmClient, ToolCallRequest } from "@/lib/llm";

type CallToolFn = (req: ToolCallRequest) => Promise<unknown>;

function makeClient(callTool: CallToolFn): LlmClient {
  return {
    callTool,
    vision: vi.fn(async () => ""),
  };
}

describe("pickGranularity", () => {
  it("returns coarse / medium / fine when the model picks it", async () => {
    for (const choice of ["coarse", "medium", "fine"] as const) {
      const callTool = vi.fn<CallToolFn>(async () => ({
        choice,
        reason: "test",
      }));
      const result = await pickGranularity({
        client: makeClient(callTool),
        model: "claude-haiku-4-5-20251001",
        pdfText: "x".repeat(2000),
        pageCount: 4,
      });
      expect(result).toBe(choice);
    }
  });

  it("sends a sample with first 3000 + last 500 chars when text is long", async () => {
    const head = "H".repeat(3000);
    const tail = "T".repeat(500);
    const middle = "M".repeat(2000);
    const callTool = vi.fn<CallToolFn>(async () => ({
      choice: "medium",
      reason: "test",
    }));
    await pickGranularity({
      client: makeClient(callTool),
      model: "claude-haiku-4-5-20251001",
      pdfText: head + middle + tail,
      pageCount: 12,
    });
    const req = callTool.mock.calls[0]?.[0];
    expect(req).toBeDefined();
    if (!req) throw new Error("expected callTool call");
    expect(req.body).toContain(head);
    expect(req.body).toContain(tail);
    expect(req.body).not.toContain(middle);
    expect(req.body).toContain("[…]");
    expect(req.body).toContain("Page count: 12");
    expect(req.systemPrompt).toContain(
      "You MUST call the pick_granularity tool",
    );
    expect(req.systemPrompt).toContain(
      "If the document is ambiguous between two levels, choose the lower one.",
    );
  });

  it("sends the document verbatim when shorter than the threshold", async () => {
    const callTool = vi.fn<CallToolFn>(async () => ({
      choice: "coarse",
      reason: "short",
    }));
    const text = "Just a small doc. Three sentences total. End.";
    await pickGranularity({
      client: makeClient(callTool),
      model: "claude-haiku-4-5-20251001",
      pdfText: text,
      pageCount: 1,
    });
    const req = callTool.mock.calls[0]?.[0];
    expect(req).toBeDefined();
    if (!req) throw new Error("expected callTool call");
    expect(req.body).toContain(text);
    expect(req.body).not.toContain("[…]");
  });

  it("retries once on schema-invalid output, then succeeds", async () => {
    const callTool = vi
      .fn<CallToolFn>()
      .mockResolvedValueOnce({ wrong: "shape" })
      .mockResolvedValueOnce({ choice: "fine", reason: "long" });
    const result = await pickGranularity({
      client: makeClient(callTool),
      model: "claude-haiku-4-5-20251001",
      pdfText: "x",
      pageCount: 200,
    });
    expect(result).toBe("fine");
    expect(callTool).toHaveBeenCalledTimes(2);
  });

  it("throws after a second schema failure", async () => {
    const callTool = vi.fn<CallToolFn>(async () => ({ nope: 1 }));
    await expect(
      pickGranularity({
        client: makeClient(callTool),
        model: "claude-haiku-4-5-20251001",
        pdfText: "x",
        pageCount: 1,
      }),
    ).rejects.toThrow();
  });

  it("rejects out-of-enum choice values", async () => {
    const callTool = vi.fn<CallToolFn>(async () => ({
      choice: "extra-fine",
      reason: "made up",
    }));
    await expect(
      pickGranularity({
        client: makeClient(callTool),
        model: "claude-haiku-4-5-20251001",
        pdfText: "x",
        pageCount: 1,
      }),
    ).rejects.toThrow();
  });
});
