import { z } from "zod";

export class ConfigError extends Error {
  constructor(message: string) {
    super(`Config error: ${message}`);
    this.name = "ConfigError";
  }
}

const ConfigSchema = z.object({
  anthropicApiKey: z.string().min(1),
  vaultPath: z.string().min(1),
  wikiSubfolder: z.string().min(1).default("wiki"),
  extractionModel: z.string().min(1).default("claude-sonnet-4-6"),
  ocrModel: z.string().min(1).default("claude-haiku-4-5-20251001"),
  maxConcurrentPdfs: z.coerce.number().int().positive().default(3),
  ocrTextThreshold: z.coerce.number().int().positive().default(100),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(): AppConfig {
  const raw = {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    vaultPath: process.env.OBSIDIAN_VAULT_PATH,
    wikiSubfolder: process.env.WIKI_SUBFOLDER,
    extractionModel: process.env.EXTRACTION_MODEL,
    ocrModel: process.env.OCR_MODEL,
    maxConcurrentPdfs: process.env.MAX_CONCURRENT_PDFS,
    ocrTextThreshold: process.env.OCR_TEXT_THRESHOLD,
  };

  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const fields = Object.entries(flat.fieldErrors)
      .map(([k, v]) => `${k}: ${v?.join(", ")}`)
      .join("; ");
    throw new ConfigError(fields || "invalid configuration");
  }
  return parsed.data;
}
