import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { titleToFilename } from "@/lib/slugify";
import type { GeneratedPage } from "@/lib/types";

export interface WriteStagingArgs {
  stagingDir: string;
  batchId: string;
  batchTimestamp: string;
  pages: GeneratedPage[];
}

function escapeYaml(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function renderPage(page: GeneratedPage, batchId: string, generatedAt: string): string {
  const sourceLine = `${page.sourceFilename}, ${page.sourcePages}`;
  const frontmatter = [
    "---",
    `title: ${page.title}`,
    `source: "${escapeYaml(sourceLine)}"`,
    `batch: ${batchId}`,
    `generated: ${generatedAt}`,
    "---",
  ].join("\n");
  return `${frontmatter}\n\n# ${page.title}\n\n${page.body.trim()}\n\n---\n*Source: ${sourceLine}*\n`;
}

export async function writeStaging(args: WriteStagingArgs): Promise<string[]> {
  const outDir = path.join(args.stagingDir, args.batchId);
  await mkdir(outDir, { recursive: true });
  const written: string[] = [];
  for (const page of args.pages) {
    const filename = titleToFilename(page.title);
    const filePath = path.join(outDir, filename);
    await writeFile(filePath, renderPage(page, args.batchId, args.batchTimestamp), "utf8");
    written.push(filePath);
  }
  return written;
}
