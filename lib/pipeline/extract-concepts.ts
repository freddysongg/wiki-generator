import { z } from "zod";
import type { ExtractionResult, ResolvedGranularity } from "@/lib/types";
import type { LlmClient } from "@/lib/llm";
import { withRetry } from "@/lib/llm/retry";

export interface ExtractDeps {
  client: LlmClient;
  model: string;
  pdfText: string;
  vaultTitles: string[];
  granularity: ResolvedGranularity;
}

const SYSTEM_PROMPT = `You are an expert at distilling reading material into a personal Markdown wiki.

You will receive (a) the full text of a PDF and (b) a list of titles already present in the user's Obsidian vault. Your job: produce a set of wiki pages that capture the conceptual content of the PDF.

Rules:
- Each page covers one distinct concept (term, theorem, algorithm, model, idea).
- Title MUST be the canonical name of that concept. If the concept appears in the supplied vault-titles list under an existing name, USE THAT EXACT TITLE so the link resolves.
- Body is concise Markdown (no top-level # heading; the title is the filename). Use ## subheadings, bullet lists, and inline code as appropriate. Do not echo the entire source — synthesize.
- Cross-references: include a "## Related" section listing relevant concepts as Obsidian wikilinks ([[Title]]). Prefer titles from the vault-titles list when they match. You may also link to other pages you are creating in this same response.
- sourcePages: e.g. "pp. 14-22" or "p. 3" — the page range in the PDF where this concept is discussed.
- aliases: array of alternative names for the concept the user might write instead (abbreviations, plural/singular, hyphenation variants, common misspellings). Empty array if none. The canonical title goes in \`title\`, NOT in aliases.
- links: array of every wikilink target you used in the body. Must match exact targets in the body.

Every page MUST include an aliases field (use an empty array when there are no alternatives).

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
      aliases: z.array(z.string()).default([]),
      links: z.array(z.string()),
    }),
  ),
});

const TOOL_NAME = "submit_pages";
const TOOL_DESCRIPTION = "Return the set of wiki pages extracted from the PDF.";
const TOOL_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  properties: {
    pages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string" },
          body: { type: "string" },
          sourcePages: { type: "string" },
          aliases: { type: "array", items: { type: "string" } },
          links: { type: "array", items: { type: "string" } },
        },
        required: ["title", "body", "sourcePages", "aliases", "links"],
      },
    },
  },
  required: ["pages"],
};

const MAX_TOKENS = 16000;
const MAX_ATTEMPTS = 2;
export const CHUNK_THRESHOLD_CHARS = 200_000;
const CHUNK_TARGET_CHARS = 150_000;
const PAGE_MARKER_PATTERN = /\[Page \d+\]/g;

interface ChunkRunArgs {
  client: LlmClient;
  model: string;
  pdfText: string;
  vaultTitles: string[];
  granularity: ResolvedGranularity;
  chunkInfo?: { index: number; total: number };
}

function splitOnPageBoundaries(pdfText: string, targetSize: number): string[] {
  const matches: number[] = [];
  for (const match of pdfText.matchAll(PAGE_MARKER_PATTERN)) {
    if (match.index !== undefined) matches.push(match.index);
  }

  if (matches.length === 0) return [pdfText];

  const boundaries: number[] =
    matches[0] === 0 ? [...matches] : [0, ...matches];
  boundaries.push(pdfText.length);

  const chunks: string[] = [];
  let chunkStart = boundaries[0];

  for (let i = 1; i < boundaries.length; i++) {
    const nextBoundary = boundaries[i];
    const currentSize = nextBoundary - chunkStart;

    if (currentSize <= targetSize) continue;

    const previousBoundary = boundaries[i - 1];
    if (previousBoundary > chunkStart) {
      chunks.push(pdfText.slice(chunkStart, previousBoundary));
      chunkStart = previousBoundary;
      i -= 1;
      continue;
    }

    chunks.push(pdfText.slice(chunkStart, nextBoundary));
    chunkStart = nextBoundary;
  }

  if (chunkStart < pdfText.length) {
    chunks.push(pdfText.slice(chunkStart));
  }

  return chunks.filter((chunk) => chunk.length > 0);
}

async function extractFromSingleInput(
  args: ChunkRunArgs,
): Promise<ExtractionResult> {
  const cacheableContext = `Vault titles already present (use these for cross-references when they match):\n${args.vaultTitles.join("\n")}`;
  const chunkNote = args.chunkInfo
    ? `\n\nNote: this is part ${args.chunkInfo.index} of ${args.chunkInfo.total} of a longer document. Extract concepts only from the text below; do not attempt to produce a complete index of the whole document from this partial input.`
    : "";
  const body = `Granularity: ${args.granularity}${chunkNote}\n\nPDF text:\n${args.pdfText}`;

  let lastError: string | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const systemPrompt = lastError
      ? `${SYSTEM_PROMPT}\n\nPrevious attempt failed validation: ${lastError}. Fix and retry.`
      : SYSTEM_PROMPT;

    const raw = await withRetry(() =>
      args.client.callTool({
        model: args.model,
        maxTokens: MAX_TOKENS,
        systemPrompt,
        cacheableContext,
        body,
        tool: {
          name: TOOL_NAME,
          description: TOOL_DESCRIPTION,
          schema: TOOL_SCHEMA,
        },
      }),
    );

    const parsed = ResultSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    lastError = parsed.error.message;
  }

  throw new Error(
    `Concept extraction failed schema validation after retry: ${lastError}`,
  );
}

function mergeResults(
  accumulated: ExtractionResult,
  next: ExtractionResult,
): ExtractionResult {
  const pageByTitle = new Map<string, ExtractionResult["pages"][number]>();
  for (const page of accumulated.pages) pageByTitle.set(page.title, page);
  for (const page of next.pages) pageByTitle.set(page.title, page);
  return { pages: Array.from(pageByTitle.values()) };
}

function dedupePageLinks(
  pages: ExtractionResult["pages"],
): ExtractionResult["pages"] {
  return pages.map((page) => ({
    ...page,
    aliases: Array.from(new Set(page.aliases)),
    links: Array.from(new Set(page.links)),
  }));
}

export async function extractConcepts(
  deps: ExtractDeps,
): Promise<ExtractionResult> {
  if (deps.pdfText.length <= CHUNK_THRESHOLD_CHARS) {
    return extractFromSingleInput({
      client: deps.client,
      model: deps.model,
      pdfText: deps.pdfText,
      vaultTitles: deps.vaultTitles,
      granularity: deps.granularity,
    });
  }

  const chunks = splitOnPageBoundaries(deps.pdfText, CHUNK_TARGET_CHARS);
  let merged: ExtractionResult = { pages: [] };
  const augmentedTitles = new Set(deps.vaultTitles);

  for (let i = 0; i < chunks.length; i++) {
    const chunkResult = await extractFromSingleInput({
      client: deps.client,
      model: deps.model,
      pdfText: chunks[i],
      vaultTitles: Array.from(augmentedTitles),
      granularity: deps.granularity,
      chunkInfo: { index: i + 1, total: chunks.length },
    });
    merged = mergeResults(merged, chunkResult);
    for (const page of chunkResult.pages) augmentedTitles.add(page.title);
  }

  return { pages: dedupePageLinks(merged.pages) };
}
