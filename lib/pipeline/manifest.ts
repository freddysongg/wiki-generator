import {
  access,
  appendFile,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
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
export const MANIFEST_PARTIAL_FILENAME = "manifest.partial.ndjson";
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

const PartialEntrySchema = z.object({
  pdfId: z.string().min(1),
  pages: z.array(
    z.object({
      title: z.string(),
      body: z.string(),
      sourcePages: z.string(),
      aliases: z.array(z.string()),
      links: z.array(z.string()),
      sourceFilename: z.string(),
    }),
  ),
});

type PartialEntry = z.infer<typeof PartialEntrySchema>;

function partialPath(stagingDir: string, batchId: string): string {
  return path.join(stagingDir, batchId, MANIFEST_PARTIAL_FILENAME);
}

export interface AppendManifestEntryArgs {
  stagingDir: string;
  batchId: string;
  pdfId: string;
  pages: GeneratedPage[];
}

export async function appendManifestEntry(
  args: AppendManifestEntryArgs,
): Promise<void> {
  const filePath = partialPath(args.stagingDir, args.batchId);
  await mkdir(path.dirname(filePath), { recursive: true });
  const entry: PartialEntry = { pdfId: args.pdfId, pages: args.pages };
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");
}

export interface FinalizeManifestArgs {
  stagingDir: string;
  batchId: string;
  granularity: Granularity;
  createdAt?: string;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function finalizeManifest(
  args: FinalizeManifestArgs,
): Promise<string> {
  const partial = partialPath(args.stagingDir, args.batchId);
  const finalPath = path.join(args.stagingDir, args.batchId, MANIFEST_FILENAME);
  await mkdir(path.dirname(finalPath), { recursive: true });

  const partialExists = await fileExists(partial);
  if (!partialExists && (await fileExists(finalPath))) {
    return finalPath;
  }

  const byPdfId = new Map<string, PartialEntry>();
  let raw = "";
  if (partialExists) {
    try {
      raw = await readFile(partial, "utf8");
    } catch (err) {
      if (
        !(
          err instanceof Error &&
          "code" in err &&
          (err as NodeJS.ErrnoException).code === "ENOENT"
        )
      ) {
        throw err;
      }
    }
  }

  if (raw.length > 0) {
    const lines = raw.split("\n").filter((line) => line.trim().length > 0);
    for (const line of lines) {
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(line);
      } catch (err) {
        process.stderr.write(
          `[manifest] skipping unparseable partial line: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        continue;
      }
      const parsed = PartialEntrySchema.safeParse(parsedJson);
      if (!parsed.success) {
        process.stderr.write(
          `[manifest] skipping malformed partial line: ${parsed.error.message}\n`,
        );
        continue;
      }
      byPdfId.set(parsed.data.pdfId, parsed.data);
    }
  }

  const collected: GeneratedPage[] = [];
  for (const entry of byPdfId.values()) {
    for (const page of entry.pages) collected.push(page);
  }

  const manifest = buildManifest({
    batchId: args.batchId,
    granularity: args.granularity,
    pages: collected,
    createdAt: args.createdAt,
  });
  const tmpPath = `${finalPath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmpPath, JSON.stringify(manifest, null, 2), "utf8");
  await rename(tmpPath, finalPath);
  await rm(partial, { force: true });
  return finalPath;
}
