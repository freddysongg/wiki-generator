import { describe, it, expect, vi } from "vitest";
import { ocrPageImage } from "@/lib/pipeline/ocr-fallback";
import type { LlmClient, VisionRequest } from "@/lib/llm";

type VisionFn = (req: VisionRequest) => Promise<string>;

describe("ocrPageImage", () => {
  it("forwards the image and returns the trimmed text", async () => {
    const vision = vi.fn<VisionFn>(async () => "transcribed page contents");
    const client: LlmClient = { callTool: vi.fn(), vision };
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

    const text = await ocrPageImage(
      { client, model: "claude-haiku-4-5-20251001" },
      png,
    );

    expect(text).toBe("transcribed page contents");
    expect(vision).toHaveBeenCalledTimes(1);
    const arg = vision.mock.calls[0]?.[0];
    expect(arg).toBeDefined();
    if (!arg) throw new Error("expected vision to have been invoked");
    expect(arg.model).toBe("claude-haiku-4-5-20251001");
    expect(arg.pngBytes).toBe(png);
    expect(arg.prompt.length).toBeGreaterThan(0);
  });

  it("returns empty string when vision returns empty", async () => {
    const client: LlmClient = {
      callTool: vi.fn(),
      vision: vi.fn<VisionFn>(async () => ""),
    };
    const text = await ocrPageImage(
      { client, model: "claude-haiku-4-5-20251001" },
      new Uint8Array([0x89]),
    );
    expect(text).toBe("");
  });
});
