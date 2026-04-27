import Anthropic from "@anthropic-ai/sdk";

let cached: { key: string; client: Anthropic } | undefined;

export function getAnthropicClient(apiKey: string): Anthropic {
  if (cached && cached.key === apiKey) return cached.client;
  const client = new Anthropic({ apiKey });
  cached = { key: apiKey, client };
  return client;
}
