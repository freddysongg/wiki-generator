import { readdir } from "node:fs/promises";
import path from "node:path";

const EXCLUDED_DIRS = new Set([".obsidian", ".trash"]);

export async function scanVaultTitles(vaultPath: string): Promise<Set<string>> {
  const titles = new Set<string>();
  await walk(vaultPath, titles);
  return titles;
}

async function walk(dir: string, titles: Set<string>): Promise<void> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      await walk(path.join(dir, entry.name), titles);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      titles.add(entry.name.slice(0, -3));
    }
  }
}
