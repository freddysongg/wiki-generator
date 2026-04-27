import { describe, it, expect, vi } from "vitest";
import { ocrPageImage } from "@/lib/pipeline/ocr-fallback";

describe("ocrPageImage", () => {
  it("calls the supplied client with image content and returns transcribed text", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "transcribed page contents" }],
    });
    const client = { messages: { create } };
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

    const text = await ocrPageImage(
      { client: client as unknown as Parameters<typeof ocrPageImage>[0]["client"], model: "claude-haiku-4-5-20251001" },
      png,
    );

    expect(text).toBe("transcribed page contents");
    expect(create).toHaveBeenCalledTimes(1);
    const call = create.mock.calls[0][0];
    expect(call.model).toBe("claude-haiku-4-5-20251001");
    const userMsg = call.messages[0];
    expect(userMsg.role).toBe("user");
    const imagePart = userMsg.content.find((c: { type: string }) => c.type === "image");
    expect(imagePart).toBeDefined();
    expect(imagePart.source.media_type).toBe("image/png");
  });

  it("returns empty string when response has no text block", async () => {
    const create = vi.fn().mockResolvedValue({ content: [] });
    const client = { messages: { create } };
    const png = new Uint8Array([0x89]);
    const text = await ocrPageImage(
      { client: client as unknown as Parameters<typeof ocrPageImage>[0]["client"], model: "claude-haiku-4-5-20251001" },
      png,
    );
    expect(text).toBe("");
  });
});
