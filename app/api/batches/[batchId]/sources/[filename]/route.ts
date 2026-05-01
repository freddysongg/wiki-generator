import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isValidBatchId } from "@/lib/batch-id";
import {
  BatchManifestSchema,
  MANIFEST_FILENAME,
} from "@/lib/pipeline/manifest";

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
  if (
    filename.includes("/") ||
    filename.includes("\\") ||
    filename.includes("\0")
  ) {
    return NextResponse.json({ error: "source not found" }, { status: 404 });
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

  const isAllowed = manifest.data.pages.some((p) => p.source === filename);
  if (!isAllowed) {
    return NextResponse.json({ error: "source not found" }, { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await readFile(path.join(batchDir, "sources", filename));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "source not found" }, { status: 404 });
    }
    throw err;
  }

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
