import type { LlmClient, LlmProvider } from "./types";
import { createAnthropicClient } from "./anthropic";
import { createOpenAiClient } from "./openai";

export type {
  LlmClient,
  LlmProvider,
  ToolCallRequest,
  VisionRequest,
} from "./types";

export interface LlmFactoryArgs {
  provider: LlmProvider;
  anthropicApiKey?: string;
  openaiApiKey?: string;
}

export function createLlmClient(args: LlmFactoryArgs): LlmClient {
  if (args.provider === "anthropic") {
    if (!args.anthropicApiKey) {
      throw new Error(
        "createLlmClient: anthropic provider requires anthropicApiKey",
      );
    }
    return createAnthropicClient(args.anthropicApiKey);
  }
  if (!args.openaiApiKey) {
    throw new Error("createLlmClient: openai provider requires openaiApiKey");
  }
  return createOpenAiClient(args.openaiApiKey);
}
