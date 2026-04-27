import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig, ConfigError } from "@/lib/config";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, ORIGINAL_ENV);
});

afterEach(() => {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, ORIGINAL_ENV);
});

describe("loadConfig", () => {
  it("parses valid env", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.OBSIDIAN_VAULT_PATH = "/tmp/vault";
    const cfg = loadConfig();
    expect(cfg.anthropicApiKey).toBe("sk-ant-test");
    expect(cfg.vaultPath).toBe("/tmp/vault");
    expect(cfg.wikiSubfolder).toBe("wiki");
    expect(cfg.extractionModel).toBe("claude-sonnet-4-6");
    expect(cfg.ocrModel).toBe("claude-haiku-4-5-20251001");
    expect(cfg.maxConcurrentPdfs).toBe(3);
    expect(cfg.ocrTextThreshold).toBe(100);
  });

  it("throws ConfigError when ANTHROPIC_API_KEY is missing", () => {
    process.env.OBSIDIAN_VAULT_PATH = "/tmp/vault";
    expect(() => loadConfig()).toThrow(ConfigError);
  });

  it("throws ConfigError when OBSIDIAN_VAULT_PATH is missing", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(() => loadConfig()).toThrow(ConfigError);
  });

  it("respects overrides", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.OBSIDIAN_VAULT_PATH = "/tmp/vault";
    process.env.MAX_CONCURRENT_PDFS = "5";
    process.env.OCR_TEXT_THRESHOLD = "200";
    const cfg = loadConfig();
    expect(cfg.maxConcurrentPdfs).toBe(5);
    expect(cfg.ocrTextThreshold).toBe(200);
  });
});
