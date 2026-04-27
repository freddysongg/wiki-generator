import { NextResponse } from "next/server";
import path from "node:path";
import { access } from "node:fs/promises";
import { loadConfig } from "@/lib/config";
import { importBatchToVault } from "@/lib/pipeline/import-to-vault";
import { isValidBatchId } from "@/lib/batch-id";

export const runtime = "nodejs";

function stagingRoot(): string {
  return process.env.WIKI_STAGING_DIR ?? path.join(process.cwd(), "staging");
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ batchId: string }> },
): Promise<Response> {
  const { batchId } = await ctx.params;
  if (!isValidBatchId(batchId)) {
    return NextResponse.json({ error: "invalid batch id" }, { status: 400 });
  }
  const cfg = loadConfig();
  const stagingDir = stagingRoot();
  const batchDir = path.join(stagingDir, batchId);
  if (!(await exists(batchDir))) {
    return NextResponse.json({ error: "batch not found" }, { status: 404 });
  }
  try {
    const result = await importBatchToVault({
      stagingDir,
      batchId,
      vaultPath: cfg.vaultPath,
      wikiSubfolder: cfg.wikiSubfolder,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
