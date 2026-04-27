import { describe, it, expect, vi } from "vitest";
import { extractConcepts } from "@/lib/pipeline/extract-concepts";

describe("extractConcepts", () => {
  it("invokes the model with cached system prompt and returns parsed pages", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "submit_pages",
          input: {
            pages: [
              {
                title: "Backpropagation",
                body: "Body text. See [[Gradient Descent]].",
                sourcePages: "pp. 1-2",
                links: ["Gradient Descent"],
              },
            ],
          },
        },
      ],
      stop_reason: "tool_use",
    });
    const client = { messages: { create } };

    const result = await extractConcepts({
      client: client as unknown as Parameters<typeof extractConcepts>[0]["client"],
      model: "claude-sonnet-4-6",
      pdfText: "page 1 ... page 2 ...",
      vaultTitles: ["Gradient Descent", "Welcome"],
      granularity: "medium",
    });

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].title).toBe("Backpropagation");
    const call = create.mock.calls[0][0];
    expect(call.model).toBe("claude-sonnet-4-6");
    expect(call.tool_choice).toEqual({ type: "tool", name: "submit_pages" });
    expect(Array.isArray(call.system)).toBe(true);
    const systemBlock = call.system[0];
    expect(systemBlock.cache_control).toEqual({ type: "ephemeral" });
  });

  it("retries once on schema-invalid output, then succeeds", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        content: [
          { type: "tool_use", name: "submit_pages", input: { wrong: "shape" } },
        ],
        stop_reason: "tool_use",
      })
      .mockResolvedValueOnce({
        content: [
          {
            type: "tool_use",
            name: "submit_pages",
            input: {
              pages: [
                { title: "T", body: "B", sourcePages: "p.1", links: [] },
              ],
            },
          },
        ],
        stop_reason: "tool_use",
      });
    const client = { messages: { create } };

    const result = await extractConcepts({
      client: client as unknown as Parameters<typeof extractConcepts>[0]["client"],
      model: "claude-sonnet-4-6",
      pdfText: "x",
      vaultTitles: [],
      granularity: "medium",
    });

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.pages).toHaveLength(1);
  });

  it("throws after a second schema failure", async () => {
    const bad = {
      content: [{ type: "tool_use", name: "submit_pages", input: { nope: 1 } }],
      stop_reason: "tool_use",
    };
    const create = vi.fn().mockResolvedValue(bad);
    const client = { messages: { create } };
    await expect(
      extractConcepts({
        client: client as unknown as Parameters<typeof extractConcepts>[0]["client"],
        model: "claude-sonnet-4-6",
        pdfText: "x",
        vaultTitles: [],
        granularity: "medium",
      }),
    ).rejects.toThrow();
  });
});
