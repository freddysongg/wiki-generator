import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { importBatchToVault } from "@/lib/pipeline/import-to-vault";

let staging: string;
let vault: string;

beforeEach(async () => {
  staging = await mkdtemp(path.join(tmpdir(), "stg-"));
  vault = await mkdtemp(path.join(tmpdir(), "vlt-"));
});
afterEach(async () => {
  await rm(staging, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
});

async function seedStaging(batchId: string, files: Array<[string, string]>): Promise<void> {
  await mkdir(path.join(staging, batchId), { recursive: true });
  for (const [name, content] of files) {
    await writeFile(path.join(staging, batchId, name), content);
  }
}

describe("importBatchToVault", () => {
  it("copies all .md files to <vault>/<wikiSubfolder>/", async () => {
    await seedStaging("b1", [
      ["Backpropagation.md", "page A"],
      ["Gradient Descent.md", "page B"],
    ]);
    const result = await importBatchToVault({
      stagingDir: staging,
      batchId: "b1",
      vaultPath: vault,
      wikiSubfolder: "wiki",
    });
    expect(result.imported).toBe(2);
    expect(result.conflicts).toBe(0);
    const files = await readdir(path.join(vault, "wiki"));
    expect(files.sort()).toEqual(["Backpropagation.md", "Gradient Descent.md"]);
  });

  it("suffixes (1), (2) on collisions", async () => {
    await mkdir(path.join(vault, "wiki"));
    await writeFile(path.join(vault, "wiki", "Backpropagation.md"), "existing");
    await writeFile(path.join(vault, "wiki", "Backpropagation (1).md"), "existing");
    await seedStaging("b1", [["Backpropagation.md", "new"]]);

    const result = await importBatchToVault({
      stagingDir: staging,
      batchId: "b1",
      vaultPath: vault,
      wikiSubfolder: "wiki",
    });
    expect(result.imported).toBe(1);
    expect(result.conflicts).toBe(1);
    const files = await readdir(path.join(vault, "wiki"));
    expect(files.sort()).toEqual([
      "Backpropagation (1).md",
      "Backpropagation (2).md",
      "Backpropagation.md",
    ]);
    const written = await readFile(path.join(vault, "wiki", "Backpropagation (2).md"), "utf8");
    expect(written).toBe("new");
  });

  it("creates <vault>/<wikiSubfolder>/ if missing", async () => {
    await seedStaging("b1", [["Solo.md", "x"]]);
    await importBatchToVault({
      stagingDir: staging,
      batchId: "b1",
      vaultPath: vault,
      wikiSubfolder: "wiki",
    });
    const files = await readdir(path.join(vault, "wiki"));
    expect(files).toEqual(["Solo.md"]);
  });
});
