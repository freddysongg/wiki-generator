import { NextResponse } from "next/server";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  BatchManifestSchema,
  MANIFEST_FILENAME,
} from "@/lib/pipeline/manifest";
import type { BatchSummary } from "@/lib/types";

export const runtime = "nodejs";

function getStagingDir(): string {
  return process.env.WIKI_STAGING_DIR ?? path.join(process.cwd(), "staging");
}

async function summarize(
  stagingDir: string,
  batchDir: string,
): Promise<BatchSummary | null> {
  const manifestPath = path.join(stagingDir, batchDir, MANIFEST_FILENAME);
  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return null;
  }
  const validated = BatchManifestSchema.safeParse(parsedJson);
  if (!validated.success) return null;
  const manifest = validated.data;

  const sources = Array.from(
    new Set(manifest.pages.map((p) => p.source)),
  ).sort();
  const linkCount = manifest.pages.reduce((sum, p) => sum + p.links.length, 0);

  return {
    batchId: manifest.batchId,
    createdAt: manifest.createdAt,
    granularity: manifest.granularity,
    pageCount: manifest.pages.length,
    linkCount,
    sources,
  };
}

export async function GET(): Promise<Response> {
  const stagingDir = getStagingDir();
  let entries: string[];
  try {
    entries = await readdir(stagingDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json([] satisfies BatchSummary[]);
    }
    throw err;
  }

  const dirs: string[] = [];
  for (const entry of entries) {
    const full = path.join(stagingDir, entry);
    try {
      const info = await stat(full);
      if (info.isDirectory()) dirs.push(entry);
    } catch {
      continue;
    }
  }

  const summaries = await Promise.all(
    dirs.map((dir) => summarize(stagingDir, dir).catch(() => null)),
  );
  const filtered = summaries.filter((s): s is BatchSummary => s !== null);
  filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json(filtered);
}
