import type Anthropic from "@anthropic-ai/sdk";

export interface OcrDeps {
  client: Pick<Anthropic, "messages">;
  model: string;
}

const TRANSCRIBE_PROMPT =
  "Transcribe the visible text from this page exactly. Preserve paragraph breaks. " +
  "Do not summarize, translate, or add commentary. If the page is blank or has no readable text, output an empty response.";

const MAX_TOKENS = 4096;

export async function ocrPageImage(
  deps: OcrDeps,
  pngBytes: Uint8Array,
): Promise<string> {
  const base64 = Buffer.from(pngBytes).toString("base64");
  const response = await deps.client.messages.create({
    model: deps.model,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: base64,
            },
          },
          { type: "text", text: TRANSCRIBE_PROMPT },
        ],
      },
    ],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return "";
  return textBlock.text.trim();
}
