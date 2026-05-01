import { z } from "zod";

export class ConfigError extends Error {
  constructor(message: string) {
    super(`Config error: ${message}`);
    this.name = "ConfigError";
  }
}

const ProviderSchema = z.enum(["anthropic", "openai"]);

const RawSchema = z.object({
  llmProvider: ProviderSchema.default("anthropic"),
  anthropicApiKey: z.string().min(1).optional(),
  openaiApiKey: z.string().min(1).optional(),
  vaultPath: z.string().min(1),
  wikiSubfolder: z.string().min(1).default("wiki"),
  extractionModel: z.string().min(1).optional(),
  ocrModel: z.string().min(1).optional(),
  granularityPickerModel: z.string().min(1).optional(),
  maxConcurrentPdfs: z.coerce.number().int().positive().default(3),
  maxConcurrentLlm: z.coerce.number().int().positive().default(6),
  ocrTextThreshold: z.coerce.number().int().positive().default(100),
});

const ANTHROPIC_DEFAULTS = {
  extraction: "claude-sonnet-4-6",
  ocr: "claude-haiku-4-5-20251001",
  granularityPicker: "claude-haiku-4-5-20251001",
} as const;

const OPENAI_DEFAULTS = {
  extraction: "gpt-4o",
  ocr: "gpt-4o-mini",
  granularityPicker: "gpt-4o-mini",
} as const;

export interface AppConfig {
  llmProvider: "anthropic" | "openai";
  anthropicApiKey?: string;
  openaiApiKey?: string;
  vaultPath: string;
  wikiSubfolder: string;
  extractionModel: string;
  ocrModel: string;
  granularityPickerModel: string;
  maxConcurrentPdfs: number;
  maxConcurrentLlm: number;
  ocrTextThreshold: number;
}

export function loadConfig(): AppConfig {
  const raw = {
    llmProvider: process.env.LLM_PROVIDER,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    openaiApiKey: process.env.OPENAI_API_KEY,
    vaultPath: process.env.OBSIDIAN_VAULT_PATH,
    wikiSubfolder: process.env.WIKI_SUBFOLDER,
    extractionModel: process.env.EXTRACTION_MODEL,
    ocrModel: process.env.OCR_MODEL,
    granularityPickerModel: process.env.GRANULARITY_PICKER_MODEL,
    maxConcurrentPdfs: process.env.MAX_CONCURRENT_PDFS,
    maxConcurrentLlm: process.env.MAX_CONCURRENT_LLM,
    ocrTextThreshold: process.env.OCR_TEXT_THRESHOLD,
  };

  const parsed = RawSchema.safeParse(raw);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const fields = Object.entries(flat.fieldErrors)
      .map(([k, v]) => `${k}: ${v?.join(", ")}`)
      .join("; ");
    throw new ConfigError(fields || "invalid configuration");
  }
  const data = parsed.data;

  if (data.llmProvider === "anthropic" && !data.anthropicApiKey) {
    throw new ConfigError(
      "anthropicApiKey: required when LLM_PROVIDER=anthropic",
    );
  }
  if (data.llmProvider === "openai" && !data.openaiApiKey) {
    throw new ConfigError("openaiApiKey: required when LLM_PROVIDER=openai");
  }

  const defaults =
    data.llmProvider === "anthropic" ? ANTHROPIC_DEFAULTS : OPENAI_DEFAULTS;

  return {
    llmProvider: data.llmProvider,
    anthropicApiKey: data.anthropicApiKey,
    openaiApiKey: data.openaiApiKey,
    vaultPath: data.vaultPath,
    wikiSubfolder: data.wikiSubfolder,
    extractionModel: data.extractionModel ?? defaults.extraction,
    ocrModel: data.ocrModel ?? defaults.ocr,
    granularityPickerModel:
      data.granularityPickerModel ?? defaults.granularityPicker,
    maxConcurrentPdfs: data.maxConcurrentPdfs,
    maxConcurrentLlm: data.maxConcurrentLlm,
    ocrTextThreshold: data.ocrTextThreshold,
  };
}
