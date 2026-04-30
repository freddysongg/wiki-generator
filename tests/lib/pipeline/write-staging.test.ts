import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeStaging } from "@/lib/pipeline/write-staging";
import type { GeneratedPage } from "@/lib/types";

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "staging-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const samplePage = (title: string): GeneratedPage => ({
  title,
  body: "Body content with [[Other]] link.",
  sourcePages: "pp. 1-2",
  aliases: [],
  links: ["Other"],
  sourceFilename: "input.pdf",
});

describe("writeStaging", () => {
  it("writes one .md file per page with frontmatter", async () => {
    const pages = [
      samplePage("Backpropagation"),
      samplePage("Gradient Descent"),
    ];
    await writeStaging({
      stagingDir: dir,
      batchId: "b1",
      batchTimestamp: "2026-04-26T14:32:11Z",
      pages,
    });
    const files = await readdir(path.join(dir, "b1"));
    expect(files.sort()).toEqual(["Backpropagation.md", "Gradient Descent.md"]);
    const content = await readFile(
      path.join(dir, "b1", "Backpropagation.md"),
      "utf8",
    );
    expect(content).toMatch(/^---\n/);
    expect(content).toContain('title: "Backpropagation"');
    expect(content).toContain("aliases: []");
    expect(content).toContain("type: concept");
    expect(content).toContain('source: "input.pdf"');
    expect(content).toContain('sourcePages: "pp. 1-2"');
    expect(content).toContain('tags:\n  - "wiki-generator"');
    expect(content).toContain('batch: "b1"');
    expect(content).toContain('created: "2026-04-26T14:32:11Z"');
    expect(content).toContain("# Backpropagation");
    expect(content).toContain("Body content with [[Other]] link.");
    expect(content).toContain("*Source: input.pdf, pp. 1-2*");
  });

  it("renders aliases as a block list when present", async () => {
    const pages: GeneratedPage[] = [
      { ...samplePage("Backpropagation"), aliases: ["Backprop", "BP"] },
    ];
    await writeStaging({
      stagingDir: dir,
      batchId: "b1",
      batchTimestamp: "2026-04-26T00:00:00Z",
      pages,
    });
    const content = await readFile(
      path.join(dir, "b1", "Backpropagation.md"),
      "utf8",
    );
    expect(content).toContain('aliases:\n  - "Backprop"\n  - "BP"');
  });

  it("escapes double quotes in source for yaml safety", async () => {
    const pages: GeneratedPage[] = [
      { ...samplePage("X"), sourceFilename: 'weird"name.pdf' },
    ];
    await writeStaging({
      stagingDir: dir,
      batchId: "b1",
      batchTimestamp: "2026-04-26T00:00:00Z",
      pages,
    });
    const content = await readFile(path.join(dir, "b1", "X.md"), "utf8");
    expect(content).toContain('source: "weird\\"name.pdf"');
  });
});
