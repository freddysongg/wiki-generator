import OpenAI from "openai";
import type { LlmClient, ToolCallRequest, VisionRequest } from "./types";

let cached: { key: string; sdk: OpenAI } | undefined;

function getSdk(apiKey: string): OpenAI {
  if (cached && cached.key === apiKey) return cached.sdk;
  const sdk = new OpenAI({ apiKey });
  cached = { key: apiKey, sdk };
  return sdk;
}

export function createOpenAiClient(apiKey: string): LlmClient {
  const sdk = getSdk(apiKey);

  return {
    async callTool(req: ToolCallRequest): Promise<unknown> {
      const userText = req.cacheableContext
        ? `${req.cacheableContext}\n\n${req.body}`
        : req.body;

      const completion = await sdk.chat.completions.create({
        model: req.model,
        max_tokens: req.maxTokens,
        messages: [
          { role: "system", content: req.systemPrompt },
          { role: "user", content: userText },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: req.tool.name,
              description: req.tool.description,
              parameters: req.tool.schema,
              strict: true,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: req.tool.name } },
      });

      const choice = completion.choices[0];
      const toolCall = choice?.message?.tool_calls?.[0];
      if (!toolCall || toolCall.type !== "function") {
        throw new Error("openai: model did not return a function tool_call");
      }
      try {
        return JSON.parse(toolCall.function.arguments) as unknown;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `openai: tool_call arguments JSON parse failed: ${message}`,
        );
      }
    },

    async vision(req: VisionRequest): Promise<string> {
      const base64 = Buffer.from(req.pngBytes).toString("base64");
      const completion = await sdk.chat.completions.create({
        model: req.model,
        max_tokens: req.maxTokens,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:image/png;base64,${base64}` },
              },
              { type: "text", text: req.prompt },
            ],
          },
        ],
      });
      const text = completion.choices[0]?.message?.content;
      if (typeof text !== "string") return "";
      return text.trim();
    },
  };
}
