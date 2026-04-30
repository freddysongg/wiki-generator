import { writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { titleToFilename } from "@/lib/slugify";
import type {
  BatchManifest,
  GeneratedPage,
  Granularity,
  ManifestPage,
} from "@/lib/types";

export const MANIFEST_FILENAME = "manifest.json";
export const MANIFEST_VERSION = "1.0.0" as const;
const FROZEN_TAG = "wiki-generator";

export const ManifestPageSchema = z.object({
  title: z.string().min(1),
  filename: z.string().min(1),
  aliases: z.array(z.string()),
  type: z.literal("concept"),
  source: z.string(),
  sourcePages: z.string(),
  tags: z.array(z.string()),
  links: z.array(z.string()),
  createdAt: z.string(),
});

export const BatchManifestSchema = z.object({
  version: z.literal(MANIFEST_VERSION),
  batchId: z.string().min(1),
  createdAt: z.string(),
  granularity: z.enum(["coarse", "medium", "fine", "auto"]),
  pages: z.array(ManifestPageSchema),
});

export interface BuildManifestArgs {
  batchId: string;
  granularity: Granularity;
  pages: GeneratedPage[];
  createdAt?: string;
}

export function buildManifest(args: BuildManifestArgs): BatchManifest {
  const createdAt = args.createdAt ?? new Date().toISOString();
  const manifestPages: ManifestPage[] = args.pages.map((page) => ({
    title: page.title,
    filename: titleToFilename(page.title),
    aliases: page.aliases,
    type: "concept",
    source: page.sourceFilename,
    sourcePages: page.sourcePages,
    tags: [FROZEN_TAG],
    links: page.links,
    createdAt,
  }));
  return {
    version: MANIFEST_VERSION,
    batchId: args.batchId,
    createdAt,
    granularity: args.granularity,
    pages: manifestPages,
  };
}

export interface WriteManifestArgs extends BuildManifestArgs {
  stagingDir: string;
}

export async function writeManifest(args: WriteManifestArgs): Promise<string> {
  const filePath = path.join(args.stagingDir, args.batchId, MANIFEST_FILENAME);
  const manifest = buildManifest(args);
  await writeFile(filePath, JSON.stringify(manifest, null, 2), "utf8");
  return filePath;
}
