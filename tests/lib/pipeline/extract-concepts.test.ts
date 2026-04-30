import { describe, it, expect, vi } from "vitest";
import { extractConcepts } from "@/lib/pipeline/extract-concepts";
import type { LlmClient, ToolCallRequest } from "@/lib/llm";

type CallToolFn = (req: ToolCallRequest) => Promise<unknown>;

function makeClient(callTool: CallToolFn): LlmClient {
  return {
    callTool,
    vision: vi.fn(async () => ""),
  };
}

describe("extractConcepts", () => {
  it("invokes the model and returns parsed pages", async () => {
    const callTool = vi.fn<CallToolFn>(async () => ({
      pages: [
        {
          title: "Backpropagation",
          body: "Body text. See [[Gradient Descent]].",
          sourcePages: "pp. 1-2",
          aliases: ["Backprop"],
          links: ["Gradient Descent"],
        },
      ],
    }));

    const result = await extractConcepts({
      client: makeClient(callTool),
      model: "claude-sonnet-4-6",
      pdfText: "page 1 ... page 2 ...",
      vaultTitles: ["Gradient Descent", "Welcome"],
      granularity: "medium",
    });

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].title).toBe("Backpropagation");
    expect(result.pages[0].aliases).toEqual(["Backprop"]);
    const arg = callTool.mock.calls[0]?.[0];
    expect(arg).toBeDefined();
    if (!arg) throw new Error("expected callTool to have been invoked");
    expect(arg.model).toBe("claude-sonnet-4-6");
    expect(arg.tool.name).toBe("submit_pages");
    expect(arg.cacheableContext).toContain("Gradient Descent");
    expect(arg.body).toContain("medium");
  });

  it("retries once on schema-invalid output, then succeeds", async () => {
    const callTool = vi
      .fn<CallToolFn>()
      .mockResolvedValueOnce({ wrong: "shape" })
      .mockResolvedValueOnce({
        pages: [
          {
            title: "T",
            body: "B",
            sourcePages: "p.1",
            aliases: [],
            links: [],
          },
        ],
      });

    const result = await extractConcepts({
      client: makeClient(callTool),
      model: "claude-sonnet-4-6",
      pdfText: "x",
      vaultTitles: [],
      granularity: "medium",
    });

    expect(callTool).toHaveBeenCalledTimes(2);
    expect(result.pages).toHaveLength(1);
    const secondArg = callTool.mock.calls[1]?.[0];
    expect(secondArg).toBeDefined();
    if (!secondArg)
      throw new Error("expected callTool to have been invoked twice");
    expect(secondArg.systemPrompt).toContain(
      "Previous attempt failed validation",
    );
  });

  it("throws after a second schema failure", async () => {
    const callTool = vi.fn<CallToolFn>(async () => ({ nope: 1 }));
    await expect(
      extractConcepts({
        client: makeClient(callTool),
        model: "claude-sonnet-4-6",
        pdfText: "x",
        vaultTitles: [],
        granularity: "medium",
      }),
    ).rejects.toThrow();
  });
});
