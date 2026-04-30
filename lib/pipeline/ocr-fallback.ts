import type { LlmClient } from "@/lib/llm";

export interface OcrDeps {
  client: LlmClient;
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
  return deps.client.vision({
    model: deps.model,
    maxTokens: MAX_TOKENS,
    prompt: TRANSCRIBE_PROMPT,
    pngBytes,
  });
}
