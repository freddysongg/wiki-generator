import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isValidBatchId } from "@/lib/batch-id";
import {
  BatchManifestSchema,
  MANIFEST_FILENAME,
} from "@/lib/pipeline/manifest";
import { stripPageChrome } from "@/lib/pipeline/strip-page-chrome";

export const runtime = "nodejs";

interface Params {
  batchId: string;
  filename: string;
}

function stagingRoot(): string {
  return process.env.WIKI_STAGING_DIR ?? path.join(process.cwd(), "staging");
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<Params> },
): Promise<Response> {
  const { batchId, filename } = await ctx.params;
  if (!isValidBatchId(batchId)) {
    return NextResponse.json({ error: "invalid batch id" }, { status: 400 });
  }
  const stagingDir = stagingRoot();
  const batchDir = path.join(stagingDir, batchId);

  let manifestRaw: string;
  try {
    manifestRaw = await readFile(
      path.join(batchDir, MANIFEST_FILENAME),
      "utf8",
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "batch not found" }, { status: 404 });
    }
    throw err;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(manifestRaw);
  } catch {
    return NextResponse.json({ error: "manifest unreadable" }, { status: 500 });
  }
  const manifest = BatchManifestSchema.safeParse(parsedJson);
  if (!manifest.success) {
    return NextResponse.json({ error: "manifest invalid" }, { status: 500 });
  }

  const isAllowed = manifest.data.pages.some((p) => p.filename === filename);
  if (!isAllowed) {
    return NextResponse.json({ error: "page not found" }, { status: 404 });
  }

  if (
    filename.includes("/") ||
    filename.includes("\\") ||
    filename.includes("\0")
  ) {
    return NextResponse.json({ error: "page not found" }, { status: 404 });
  }

  let pageRaw: string;
  try {
    pageRaw = await readFile(path.join(batchDir, filename), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "page not found" }, { status: 404 });
    }
    throw err;
  }

  const cleaned = stripPageChrome(pageRaw);
  return new Response(cleaned, {
    status: 200,
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}
