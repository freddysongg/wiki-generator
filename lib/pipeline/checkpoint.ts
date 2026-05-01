import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const CHECKPOINT_FILENAME = "_progress.json";

export const CheckpointEntrySchema = z.object({
  pdfId: z.string().min(1),
  ok: z.boolean(),
  pagesWritten: z.number().int().nonnegative(),
  finishedAt: z.string().min(1),
});

export const CheckpointSchema = z.object({
  batchId: z.string().min(1),
  entries: z.array(CheckpointEntrySchema),
});

export type CheckpointEntry = z.infer<typeof CheckpointEntrySchema>;
export type Checkpoint = z.infer<typeof CheckpointSchema>;

function checkpointPath(stagingDir: string, batchId: string): string {
  return path.join(stagingDir, batchId, CHECKPOINT_FILENAME);
}

const writeLocks: Map<string, Promise<unknown>> = new Map();

async function withFileLock<T>(
  filePath: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = writeLocks.get(filePath) ?? Promise.resolve();
  const current = previous.then(task, task);
  writeLocks.set(filePath, current);
  try {
    return await current;
  } finally {
    if (writeLocks.get(filePath) === current) {
      writeLocks.delete(filePath);
    }
  }
}

export async function loadCheckpoint(
  stagingDir: string,
  batchId: string,
): Promise<Checkpoint | null> {
  const filePath = checkpointPath(stagingDir, batchId);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      return null;
    }
    throw err;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `[checkpoint] failed to parse ${filePath}: ${message}\n`,
    );
    return null;
  }

  const result = CheckpointSchema.safeParse(parsedJson);
  if (!result.success) {
    process.stderr.write(
      `[checkpoint] invalid checkpoint at ${filePath}: ${result.error.message}\n`,
    );
    return null;
  }
  return result.data;
}

async function atomicWriteJson(
  filePath: string,
  payload: unknown,
): Promise<void> {
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmpPath, JSON.stringify(payload, null, 2), "utf8");
  await rename(tmpPath, filePath);
}

export async function markPdfDone(
  stagingDir: string,
  batchId: string,
  entry: CheckpointEntry,
): Promise<void> {
  const filePath = checkpointPath(stagingDir, batchId);
  await withFileLock(filePath, async () => {
    await mkdir(path.dirname(filePath), { recursive: true });
    const existing = await loadCheckpoint(stagingDir, batchId);
    const baseEntries = existing?.entries ?? [];
    const filtered = baseEntries.filter((e) => e.pdfId !== entry.pdfId);
    const next: Checkpoint = {
      batchId,
      entries: [...filtered, entry],
    };
    await atomicWriteJson(filePath, next);
  });
}
