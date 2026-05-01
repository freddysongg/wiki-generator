export type LlmProvider = "anthropic" | "openai";

export interface ToolCallRequest {
  model: string;
  maxTokens: number;
  systemPrompt: string;
  cacheableContext?: string;
  body: string;
  tool: {
    name: string;
    description: string;
    schema: Record<string, unknown>;
  };
}

export interface VisionRequest {
  model: string;
  maxTokens: number;
  prompt: string;
  pngBytes: Uint8Array;
}

export interface LlmClient {
  callTool(req: ToolCallRequest): Promise<unknown>;
  vision(req: VisionRequest): Promise<string>;
}

export class TruncatedResponseError extends Error {
  readonly maxTokens: number;
  readonly model: string;
  constructor(model: string, maxTokens: number) {
    super(
      `LLM response truncated at max_tokens=${maxTokens} for model ${model}. ` +
        `Reduce input size or raise the budget.`,
    );
    this.name = "TruncatedResponseError";
    this.model = model;
    this.maxTokens = maxTokens;
  }
}
