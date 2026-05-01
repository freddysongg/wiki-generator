import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  extractConcepts,
  CHUNK_THRESHOLD_CHARS,
} from "@/lib/pipeline/extract-concepts";
import type { LlmClient, ToolCallRequest } from "@/lib/llm";

type CallToolFn = (req: ToolCallRequest) => Promise<unknown>;

const CHUNK_TARGET_CHARS = 150_000;

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function makeClient(callTool: CallToolFn): LlmClient {
  return {
    callTool,
    vision: vi.fn(async () => ""),
  };
}

function buildPagedText(pageCount: number, charsPerPage: number): string {
  const filler = "x".repeat(charsPerPage);
  const sections: string[] = [];
  for (let i = 1; i <= pageCount; i++) {
    sections.push(`[Page ${i}]\n${filler}`);
  }
  return sections.join("\n\n");
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
    expect(arg.body).not.toContain("part 1 of");
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

  describe("chunking", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it("produces a single call when text is below threshold", async () => {
      const callTool = vi.fn<CallToolFn>(async () => ({
        pages: [
          {
            title: "Solo",
            body: "B",
            sourcePages: "p.1",
            aliases: [],
            links: [],
          },
        ],
      }));

      const text = buildPagedText(2, 100);
      expect(text.length).toBeLessThanOrEqual(CHUNK_THRESHOLD_CHARS);

      await extractConcepts({
        client: makeClient(callTool),
        model: "m",
        pdfText: text,
        vaultTitles: [],
        granularity: "medium",
      });
      expect(callTool).toHaveBeenCalledTimes(1);
    });

    it("splits oversize input on [Page N] boundaries within target size", async () => {
      const callTool = vi.fn<CallToolFn>(async (req) => ({
        pages: [
          {
            title: `Page-${req.body.length}`,
            body: "B",
            sourcePages: "p.1",
            aliases: [],
            links: [],
          },
        ],
      }));

      const pdfText = buildPagedText(6, 50_000);
      expect(pdfText.length).toBeGreaterThan(CHUNK_THRESHOLD_CHARS);

      await extractConcepts({
        client: makeClient(callTool),
        model: "m",
        pdfText,
        vaultTitles: [],
        granularity: "medium",
      });

      expect(callTool.mock.calls.length).toBeGreaterThan(1);
      for (const call of callTool.mock.calls) {
        const sentBody = call[0].body;
        const pageMatches = sentBody.match(/\[Page \d+\]/g);
        expect(pageMatches).not.toBeNull();
        const pdfTextStart =
          sentBody.indexOf("PDF text:\n") + "PDF text:\n".length;
        const chunkPayload = sentBody.slice(pdfTextStart);
        expect(chunkPayload.length).toBeLessThanOrEqual(
          CHUNK_TARGET_CHARS + 50_000,
        );
        expect(chunkPayload.startsWith("[Page ")).toBe(true);
      }
      expect(callTool.mock.calls[0][0].body).toContain("part 1 of");
    });

    it("merges chunk results, with later chunks overriding earlier titles", async () => {
      const firstResponse = {
        pages: [
          {
            title: "A",
            body: "first-A",
            sourcePages: "p.1",
            aliases: ["a-alias"],
            links: ["L1"],
          },
          {
            title: "B",
            body: "first-B",
            sourcePages: "p.2",
            aliases: [],
            links: ["L1", "L1"],
          },
        ],
      };
      const secondResponse = {
        pages: [
          {
            title: "A",
            body: "second-A-longer",
            sourcePages: "p.3",
            aliases: ["a-alias", "a-alias"],
            links: ["L2"],
          },
          {
            title: "C",
            body: "first-C",
            sourcePages: "p.4",
            aliases: [],
            links: [],
          },
        ],
      };
      const fillerResponse = {
        pages: [
          {
            title: "FILLER",
            body: "filler",
            sourcePages: "p.x",
            aliases: [],
            links: [],
          },
        ],
      };
      let callIndex = 0;
      const callTool = vi.fn<CallToolFn>(async () => {
        callIndex += 1;
        if (callIndex === 1) return firstResponse;
        if (callIndex === 2) return secondResponse;
        return fillerResponse;
      });

      const pdfText = buildPagedText(2, 130_000);
      expect(pdfText.length).toBeGreaterThan(CHUNK_THRESHOLD_CHARS);

      const result = await extractConcepts({
        client: makeClient(callTool),
        model: "m",
        pdfText,
        vaultTitles: ["seed-title"],
        granularity: "medium",
      });

      expect(callTool).toHaveBeenCalledTimes(2);
      const titles = result.pages.map((p) => p.title).sort();
      expect(titles).toEqual(["A", "B", "C"]);
      const pageA = result.pages.find((p) => p.title === "A");
      expect(pageA?.body).toBe("second-A-longer");
      expect(pageA?.aliases).toEqual(["a-alias"]);
      const pageB = result.pages.find((p) => p.title === "B");
      expect(pageB?.links).toEqual(["L1"]);

      const secondCallContext =
        callTool.mock.calls[1][0].cacheableContext ?? "";
      expect(secondCallContext).toContain("seed-title");
      expect(secondCallContext).toContain("A");
      expect(secondCallContext).toContain("B");
    });

    it("retries on a retryable transport error then completes", async () => {
      let attempts = 0;
      const callTool = vi.fn<CallToolFn>(async () => {
        attempts += 1;
        if (attempts === 1) throw new HttpError(429, "rate limit exceeded");
        return {
          pages: [
            {
              title: "OK",
              body: "B",
              sourcePages: "p.1",
              aliases: [],
              links: [],
            },
          ],
        };
      });

      const promise = extractConcepts({
        client: makeClient(callTool),
        model: "m",
        pdfText: "short text",
        vaultTitles: [],
        granularity: "medium",
      });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(callTool).toHaveBeenCalledTimes(2);
      expect(result.pages[0].title).toBe("OK");
    });
  });
});
