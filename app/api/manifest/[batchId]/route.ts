import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  BatchManifestSchema,
  MANIFEST_FILENAME,
} from "@/lib/pipeline/manifest";
import { isValidBatchId } from "@/lib/batch-id";

export const runtime = "nodejs";

const FULL_MANIFEST_CACHE_CONTROL = "public, max-age=43200, must-revalidate";
const SUMMARY_CACHE_CONTROL = "public, max-age=43200, must-revalidate";
const DEFAULT_PAGE_LIMIT = 100;
const MAX_PAGE_LIMIT = 500;

interface Params {
  batchId: string;
}

interface ManifestPageSummary {
  title: string;
  filename: string;
  aliases: string[];
  source: string;
  sourcePages: string;
}

interface PaginatedSummaryResponse {
  batchId: string;
  total: number;
  offset: number;
  limit: number;
  pages: ManifestPageSummary[];
}

function stagingRoot(): string {
  return process.env.WIKI_STAGING_DIR ?? path.join(process.cwd(), "staging");
}

function parseNonNegativeInt(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0) return null;
  return Math.floor(parsed);
}

export async function GET(
  req: Request,
  ctx: { params: Promise<Params> },
): Promise<Response> {
  const { batchId } = await ctx.params;
  if (!isValidBatchId(batchId)) {
    return NextResponse.json({ error: "invalid batch id" }, { status: 400 });
  }
  const filePath = path.join(stagingRoot(), batchId, MANIFEST_FILENAME);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json(
        { error: "manifest not found" },
        { status: 404 },
      );
    }
    throw err;
  }

  const url = new URL(req.url);
  const wantsSummary = url.searchParams.get("summary") === "true";
  const offsetParam = parseNonNegativeInt(url.searchParams.get("offset"));
  const limitParam = parseNonNegativeInt(url.searchParams.get("limit"));
  const isPaginated = wantsSummary || offsetParam !== null || limitParam !== null;

  if (!isPaginated) {
    return new Response(raw, {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": FULL_MANIFEST_CACHE_CONTROL,
      },
    });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "manifest unreadable" },
      { status: 500 },
    );
  }
  const validated = BatchManifestSchema.safeParse(parsedJson);
  if (!validated.success) {
    return NextResponse.json({ error: "manifest invalid" }, { status: 500 });
  }
  const manifest = validated.data;
  const offset = offsetParam ?? 0;
  const requestedLimit = limitParam ?? DEFAULT_PAGE_LIMIT;
  const limit = Math.min(requestedLimit, MAX_PAGE_LIMIT);
  const slice = manifest.pages.slice(offset, offset + limit);
  const pages: ManifestPageSummary[] = slice.map((page) => ({
    title: page.title,
    filename: page.filename,
    aliases: page.aliases,
    source: page.source,
    sourcePages: page.sourcePages,
  }));
  const body: PaginatedSummaryResponse = {
    batchId: manifest.batchId,
    total: manifest.pages.length,
    offset,
    limit,
    pages,
  };
  return NextResponse.json(body, {
    headers: { "cache-control": SUMMARY_CACHE_CONTROL },
  });
}
