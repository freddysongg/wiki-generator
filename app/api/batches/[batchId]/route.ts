import { NextResponse } from "next/server";
import { rm, stat } from "node:fs/promises";
import path from "node:path";
import { isValidBatchId } from "@/lib/batch-id";

export const runtime = "nodejs";

interface Params {
  batchId: string;
}

function stagingRoot(): string {
  return process.env.WIKI_STAGING_DIR ?? path.join(process.cwd(), "staging");
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<Params> },
): Promise<Response> {
  const { batchId } = await ctx.params;
  if (!isValidBatchId(batchId)) {
    return NextResponse.json({ error: "invalid batch id" }, { status: 400 });
  }
  const batchDir = path.join(stagingRoot(), batchId);
  try {
    const info = await stat(batchDir);
    if (!info.isDirectory()) {
      return NextResponse.json({ error: "batch not found" }, { status: 404 });
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "batch not found" }, { status: 404 });
    }
    throw err;
  }
  await rm(batchDir, { recursive: true, force: true });
  return NextResponse.json({ deleted: batchId });
}
