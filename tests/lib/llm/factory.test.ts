import { describe, it, expect } from "vitest";
import { createLlmClient } from "@/lib/llm";

describe("createLlmClient", () => {
  it("returns an anthropic-shaped client when provider=anthropic", () => {
    const client = createLlmClient({
      provider: "anthropic",
      anthropicApiKey: "sk-ant-test",
    });
    expect(typeof client.callTool).toBe("function");
    expect(typeof client.vision).toBe("function");
  });

  it("returns an openai-shaped client when provider=openai", () => {
    const client = createLlmClient({
      provider: "openai",
      openaiApiKey: "sk-openai-test",
    });
    expect(typeof client.callTool).toBe("function");
    expect(typeof client.vision).toBe("function");
  });

  it("throws when anthropic provider has no key", () => {
    expect(() => createLlmClient({ provider: "anthropic" })).toThrow();
  });

  it("throws when openai provider has no key", () => {
    expect(() => createLlmClient({ provider: "openai" })).toThrow();
  });
});
