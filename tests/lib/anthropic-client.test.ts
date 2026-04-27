import { describe, it, expect } from "vitest";
import { getAnthropicClient } from "@/lib/anthropic-client";

describe("getAnthropicClient", () => {
  it("returns a singleton instance", () => {
    const a = getAnthropicClient("sk-ant-test");
    const b = getAnthropicClient("sk-ant-test");
    expect(a).toBe(b);
  });
});
