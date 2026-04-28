import { z } from "zod";
import type { ExtractionResult, Granularity } from "@/lib/types";
import type { LlmClient } from "@/lib/llm";

export interface ExtractDeps {
  client: LlmClient;
  model: string;
  pdfText: string;
  vaultTitles: string[];
  granularity: Granularity;
}

const SYSTEM_PROMPT = `You are an expert at distilling reading material into a personal Markdown wiki.

You will receive (a) the full text of a PDF and (b) a list of titles already present in the user's Obsidian vault. Your job: produce a set of wiki pages that capture the conceptual content of the PDF.

Rules:
- Each page covers one distinct concept (term, theorem, algorithm, model, idea).
- Title MUST be the canonical name of that concept. If the concept appears in the supplied vault-titles list under an existing name, USE THAT EXACT TITLE so the link resolves.
- Body is concise Markdown (no top-level # heading; the title is the filename). Use ## subheadings, bullet lists, and inline code as appropriate. Do not echo the entire source — synthesize.
- Cross-references: include a "## Related" section listing relevant concepts as Obsidian wikilinks ([[Title]]). Prefer titles from the vault-titles list when they match. You may also link to other pages you are creating in this same response.
- sourcePages: e.g. "pp. 14-22" or "p. 3" — the page range in the PDF where this concept is discussed.
- links: array of every wikilink target you used in the body. Must match exact targets in the body.

Granularity instructions:
- "coarse": 5-25 pages total. One per major topic. Each page 500-1500 words.
- "medium": 25-100 pages total. One per distinct named concept. Each page 200-600 words.
- "fine": 100-500 pages total. One per any definable term, including sub-concepts.

For very short inputs (a few paragraphs), produce as few pages as the content supports — even just one — regardless of granularity bounds.

Write in the source language of the PDF. Do not translate.

You MUST respond by calling the submit_pages tool. Do not produce a text response.`;

const ResultSchema = z.object({
  pages: z.array(
    z.object({
      title: z.string().min(1),
      body: z.string().min(1),
      sourcePages: z.string().min(1),
      links: z.array(z.string()),
    }),
  ),
});

const TOOL_NAME = "submit_pages";
const TOOL_DESCRIPTION =
  "Return the set of wiki pages extracted from the PDF.";
const TOOL_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    pages: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          sourcePages: { type: "string" },
          links: { type: "array", items: { type: "string" } },
        },
        required: ["title", "body", "sourcePages", "links"],
      },
    },
  },
  required: ["pages"],
};

const MAX_TOKENS = 16000;
const MAX_ATTEMPTS = 2;

export async function extractConcepts(
  deps: ExtractDeps,
): Promise<ExtractionResult> {
  const cacheableContext = `Vault titles already present (use these for cross-references when they match):\n${deps.vaultTitles.join("\n")}`;
  /* auto granularity defaults to medium until backend support lands; spec 2026-04-28 */
  const promptGranularity =
    deps.granularity === "auto" ? "medium" : deps.granularity;
  const body = `Granularity: ${promptGranularity}\n\nPDF text:\n${deps.pdfText}`;

  let lastError: string | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const systemPrompt = lastError
      ? `${SYSTEM_PROMPT}\n\nPrevious attempt failed validation: ${lastError}. Fix and retry.`
      : SYSTEM_PROMPT;

    const raw = await deps.client.callTool({
      model: deps.model,
      maxTokens: MAX_TOKENS,
      systemPrompt,
      cacheableContext,
      body,
      tool: {
        name: TOOL_NAME,
        description: TOOL_DESCRIPTION,
        schema: TOOL_SCHEMA,
      },
    });

    const parsed = ResultSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    lastError = parsed.error.message;
  }

  throw new Error(
    `Concept extraction failed schema validation after retry: ${lastError}`,
  );
}
