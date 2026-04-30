import Anthropic from "@anthropic-ai/sdk";
import type { LlmClient, ToolCallRequest, VisionRequest } from "./types";

let cached: { key: string; sdk: Anthropic } | undefined;

function getSdk(apiKey: string): Anthropic {
  if (cached && cached.key === apiKey) return cached.sdk;
  const sdk = new Anthropic({ apiKey });
  cached = { key: apiKey, sdk };
  return sdk;
}

export function createAnthropicClient(apiKey: string): LlmClient {
  const sdk = getSdk(apiKey);

  return {
    async callTool(req: ToolCallRequest): Promise<unknown> {
      const userBlocks: Anthropic.Messages.ContentBlockParam[] = [];
      if (req.cacheableContext) {
        userBlocks.push({
          type: "text",
          text: req.cacheableContext,
          cache_control: { type: "ephemeral" },
        });
      }
      userBlocks.push({ type: "text", text: req.body });

      const response = await sdk.messages.create({
        model: req.model,
        max_tokens: req.maxTokens,
        system: [
          {
            type: "text",
            text: req.systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: [
          {
            name: req.tool.name,
            description: req.tool.description,
            input_schema: req.tool
              .schema as unknown as Anthropic.Messages.Tool["input_schema"],
          },
        ],
        tool_choice: { type: "tool", name: req.tool.name },
        messages: [{ role: "user", content: userBlocks }],
      });

      const toolBlock = response.content.find((b) => b.type === "tool_use");
      if (!toolBlock || toolBlock.type !== "tool_use") {
        throw new Error("anthropic: model did not return tool_use block");
      }
      return toolBlock.input;
    },

    async vision(req: VisionRequest): Promise<string> {
      const base64 = Buffer.from(req.pngBytes).toString("base64");
      const response = await sdk.messages.create({
        model: req.model,
        max_tokens: req.maxTokens,
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
              { type: "text", text: req.prompt },
            ],
          },
        ],
      });
      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") return "";
      return textBlock.text.trim();
    },
  };
}
