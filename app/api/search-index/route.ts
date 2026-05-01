import { NextResponse } from "next/server";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  BatchManifestSchema,
  MANIFEST_FILENAME,
} from "@/lib/pipeline/manifest";
import { isValidBatchId } from "@/lib/batch-id";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SearchRecord {
  id: string;
  batchId: string;
  filename: string;
  title: string;
  aliases: string[];
  source: string;
  sourcePages: string;
  createdAt: string;
}

interface SearchIndexResponse {
  records: SearchRecord[];
}

function getStagingDir(): string {
  return process.env.WIKI_STAGING_DIR ?? path.join(process.cwd(), "staging");
}

async function loadRecordsForBatch(
  stagingDir: string,
  batchId: string,
): Promise<SearchRecord[]> {
  const manifestPath = path.join(stagingDir, batchId, MANIFEST_FILENAME);
  let raw: string;
  try {
    raw = await readFile(manifestPath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return [];
  }
  const validated = BatchManifestSchema.safeParse(parsedJson);
  if (!validated.success) return [];
  const manifest = validated.data;
  return manifest.pages.map((page) => ({
    id: `${manifest.batchId}::${page.filename}`,
    batchId: manifest.batchId,
    filename: page.filename,
    title: page.title,
    aliases: page.aliases,
    source: page.source,
    sourcePages: page.sourcePages,
    createdAt: page.createdAt,
  }));
}

export async function GET(): Promise<Response> {
  const stagingDir = getStagingDir();
  let entries: string[];
  try {
    entries = await readdir(stagingDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      const empty: SearchIndexResponse = { records: [] };
      return NextResponse.json(empty);
    }
    throw err;
  }

  const validBatchDirs: string[] = [];
  for (const entry of entries) {
    if (!isValidBatchId(entry)) continue;
    const full = path.join(stagingDir, entry);
    try {
      const info = await stat(full);
      if (info.isDirectory()) validBatchDirs.push(entry);
    } catch {
      continue;
    }
  }

  const perBatch = await Promise.all(
    validBatchDirs.map((dir) =>
      loadRecordsForBatch(stagingDir, dir).catch(() => [] as SearchRecord[]),
    ),
  );
  const seenIds = new Set<string>();
  const records: SearchRecord[] = [];
  for (const record of perBatch.flat()) {
    if (seenIds.has(record.id)) continue;
    seenIds.add(record.id);
    records.push(record);
  }
  const body: SearchIndexResponse = { records };
  return NextResponse.json(body, {
    headers: { "cache-control": "public, max-age=30, must-revalidate" },
  });
}
