import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { scanVaultTitles } from "@/lib/pipeline/scan-vault";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "vault-"));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("scanVaultTitles", () => {
  it("returns set of titles from .md files recursively", async () => {
    await writeFile(path.join(dir, "Welcome.md"), "");
    await mkdir(path.join(dir, "wiki"));
    await writeFile(path.join(dir, "wiki", "Backpropagation.md"), "");
    await mkdir(path.join(dir, "notes"));
    await writeFile(path.join(dir, "notes", "Daily Note.md"), "");

    const titles = await scanVaultTitles(dir);
    expect(titles).toEqual(new Set(["Welcome", "Backpropagation", "Daily Note"]));
  });

  it("excludes .obsidian and .trash", async () => {
    await mkdir(path.join(dir, ".obsidian"));
    await writeFile(path.join(dir, ".obsidian", "Plugin.md"), "");
    await mkdir(path.join(dir, ".trash"));
    await writeFile(path.join(dir, ".trash", "Old.md"), "");
    await writeFile(path.join(dir, "Keep.md"), "");

    const titles = await scanVaultTitles(dir);
    expect(titles).toEqual(new Set(["Keep"]));
  });

  it("ignores non-md files", async () => {
    await writeFile(path.join(dir, "image.png"), "");
    await writeFile(path.join(dir, "Note.md"), "");
    const titles = await scanVaultTitles(dir);
    expect(titles).toEqual(new Set(["Note"]));
  });

  it("returns empty set when vault is empty", async () => {
    const titles = await scanVaultTitles(dir);
    expect(titles.size).toBe(0);
  });
});
