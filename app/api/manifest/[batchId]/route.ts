import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { MANIFEST_FILENAME } from "@/lib/pipeline/manifest";
import { isValidBatchId } from "@/lib/batch-id";

export const runtime = "nodejs";

interface Params {
  batchId: string;
}

function stagingRoot(): string {
  return process.env.WIKI_STAGING_DIR ?? path.join(process.cwd(), "staging");
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<Params> },
): Promise<Response> {
  const { batchId } = await ctx.params;
  if (!isValidBatchId(batchId)) {
    return NextResponse.json({ error: "invalid batch id" }, { status: 400 });
  }
  const filePath = path.join(stagingRoot(), batchId, MANIFEST_FILENAME);
  try {
    const raw = await readFile(filePath, "utf8");
    return new Response(raw, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json(
        { error: "manifest not found" },
        { status: 404 },
      );
    }
    throw err;
  }
}
