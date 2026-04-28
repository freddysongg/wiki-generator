import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig, ConfigError } from "@/lib/config";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, ORIGINAL_ENV);
  delete process.env.LLM_PROVIDER;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.EXTRACTION_MODEL;
  delete process.env.OCR_MODEL;
  delete process.env.GRANULARITY_PICKER_MODEL;
});

afterEach(() => {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, ORIGINAL_ENV);
});

describe("loadConfig", () => {
  it("parses valid env (anthropic default)", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.OBSIDIAN_VAULT_PATH = "/tmp/vault";
    const cfg = loadConfig();
    expect(cfg.llmProvider).toBe("anthropic");
    expect(cfg.anthropicApiKey).toBe("sk-ant-test");
    expect(cfg.vaultPath).toBe("/tmp/vault");
    expect(cfg.wikiSubfolder).toBe("wiki");
    expect(cfg.extractionModel).toBe("claude-sonnet-4-6");
    expect(cfg.ocrModel).toBe("claude-haiku-4-5-20251001");
    expect(cfg.granularityPickerModel).toBe("claude-haiku-4-5-20251001");
    expect(cfg.maxConcurrentPdfs).toBe(3);
    expect(cfg.ocrTextThreshold).toBe(100);
  });

  it("throws ConfigError when ANTHROPIC_API_KEY is missing under anthropic provider", () => {
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

  it("uses openai defaults when LLM_PROVIDER=openai", () => {
    process.env.LLM_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-openai-test";
    process.env.OBSIDIAN_VAULT_PATH = "/tmp/vault";
    const cfg = loadConfig();
    expect(cfg.llmProvider).toBe("openai");
    expect(cfg.openaiApiKey).toBe("sk-openai-test");
    expect(cfg.extractionModel).toBe("gpt-4o");
    expect(cfg.ocrModel).toBe("gpt-4o-mini");
    expect(cfg.granularityPickerModel).toBe("gpt-4o-mini");
  });

  it("throws when openai provider has no OPENAI_API_KEY", () => {
    process.env.LLM_PROVIDER = "openai";
    process.env.OBSIDIAN_VAULT_PATH = "/tmp/vault";
    expect(() => loadConfig()).toThrow(ConfigError);
  });

  it("respects EXTRACTION_MODEL/OCR_MODEL overrides under openai", () => {
    process.env.LLM_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-openai-test";
    process.env.OBSIDIAN_VAULT_PATH = "/tmp/vault";
    process.env.EXTRACTION_MODEL = "gpt-4.1";
    process.env.OCR_MODEL = "gpt-4o-mini";
    const cfg = loadConfig();
    expect(cfg.extractionModel).toBe("gpt-4.1");
    expect(cfg.ocrModel).toBe("gpt-4o-mini");
  });

  it("respects GRANULARITY_PICKER_MODEL override under anthropic", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.OBSIDIAN_VAULT_PATH = "/tmp/vault";
    process.env.GRANULARITY_PICKER_MODEL = "claude-custom-picker";
    const cfg = loadConfig();
    expect(cfg.granularityPickerModel).toBe("claude-custom-picker");
  });

  it("respects GRANULARITY_PICKER_MODEL override under openai", () => {
    process.env.LLM_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-openai-test";
    process.env.OBSIDIAN_VAULT_PATH = "/tmp/vault";
    process.env.GRANULARITY_PICKER_MODEL = "gpt-picker-mini";
    const cfg = loadConfig();
    expect(cfg.granularityPickerModel).toBe("gpt-picker-mini");
  });

  it("rejects an unknown LLM_PROVIDER", () => {
    process.env.LLM_PROVIDER = "gemini";
    process.env.OBSIDIAN_VAULT_PATH = "/tmp/vault";
    expect(() => loadConfig()).toThrow(ConfigError);
  });
});
