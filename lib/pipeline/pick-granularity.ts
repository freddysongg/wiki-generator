import { z } from "zod";
import type { LlmClient } from "@/lib/llm";
import type { ResolvedGranularity } from "@/lib/types";

export interface PickGranularityDeps {
  client: LlmClient;
  model: string;
  pdfText: string;
  pageCount: number;
}

const SYSTEM_PROMPT = `You classify a document to pick the best wiki granularity.

Choose one of three values based on document length, conceptual density, and breadth:
- coarse: short or narrowly-scoped material (under ~5 pages of substantive text). Produces 5-25 wiki pages.
- medium: typical paper, report, or chapter (~5-50 pages). Produces 25-100 pages.
- fine: long reference material (textbook, full RFC, encyclopedia chapter, large manual). Produces 100-500 pages.

If the document is ambiguous between two levels, choose the lower one.

You MUST call the pick_granularity tool. Do not produce a text response.`;

const ResultSchema = z.object({
  choice: z.enum(["coarse", "medium", "fine"]),
  reason: z.string(),
});

const TOOL_NAME = "pick_granularity";
const TOOL_DESCRIPTION =
  "Return the wiki granularity that best fits this document.";
const TOOL_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    choice: { type: "string", enum: ["coarse", "medium", "fine"] },
    reason: { type: "string" },
  },
  required: ["choice", "reason"],
};

const HEAD_CHARS = 3000;
const TAIL_CHARS = 500;
const SAMPLE_THRESHOLD = HEAD_CHARS + TAIL_CHARS;
const MAX_TOKENS = 200;
const MAX_ATTEMPTS = 2;

function buildSample(pdfText: string): string {
  if (pdfText.length <= SAMPLE_THRESHOLD) return pdfText;
  const head = pdfText.slice(0, HEAD_CHARS);
  const tail = pdfText.slice(pdfText.length - TAIL_CHARS);
  return `${head}\n\n[…]\n\n${tail}`;
}

export async function pickGranularity(
  deps: PickGranularityDeps,
): Promise<ResolvedGranularity> {
  const sample = buildSample(deps.pdfText);
  const body = `Page count: ${deps.pageCount}\n\nSample (first 3000 chars + last 500 chars):\n${sample}`;

  let lastError: string | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const systemPrompt = lastError
      ? `${SYSTEM_PROMPT}\n\nPrevious attempt failed validation: ${lastError}. Fix and retry.`
      : SYSTEM_PROMPT;

    const raw = await deps.client.callTool({
      model: deps.model,
      maxTokens: MAX_TOKENS,
      systemPrompt,
      body,
      tool: {
        name: TOOL_NAME,
        description: TOOL_DESCRIPTION,
        schema: TOOL_SCHEMA,
      },
    });

    const parsed = ResultSchema.safeParse(raw);
    if (parsed.success) return parsed.data.choice;
    lastError = parsed.error.message;
  }

  throw new Error(
    `Granularity classifier failed schema validation after retry: ${lastError}`,
  );
}
