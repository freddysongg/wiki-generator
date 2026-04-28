import { mkdir, readdir, copyFile, access } from "node:fs/promises";
import path from "node:path";
import type { ImportResult } from "@/lib/types";

export interface ImportArgs {
  stagingDir: string;
  batchId: string;
  vaultPath: string;
  wikiSubfolder: string;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function resolveTarget(dir: string, filename: string): Promise<{ path: string; collided: boolean }> {
  const target = path.join(dir, filename);
  if (!(await exists(target))) return { path: target, collided: false };

  const ext = path.extname(filename);
  const stem = path.basename(filename, ext);
  for (let i = 1; i < 10000; i++) {
    const candidate = path.join(dir, `${stem} (${i})${ext}`);
    if (!(await exists(candidate))) return { path: candidate, collided: true };
  }
  throw new Error(`Could not resolve a non-conflicting filename for ${filename}`);
}

export async function importBatchToVault(args: ImportArgs): Promise<ImportResult> {
  const sourceDir = path.join(args.stagingDir, args.batchId);
  const targetDir = path.join(args.vaultPath, args.wikiSubfolder);
  await mkdir(targetDir, { recursive: true });

  const entries = await readdir(sourceDir, { withFileTypes: true });
  let imported = 0;
  let conflicts = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const { path: dest, collided } = await resolveTarget(targetDir, entry.name);
    await copyFile(path.join(sourceDir, entry.name), dest);
    imported += 1;
    if (collided) conflicts += 1;
  }
  return { imported, conflicts };
}
