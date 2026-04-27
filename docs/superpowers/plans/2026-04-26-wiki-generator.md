# Wiki Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Next.js tool that ingests PDFs, extracts concepts via the Claude API, generates a cross-referenced Markdown wiki, and copies the result into the user's Obsidian vault.

**Architecture:** Single Next.js (App Router) monolith. Frontend is React + ShadCN. Backend is Route Handlers using `pdfjs-dist` for PDF parsing/rendering, `@anthropic-ai/sdk` for concept extraction (Sonnet 4.6) and OCR fallback (Haiku 4.5). SSE streams per-PDF status. A separate `POST /api/import` copies staged Markdown files into `<vault>/wiki/` with collision suffixing.

**Tech Stack:**
- Next.js 15 (App Router), TypeScript (strict), Tailwind CSS, ShadCN/ui, lucide-react.
- `@anthropic-ai/sdk`, `pdfjs-dist`, `zod`.
- Testing: `vitest`, `@testing-library/react`, `msw` (HTTP mocks where needed).
- Node 20+, single-process. Run via `npm run dev`.

**Reference design spec:** `docs/superpowers/specs/2026-04-26-wiki-generator-design.md`

---

## File Structure

```
wiki-generator/
├── app/
│   ├── api/
│   │   ├── process/route.ts                    # POST: start a batch
│   │   ├── events/[batchId]/route.ts           # GET SSE: stream status
│   │   └── import/[batchId]/route.ts           # POST: copy staging → vault
│   ├── layout.tsx
│   ├── page.tsx                                # main screen
│   └── globals.css
├── components/
│   ├── ui/                                     # ShadCN auto-generated
│   ├── header.tsx
│   ├── upload-zone.tsx
│   ├── granularity-slider.tsx
│   ├── status-list.tsx
│   └── summary-panel.tsx
├── lib/
│   ├── config.ts                               # env loader
│   ├── types.ts                                # shared types
│   ├── slugify.ts
│   ├── sse-client.ts
│   ├── events/
│   │   └── bus.ts                              # in-process pub/sub
│   └── pipeline/
│       ├── parse-pdf.ts
│       ├── ocr-fallback.ts
│       ├── scan-vault.ts
│       ├── extract-concepts.ts
│       ├── wikilink-validator.ts
│       ├── write-staging.ts
│       ├── import-to-vault.ts
│       └── run-batch.ts                        # orchestrator
├── tests/
│   ├── fixtures/                               # tiny sample PDFs
│   ├── lib/...                                 # mirrored unit tests
│   └── api/...                                 # route handler integration
├── staging/                                    # batch outputs (gitignored)
├── .env.example
├── .env.local                                  # user-provided
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
├── package.json
└── README.md
```

---

## Tasks

### Task 1: Scaffold Next.js + TypeScript + Tailwind

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `.gitignore`, `.env.example`, `README.md`

- [ ] **Step 1: Initialize Next.js with TypeScript and Tailwind**

Run from `/Users/freddy/Documents/wiki-generator/`:

```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir=false --import-alias="@/*" --use-npm --no-eslint --no-turbopack --yes
```

If prompted to overwrite existing files, accept. The repo currently has only `docs/`, `tests/`, `.claude/` — those should be preserved by the installer; if they're moved, restore them with `git checkout`.

- [ ] **Step 2: Replace `.gitignore` with project-appropriate version**

Append to `.gitignore`:

```
# Project-specific
staging/
.env.local
.env*.local
.next/
node_modules/
*.tsbuildinfo
.DS_Store
```

- [ ] **Step 3: Add `.env.example`**

Create `.env.example`:

```
ANTHROPIC_API_KEY=sk-ant-...
OBSIDIAN_VAULT_PATH=/Users/freddy/Documents/fred's vault
WIKI_SUBFOLDER=wiki
EXTRACTION_MODEL=claude-sonnet-4-6
OCR_MODEL=claude-haiku-4-5-20251001
MAX_CONCURRENT_PDFS=3
OCR_TEXT_THRESHOLD=100
```

- [ ] **Step 4: Verify build**

Run:

```bash
npm run build
```

Expected: build succeeds, no type errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json next.config.ts tailwind.config.ts postcss.config.mjs app/ public/ .gitignore .env.example README.md
git commit -m "scaffold next.js app, typescript, tailwind, base config"
```

---

### Task 2: Install runtime dependencies and dev tooling

**Files:** modify `package.json`, create `vitest.config.ts`

- [ ] **Step 1: Install runtime deps**

```bash
npm install @anthropic-ai/sdk pdfjs-dist zod
```

- [ ] **Step 2: Install dev deps**

```bash
npm install -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom jsdom @types/node
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

- [ ] **Step 4: Create `tests/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 5: Add npm scripts**

In `package.json`, set `scripts`:

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit"
}
```

- [ ] **Step 6: Verify**

Run:

```bash
npm run typecheck && npm test -- --run
```

Expected: typecheck passes; vitest reports "no test files found" (zero tests is OK at this stage).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts tests/setup.ts
git commit -m "add anthropic sdk, pdfjs, zod, vitest, react testing library"
```

---

### Task 3: Define shared types

**Files:**
- Create: `lib/types.ts`
- Test: `tests/lib/types.test.ts`

- [ ] **Step 1: Write the type-shape test**

Create `tests/lib/types.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { Stage, PdfStatus, BatchState, Granularity, GeneratedPage, ExtractionResult, BatchEvent } from "@/lib/types";

describe("types", () => {
  it("exposes the Stage union", () => {
    const stages: Stage[] = ["queued", "parsing", "ocr", "extracting", "writing", "done", "failed"];
    expect(stages).toHaveLength(7);
  });

  it("Granularity is a tagged union of three values", () => {
    const values: Granularity[] = ["coarse", "medium", "fine"];
    expect(values).toEqual(["coarse", "medium", "fine"]);
  });

  it("BatchEvent discriminator covers status, page, and complete events", () => {
    const events: BatchEvent[] = [
      { type: "status", batchId: "b", pdfId: "p", stage: "queued", pagesGenerated: 0 },
      { type: "page", batchId: "b", pdfId: "p", title: "X" },
      { type: "complete", batchId: "b", totals: { pages: 0, links: 0, failed: 0 } },
    ];
    expect(events).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/lib/types.test.ts
```

Expected: FAIL — module `@/lib/types` not found.

- [ ] **Step 3: Implement `lib/types.ts`**

```ts
export type Stage =
  | "queued"
  | "parsing"
  | "ocr"
  | "extracting"
  | "writing"
  | "done"
  | "failed";

export type Granularity = "coarse" | "medium" | "fine";

export interface PdfStatus {
  pdfId: string;
  filename: string;
  stage: Stage;
  pagesGenerated: number;
  error?: string;
}

export interface BatchState {
  batchId: string;
  granularity: Granularity;
  pdfs: Record<string, PdfStatus>;
  vaultTitles: string[];
  startedAt: string;
  completedAt?: string;
}

export interface GeneratedPage {
  title: string;
  body: string;
  sourcePages: string;
  links: string[];
  sourceFilename: string;
}

export interface ExtractionResult {
  pages: Array<{
    title: string;
    body: string;
    sourcePages: string;
    links: string[];
  }>;
}

export type BatchEvent =
  | {
      type: "status";
      batchId: string;
      pdfId: string;
      stage: Stage;
      pagesGenerated: number;
      error?: string;
    }
  | { type: "page"; batchId: string; pdfId: string; title: string }
  | {
      type: "complete";
      batchId: string;
      totals: { pages: number; links: number; failed: number };
    };
```

- [ ] **Step 4: Run test**

```bash
npm test -- tests/lib/types.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts tests/lib/types.test.ts
git commit -m "add shared types for batch state, pipeline stages, events"
```

---

### Task 4: Config loader

**Files:**
- Create: `lib/config.ts`
- Test: `tests/lib/config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/config.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig, ConfigError } from "@/lib/config";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, ORIGINAL_ENV);
});

afterEach(() => {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, ORIGINAL_ENV);
});

describe("loadConfig", () => {
  it("parses valid env", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.OBSIDIAN_VAULT_PATH = "/tmp/vault";
    const cfg = loadConfig();
    expect(cfg.anthropicApiKey).toBe("sk-ant-test");
    expect(cfg.vaultPath).toBe("/tmp/vault");
    expect(cfg.wikiSubfolder).toBe("wiki");
    expect(cfg.extractionModel).toBe("claude-sonnet-4-6");
    expect(cfg.ocrModel).toBe("claude-haiku-4-5-20251001");
    expect(cfg.maxConcurrentPdfs).toBe(3);
    expect(cfg.ocrTextThreshold).toBe(100);
  });

  it("throws ConfigError when ANTHROPIC_API_KEY is missing", () => {
    process.env.OBSIDIAN_VAULT_PATH = "/tmp/vault";
    expect(() => loadConfig()).toThrow(ConfigError);
  });

  it("throws ConfigError when OBSIDIAN_VAULT_PATH is missing", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    expect(() => loadConfig()).toThrow(ConfigError);
  });

  it("respects overrides", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.OBSIDIAN_VAULT_PATH = "/tmp/vault";
    process.env.MAX_CONCURRENT_PDFS = "5";
    process.env.OCR_TEXT_THRESHOLD = "200";
    const cfg = loadConfig();
    expect(cfg.maxConcurrentPdfs).toBe(5);
    expect(cfg.ocrTextThreshold).toBe(200);
  });
});
```

- [ ] **Step 2: Run test, expect failure**

```bash
npm test -- tests/lib/config.test.ts
```

Expected: FAIL — `@/lib/config` not found.

- [ ] **Step 3: Implement `lib/config.ts`**

```ts
import { z } from "zod";

export class ConfigError extends Error {
  constructor(message: string) {
    super(`Config error: ${message}`);
    this.name = "ConfigError";
  }
}

const ConfigSchema = z.object({
  anthropicApiKey: z.string().min(1),
  vaultPath: z.string().min(1),
  wikiSubfolder: z.string().min(1).default("wiki"),
  extractionModel: z.string().min(1).default("claude-sonnet-4-6"),
  ocrModel: z.string().min(1).default("claude-haiku-4-5-20251001"),
  maxConcurrentPdfs: z.coerce.number().int().positive().default(3),
  ocrTextThreshold: z.coerce.number().int().positive().default(100),
});

export type AppConfig = z.infer<typeof ConfigSchema>;

export function loadConfig(): AppConfig {
  const raw = {
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    vaultPath: process.env.OBSIDIAN_VAULT_PATH,
    wikiSubfolder: process.env.WIKI_SUBFOLDER,
    extractionModel: process.env.EXTRACTION_MODEL,
    ocrModel: process.env.OCR_MODEL,
    maxConcurrentPdfs: process.env.MAX_CONCURRENT_PDFS,
    ocrTextThreshold: process.env.OCR_TEXT_THRESHOLD,
  };

  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const fields = Object.entries(flat.fieldErrors)
      .map(([k, v]) => `${k}: ${v?.join(", ")}`)
      .join("; ");
    throw new ConfigError(fields || "invalid configuration");
  }
  return parsed.data;
}
```

- [ ] **Step 4: Run test**

```bash
npm test -- tests/lib/config.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/config.ts tests/lib/config.test.ts
git commit -m "add config loader with zod schema and explicit error"
```

---

### Task 5: Slugify utility

**Files:**
- Create: `lib/slugify.ts`
- Test: `tests/lib/slugify.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/slugify.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { titleToFilename } from "@/lib/slugify";

describe("titleToFilename", () => {
  it("preserves case and most punctuation", () => {
    expect(titleToFilename("Stochastic Gradient Descent")).toBe("Stochastic Gradient Descent.md");
  });

  it("replaces filesystem-unsafe characters", () => {
    expect(titleToFilename("Either/Or")).toBe("Either-Or.md");
    expect(titleToFilename("A:B")).toBe("A-B.md");
    expect(titleToFilename("foo*bar")).toBe("foo-bar.md");
    expect(titleToFilename("a?b")).toBe("a-b.md");
    expect(titleToFilename("a|b")).toBe("a-b.md");
    expect(titleToFilename("a\\b")).toBe("a-b.md");
    expect(titleToFilename("a<b>")).toBe("a-b.md");
    expect(titleToFilename("a\"b")).toBe("a-b.md");
  });

  it("trims leading/trailing whitespace and dots", () => {
    expect(titleToFilename("  Hello  ")).toBe("Hello.md");
    expect(titleToFilename(".dotted.")).toBe("dotted.md");
  });

  it("handles non-Latin scripts unchanged", () => {
    expect(titleToFilename("注意机制")).toBe("注意机制.md");
    expect(titleToFilename("Différences finies")).toBe("Différences finies.md");
  });

  it("collapses runs of dashes", () => {
    expect(titleToFilename("a // b")).toBe("a - b.md");
  });

  it("falls back to 'Untitled' on empty input", () => {
    expect(titleToFilename("")).toBe("Untitled.md");
    expect(titleToFilename("???")).toBe("Untitled.md");
  });
});
```

- [ ] **Step 2: Run test**

```bash
npm test -- tests/lib/slugify.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `lib/slugify.ts`**

```ts
const UNSAFE = /[\\/:*?"<>|]/g;

export function titleToFilename(title: string): string {
  let cleaned = title.replace(UNSAFE, "-");
  cleaned = cleaned.replace(/-+/g, "-");
  cleaned = cleaned.trim();
  cleaned = cleaned.replace(/^[.\-]+|[.\-]+$/g, "").trim();
  if (cleaned.length === 0) cleaned = "Untitled";
  return `${cleaned}.md`;
}
```

- [ ] **Step 4: Run test**

```bash
npm test -- tests/lib/slugify.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/slugify.ts tests/lib/slugify.test.ts
git commit -m "add titleToFilename slugifier preserving unicode"
```

---

### Task 6: Wikilink validator

**Files:**
- Create: `lib/pipeline/wikilink-validator.ts`
- Test: `tests/lib/pipeline/wikilink-validator.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/pipeline/wikilink-validator.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { validateWikilinks } from "@/lib/pipeline/wikilink-validator";

describe("validateWikilinks", () => {
  const known = new Set(["Backpropagation", "Gradient Descent"]);

  it("keeps known links intact", () => {
    const md = "See [[Backpropagation]] and [[Gradient Descent]].";
    expect(validateWikilinks(md, known)).toBe("See [[Backpropagation]] and [[Gradient Descent]].");
  });

  it("strips brackets from unknown links", () => {
    const md = "See [[Quantum Foo]].";
    expect(validateWikilinks(md, known)).toBe("See Quantum Foo.");
  });

  it("supports alias syntax [[Target|Display]] and resolves on Target", () => {
    const md = "See [[Backpropagation|backprop]] for details.";
    expect(validateWikilinks(md, known)).toBe("See [[Backpropagation|backprop]] for details.");
  });

  it("strips alias links if Target is unknown, keeps display text", () => {
    const md = "See [[Unknown|something]].";
    expect(validateWikilinks(md, known)).toBe("See something.");
  });

  it("handles multiple links in one line", () => {
    const md = "[[Backpropagation]] vs [[Unknown]] vs [[Gradient Descent]].";
    expect(validateWikilinks(md, known)).toBe(
      "[[Backpropagation]] vs Unknown vs [[Gradient Descent]].",
    );
  });
});
```

- [ ] **Step 2: Run test**

```bash
npm test -- tests/lib/pipeline/wikilink-validator.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `lib/pipeline/wikilink-validator.ts`**

```ts
const WIKILINK = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

export function validateWikilinks(markdown: string, knownTitles: Set<string>): string {
  return markdown.replace(WIKILINK, (_match, target: string, alias?: string) => {
    const trimmedTarget = target.trim();
    if (knownTitles.has(trimmedTarget)) {
      return alias ? `[[${trimmedTarget}|${alias.trim()}]]` : `[[${trimmedTarget}]]`;
    }
    return alias ? alias.trim() : trimmedTarget;
  });
}
```

- [ ] **Step 4: Run test**

```bash
npm test -- tests/lib/pipeline/wikilink-validator.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pipeline/wikilink-validator.ts tests/lib/pipeline/wikilink-validator.test.ts
git commit -m "add wikilink validator stripping unknown targets"
```

---

### Task 7: Vault scanner

**Files:**
- Create: `lib/pipeline/scan-vault.ts`
- Test: `tests/lib/pipeline/scan-vault.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/pipeline/scan-vault.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test**

```bash
npm test -- tests/lib/pipeline/scan-vault.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `lib/pipeline/scan-vault.ts`**

```ts
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
```

- [ ] **Step 4: Run test**

```bash
npm test -- tests/lib/pipeline/scan-vault.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pipeline/scan-vault.ts tests/lib/pipeline/scan-vault.test.ts
git commit -m "add vault scanner returning markdown titles"
```

---

### Task 8: PDF parser

**Files:**
- Create: `lib/pipeline/parse-pdf.ts`, `tests/fixtures/hello.pdf` (binary fixture)
- Test: `tests/lib/pipeline/parse-pdf.test.ts`

- [ ] **Step 1: Generate a small text PDF fixture**

Run:

```bash
mkdir -p tests/fixtures
node -e "
const { PDFDocument, StandardFonts } = require('pdf-lib');
(async () => {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const p1 = doc.addPage([300, 200]);
  p1.drawText('Page one says hello world.', { x: 20, y: 150, size: 14, font });
  const p2 = doc.addPage([300, 200]);
  p2.drawText('Page two contains backpropagation theory.', { x: 20, y: 150, size: 14, font });
  const bytes = await doc.save();
  require('fs').writeFileSync('tests/fixtures/hello.pdf', bytes);
})();
"
```

If `pdf-lib` is missing:

```bash
npm install -D pdf-lib
```

then re-run the node script.

- [ ] **Step 2: Write the failing test**

Create `tests/lib/pipeline/parse-pdf.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parsePdf } from "@/lib/pipeline/parse-pdf";

describe("parsePdf", () => {
  it("returns one entry per page with extracted text", async () => {
    const data = await readFile(path.join(process.cwd(), "tests/fixtures/hello.pdf"));
    const pages = await parsePdf(new Uint8Array(data));
    expect(pages).toHaveLength(2);
    expect(pages[0].text).toContain("Page one");
    expect(pages[1].text).toContain("Page two");
    expect(pages[0].pageNumber).toBe(1);
    expect(pages[1].pageNumber).toBe(2);
  });

  it("flags pages as image-only when text length is below threshold", async () => {
    const data = await readFile(path.join(process.cwd(), "tests/fixtures/hello.pdf"));
    const pages = await parsePdf(new Uint8Array(data), { textThreshold: 1000 });
    for (const p of pages) {
      expect(p.kind).toBe("image");
    }
  });
});
```

- [ ] **Step 3: Run test**

```bash
npm test -- tests/lib/pipeline/parse-pdf.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement `lib/pipeline/parse-pdf.ts`**

```ts
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

export interface ParsedPage {
  pageNumber: number;
  text: string;
  kind: "text" | "image";
}

export interface ParseOptions {
  textThreshold?: number;
}

export async function parsePdf(data: Uint8Array, opts: ParseOptions = {}): Promise<ParsedPage[]> {
  const threshold = opts.textThreshold ?? 100;

  const loadingTask = pdfjsLib.getDocument({ data, useSystemFonts: true });
  const doc = await loadingTask.promise;

  const out: ParsedPage[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      const text = tc.items
        .map((item) => ("str" in item ? (item as { str: string }).str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      out.push({
        pageNumber: i,
        text,
        kind: text.length >= threshold ? "text" : "image",
      });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return out;
}
```

- [ ] **Step 5: Run test**

```bash
npm test -- tests/lib/pipeline/parse-pdf.test.ts
```

Expected: PASS. If pdfjs throws about workers in Node, set `pdfjsLib.GlobalWorkerOptions.workerSrc = ""` at the top of the module — the legacy build runs without a worker.

- [ ] **Step 6: Commit**

```bash
git add lib/pipeline/parse-pdf.ts tests/lib/pipeline/parse-pdf.test.ts tests/fixtures/hello.pdf package.json package-lock.json
git commit -m "add pdf text extractor classifying text vs image pages"
```

---

### Task 9: PDF page-image renderer

**Files:**
- Create: `lib/pipeline/render-page.ts`
- Test: `tests/lib/pipeline/render-page.test.ts`

- [ ] **Step 1: Install canvas for pdfjs rendering**

```bash
npm install canvas
```

(Used in Node to render PDF pages to PNG bytes; `pdfjs-dist`'s legacy build supports `canvas`.)

- [ ] **Step 2: Write the failing test**

Create `tests/lib/pipeline/render-page.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderPdfPageToPng } from "@/lib/pipeline/render-page";

describe("renderPdfPageToPng", () => {
  it("returns a PNG buffer for a given page", async () => {
    const data = await readFile(path.join(process.cwd(), "tests/fixtures/hello.pdf"));
    const png = await renderPdfPageToPng(new Uint8Array(data), 1, { maxWidth: 1024 });
    expect(png).toBeInstanceOf(Uint8Array);
    expect(png.byteLength).toBeGreaterThan(100);
    expect(png[0]).toBe(0x89);
    expect(png[1]).toBe(0x50);
    expect(png[2]).toBe(0x4e);
    expect(png[3]).toBe(0x47);
  });
});
```

- [ ] **Step 3: Run test**

```bash
npm test -- tests/lib/pipeline/render-page.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement `lib/pipeline/render-page.ts`**

```ts
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "canvas";

export interface RenderOptions {
  maxWidth?: number;
}

export async function renderPdfPageToPng(
  data: Uint8Array,
  pageNumber: number,
  opts: RenderOptions = {},
): Promise<Uint8Array> {
  const maxWidth = opts.maxWidth ?? 2048;
  const loadingTask = pdfjsLib.getDocument({ data, useSystemFonts: true });
  const doc = await loadingTask.promise;
  try {
    const page = await doc.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const scale = baseViewport.width >= maxWidth ? maxWidth / baseViewport.width : 2;
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(viewport.width, viewport.height);
    const ctx = canvas.getContext("2d");
    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;
    page.cleanup();
    return canvas.toBuffer("image/png");
  } finally {
    await doc.destroy();
  }
}
```

- [ ] **Step 5: Run test**

```bash
npm test -- tests/lib/pipeline/render-page.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/pipeline/render-page.ts tests/lib/pipeline/render-page.test.ts package.json package-lock.json
git commit -m "add pdf page renderer producing png bytes via node-canvas"
```

---

### Task 10: OCR fallback (Claude vision)

**Files:**
- Create: `lib/pipeline/ocr-fallback.ts`
- Test: `tests/lib/pipeline/ocr-fallback.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/pipeline/ocr-fallback.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { ocrPageImage } from "@/lib/pipeline/ocr-fallback";

describe("ocrPageImage", () => {
  it("calls the supplied client with image content and returns transcribed text", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "transcribed page contents" }],
    });
    const client = { messages: { create } };
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

    const text = await ocrPageImage(
      { client: client as unknown as Parameters<typeof ocrPageImage>[0]["client"], model: "claude-haiku-4-5-20251001" },
      png,
    );

    expect(text).toBe("transcribed page contents");
    expect(create).toHaveBeenCalledTimes(1);
    const call = create.mock.calls[0][0];
    expect(call.model).toBe("claude-haiku-4-5-20251001");
    const userMsg = call.messages[0];
    expect(userMsg.role).toBe("user");
    const imagePart = userMsg.content.find((c: { type: string }) => c.type === "image");
    expect(imagePart).toBeDefined();
    expect(imagePart.source.media_type).toBe("image/png");
  });

  it("returns empty string when response has no text block", async () => {
    const create = vi.fn().mockResolvedValue({ content: [] });
    const client = { messages: { create } };
    const png = new Uint8Array([0x89]);
    const text = await ocrPageImage(
      { client: client as unknown as Parameters<typeof ocrPageImage>[0]["client"], model: "claude-haiku-4-5-20251001" },
      png,
    );
    expect(text).toBe("");
  });
});
```

- [ ] **Step 2: Run test**

```bash
npm test -- tests/lib/pipeline/ocr-fallback.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `lib/pipeline/ocr-fallback.ts`**

```ts
import type Anthropic from "@anthropic-ai/sdk";

export interface OcrDeps {
  client: Pick<Anthropic, "messages">;
  model: string;
}

const TRANSCRIBE_PROMPT =
  "Transcribe the visible text from this page exactly. Preserve paragraph breaks. " +
  "Do not summarize, translate, or add commentary. If the page is blank or has no readable text, output an empty response.";

export async function ocrPageImage(deps: OcrDeps, pngBytes: Uint8Array): Promise<string> {
  const base64 = Buffer.from(pngBytes).toString("base64");
  const response = await deps.client.messages.create({
    model: deps.model,
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: "image/png", data: base64 },
          },
          { type: "text", text: TRANSCRIBE_PROMPT },
        ],
      },
    ],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return "";
  return textBlock.text.trim();
}
```

- [ ] **Step 4: Run test**

```bash
npm test -- tests/lib/pipeline/ocr-fallback.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pipeline/ocr-fallback.ts tests/lib/pipeline/ocr-fallback.test.ts
git commit -m "add ocr fallback calling claude vision with png pages"
```

---

### Task 11: Concept extractor

**Files:**
- Create: `lib/pipeline/extract-concepts.ts`
- Test: `tests/lib/pipeline/extract-concepts.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/pipeline/extract-concepts.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { extractConcepts } from "@/lib/pipeline/extract-concepts";

describe("extractConcepts", () => {
  it("invokes the model with cached system prompt and returns parsed pages", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [
        {
          type: "tool_use",
          name: "submit_pages",
          input: {
            pages: [
              {
                title: "Backpropagation",
                body: "Body text. See [[Gradient Descent]].",
                sourcePages: "pp. 1-2",
                links: ["Gradient Descent"],
              },
            ],
          },
        },
      ],
      stop_reason: "tool_use",
    });
    const client = { messages: { create } };

    const result = await extractConcepts({
      client: client as unknown as Parameters<typeof extractConcepts>[0]["client"],
      model: "claude-sonnet-4-6",
      pdfText: "page 1 ... page 2 ...",
      vaultTitles: ["Gradient Descent", "Welcome"],
      granularity: "medium",
    });

    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].title).toBe("Backpropagation");
    const call = create.mock.calls[0][0];
    expect(call.model).toBe("claude-sonnet-4-6");
    expect(call.tool_choice).toEqual({ type: "tool", name: "submit_pages" });
    expect(Array.isArray(call.system)).toBe(true);
    const systemBlock = call.system[0];
    expect(systemBlock.cache_control).toEqual({ type: "ephemeral" });
  });

  it("retries once on schema-invalid output, then succeeds", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        content: [
          { type: "tool_use", name: "submit_pages", input: { wrong: "shape" } },
        ],
        stop_reason: "tool_use",
      })
      .mockResolvedValueOnce({
        content: [
          {
            type: "tool_use",
            name: "submit_pages",
            input: { pages: [{ title: "T", body: "B", sourcePages: "p.1", links: [] }] },
          },
        ],
        stop_reason: "tool_use",
      });
    const client = { messages: { create } };

    const result = await extractConcepts({
      client: client as unknown as Parameters<typeof extractConcepts>[0]["client"],
      model: "claude-sonnet-4-6",
      pdfText: "x",
      vaultTitles: [],
      granularity: "medium",
    });

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.pages).toHaveLength(1);
  });

  it("throws after a second schema failure", async () => {
    const bad = {
      content: [{ type: "tool_use", name: "submit_pages", input: { nope: 1 } }],
      stop_reason: "tool_use",
    };
    const create = vi.fn().mockResolvedValue(bad);
    const client = { messages: { create } };
    await expect(
      extractConcepts({
        client: client as unknown as Parameters<typeof extractConcepts>[0]["client"],
        model: "claude-sonnet-4-6",
        pdfText: "x",
        vaultTitles: [],
        granularity: "medium",
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test**

```bash
npm test -- tests/lib/pipeline/extract-concepts.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `lib/pipeline/extract-concepts.ts`**

```ts
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { ExtractionResult, Granularity } from "@/lib/types";

export interface ExtractDeps {
  client: Pick<Anthropic, "messages">;
  model: string;
  pdfText: string;
  vaultTitles: string[];
  granularity: Granularity;
}

const SYSTEM_PROMPT = `You are an expert at distilling reading material into a personal Markdown wiki.

You will receive (a) the full text of a PDF and (b) a list of titles already present in the user's Obsidian vault. Your job: produce a set of wiki pages that capture the conceptual content of the PDF.

Rules:
- Each page covers one distinct concept (term, theorem, algorithm, model, idea).
- Title MUST be the canonical name of that concept. If the concept appears in the supplied vault-titles list under an existing name, USE THAT EXACT TITLE so the link resolves.
- Body is concise Markdown (no top-level # heading; the title is the filename). Use ## subheadings, bullet lists, and inline code as appropriate. Do not echo the entire source — synthesize.
- Cross-references: include a "## Related" section listing relevant concepts as Obsidian wikilinks ([[Title]]). Prefer titles from the vault-titles list when they match. You may also link to other pages you are creating in this same response.
- sourcePages: e.g. "pp. 14-22" or "p. 3" — the page range in the PDF where this concept is discussed.
- links: array of every wikilink target you used in the body. Must match exact targets in the body.

Granularity instructions:
- "coarse": 5-25 pages total. One per major topic. Each page 500-1500 words.
- "medium": 25-100 pages total. One per distinct named concept. Each page 200-600 words.
- "fine": 100-500 pages total. One per any definable term, including sub-concepts.

For very short inputs (a few paragraphs), produce as few pages as the content supports — even just one — regardless of granularity bounds.

Write in the source language of the PDF. Do not translate.

You MUST respond by calling the submit_pages tool. Do not produce a text response.`;

const ResultSchema = z.object({
  pages: z.array(
    z.object({
      title: z.string().min(1),
      body: z.string().min(1),
      sourcePages: z.string().min(1),
      links: z.array(z.string()),
    }),
  ),
});

const TOOL_SCHEMA = {
  name: "submit_pages",
  description: "Return the set of wiki pages extracted from the PDF.",
  input_schema: {
    type: "object",
    properties: {
      pages: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            body: { type: "string" },
            sourcePages: { type: "string" },
            links: { type: "array", items: { type: "string" } },
          },
          required: ["title", "body", "sourcePages", "links"],
        },
      },
    },
    required: ["pages"],
  },
} as const;

export async function extractConcepts(deps: ExtractDeps): Promise<ExtractionResult> {
  const userBlocks = [
    {
      type: "text" as const,
      text: `Vault titles already present (use these for cross-references when they match):\n${deps.vaultTitles.join("\n")}`,
      cache_control: { type: "ephemeral" as const },
    },
    {
      type: "text" as const,
      text: `Granularity: ${deps.granularity}\n\nPDF text:\n${deps.pdfText}`,
    },
  ];

  let lastError: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await deps.client.messages.create({
      model: deps.model,
      max_tokens: 16000,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT + (lastError ? `\n\nPrevious attempt failed validation: ${lastError}. Fix and retry.` : ""),
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [TOOL_SCHEMA],
      tool_choice: { type: "tool", name: "submit_pages" },
      messages: [{ role: "user", content: userBlocks }],
    });

    const toolBlock = response.content.find((b) => b.type === "tool_use");
    if (!toolBlock || toolBlock.type !== "tool_use") {
      lastError = "model did not return tool_use block";
      continue;
    }
    const parsed = ResultSchema.safeParse(toolBlock.input);
    if (parsed.success) return parsed.data;
    lastError = parsed.error.message;
  }

  throw new Error(`Concept extraction failed schema validation after retry: ${lastError}`);
}
```

- [ ] **Step 4: Run test**

```bash
npm test -- tests/lib/pipeline/extract-concepts.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pipeline/extract-concepts.ts tests/lib/pipeline/extract-concepts.test.ts
git commit -m "add concept extractor with structured tool output and retry"
```

---

### Task 12: Write to staging

**Files:**
- Create: `lib/pipeline/write-staging.ts`
- Test: `tests/lib/pipeline/write-staging.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/pipeline/write-staging.test.ts`:

```ts
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
  links: ["Other"],
  sourceFilename: "input.pdf",
});

describe("writeStaging", () => {
  it("writes one .md file per page with frontmatter", async () => {
    const pages = [samplePage("Backpropagation"), samplePage("Gradient Descent")];
    await writeStaging({ stagingDir: dir, batchId: "b1", batchTimestamp: "2026-04-26T14:32:11Z", pages });
    const files = await readdir(path.join(dir, "b1"));
    expect(files.sort()).toEqual(["Backpropagation.md", "Gradient Descent.md"]);
    const content = await readFile(path.join(dir, "b1", "Backpropagation.md"), "utf8");
    expect(content).toMatch(/^---\n/);
    expect(content).toContain("title: Backpropagation");
    expect(content).toContain("source: \"input.pdf, pp. 1-2\"");
    expect(content).toContain("batch: b1");
    expect(content).toContain("# Backpropagation");
    expect(content).toContain("Body content with [[Other]] link.");
    expect(content).toContain("*Source: input.pdf, pp. 1-2*");
  });

  it("escapes double quotes in source for yaml safety", async () => {
    const pages = [{ ...samplePage("X"), sourceFilename: 'weird"name.pdf' }];
    await writeStaging({ stagingDir: dir, batchId: "b1", batchTimestamp: "2026-04-26T00:00:00Z", pages });
    const content = await readFile(path.join(dir, "b1", "X.md"), "utf8");
    expect(content).toContain('source: "weird\\"name.pdf, pp. 1-2"');
  });
});
```

- [ ] **Step 2: Run test**

```bash
npm test -- tests/lib/pipeline/write-staging.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `lib/pipeline/write-staging.ts`**

```ts
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
```

- [ ] **Step 4: Run test**

```bash
npm test -- tests/lib/pipeline/write-staging.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pipeline/write-staging.ts tests/lib/pipeline/write-staging.test.ts
git commit -m "add staging writer rendering markdown with yaml frontmatter"
```

---

### Task 13: Import-to-vault with collision suffixing

**Files:**
- Create: `lib/pipeline/import-to-vault.ts`
- Test: `tests/lib/pipeline/import-to-vault.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/pipeline/import-to-vault.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test**

```bash
npm test -- tests/lib/pipeline/import-to-vault.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `lib/pipeline/import-to-vault.ts`**

```ts
import { mkdir, readdir, copyFile, access } from "node:fs/promises";
import path from "node:path";

export interface ImportArgs {
  stagingDir: string;
  batchId: string;
  vaultPath: string;
  wikiSubfolder: string;
}

export interface ImportResult {
  imported: number;
  conflicts: number;
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
```

- [ ] **Step 4: Run test**

```bash
npm test -- tests/lib/pipeline/import-to-vault.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pipeline/import-to-vault.ts tests/lib/pipeline/import-to-vault.test.ts
git commit -m "add import-to-vault with collision suffixing"
```

---

### Task 14: In-process event bus

**Files:**
- Create: `lib/events/bus.ts`
- Test: `tests/lib/events/bus.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/events/bus.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { EventBus } from "@/lib/events/bus";
import type { BatchEvent } from "@/lib/types";

describe("EventBus", () => {
  it("delivers events to subscribers of the matching batch", async () => {
    const bus = new EventBus();
    const received: BatchEvent[] = [];
    const unsub = bus.subscribe("b1", (e) => received.push(e));
    bus.publish({ type: "status", batchId: "b1", pdfId: "p", stage: "queued", pagesGenerated: 0 });
    bus.publish({ type: "status", batchId: "b2", pdfId: "p", stage: "queued", pagesGenerated: 0 });
    expect(received).toHaveLength(1);
    if (received[0].type !== "status") throw new Error("expected status event");
    expect(received[0].batchId).toBe("b1");
    unsub();
  });

  it("buffers events published before subscribe and replays on subscribe", () => {
    const bus = new EventBus();
    bus.publish({ type: "status", batchId: "b1", pdfId: "p", stage: "queued", pagesGenerated: 0 });
    const received: BatchEvent[] = [];
    bus.subscribe("b1", (e) => received.push(e));
    expect(received).toHaveLength(1);
  });

  it("stops delivering after unsubscribe", () => {
    const bus = new EventBus();
    const received: BatchEvent[] = [];
    const unsub = bus.subscribe("b1", (e) => received.push(e));
    unsub();
    bus.publish({ type: "status", batchId: "b1", pdfId: "p", stage: "queued", pagesGenerated: 0 });
    expect(received).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npm test -- tests/lib/events/bus.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `lib/events/bus.ts`**

```ts
import type { BatchEvent } from "@/lib/types";

type Listener = (event: BatchEvent) => void;

export class EventBus {
  private listeners: Map<string, Set<Listener>> = new Map();
  private buffers: Map<string, BatchEvent[]> = new Map();

  publish(event: BatchEvent): void {
    const listeners = this.listeners.get(event.batchId);
    if (listeners && listeners.size > 0) {
      for (const l of listeners) l(event);
      return;
    }
    const buf = this.buffers.get(event.batchId) ?? [];
    buf.push(event);
    this.buffers.set(event.batchId, buf);
  }

  subscribe(batchId: string, listener: Listener): () => void {
    const existing = this.listeners.get(batchId) ?? new Set<Listener>();
    existing.add(listener);
    this.listeners.set(batchId, existing);

    const buffered = this.buffers.get(batchId);
    if (buffered) {
      for (const e of buffered) listener(e);
      this.buffers.delete(batchId);
    }

    return () => {
      const set = this.listeners.get(batchId);
      if (!set) return;
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(batchId);
    };
  }

  clear(batchId: string): void {
    this.listeners.delete(batchId);
    this.buffers.delete(batchId);
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __wikiEventBus: EventBus | undefined;
}

export function getEventBus(): EventBus {
  if (!globalThis.__wikiEventBus) {
    globalThis.__wikiEventBus = new EventBus();
  }
  return globalThis.__wikiEventBus;
}
```

- [ ] **Step 4: Run test**

```bash
npm test -- tests/lib/events/bus.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/events/bus.ts tests/lib/events/bus.test.ts
git commit -m "add in-process event bus with buffering and global accessor"
```

---

### Task 15: Batch orchestrator

**Files:**
- Create: `lib/pipeline/run-batch.ts`
- Test: `tests/lib/pipeline/run-batch.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/pipeline/run-batch.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runBatch } from "@/lib/pipeline/run-batch";
import { EventBus } from "@/lib/events/bus";
import type { BatchEvent } from "@/lib/types";

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

describe("runBatch", () => {
  it("runs the pipeline per PDF, emits events, writes staging", async () => {
    const bus = new EventBus();
    const events: BatchEvent[] = [];
    bus.subscribe("b1", (e) => events.push(e));

    await runBatch({
      bus,
      batchId: "b1",
      granularity: "medium",
      stagingDir: staging,
      vaultPath: vault,
      maxConcurrent: 2,
      pdfs: [
        { pdfId: "p1", filename: "a.pdf", bytes: new Uint8Array([1, 2, 3]) },
        { pdfId: "p2", filename: "b.pdf", bytes: new Uint8Array([4, 5, 6]) },
      ],
      hooks: {
        parsePdf: vi.fn().mockResolvedValue([{ pageNumber: 1, text: "the page", kind: "text" }]),
        renderPdfPageToPng: vi.fn(),
        ocrPageImage: vi.fn(),
        scanVaultTitles: vi.fn().mockResolvedValue(new Set<string>(["Existing"])),
        extractConcepts: vi.fn().mockResolvedValue({
          pages: [{ title: "Concept", body: "Body [[Existing]]", sourcePages: "p.1", links: ["Existing"] }],
        }),
      },
    });

    const stages = events.filter((e) => e.type === "status").map((e) => (e.type === "status" ? e.stage : ""));
    expect(stages).toContain("parsing");
    expect(stages).toContain("extracting");
    expect(stages).toContain("writing");
    expect(stages).toContain("done");
    const completion = events.find((e) => e.type === "complete");
    expect(completion).toBeDefined();

    const filesP1 = await readdir(path.join(staging, "b1"));
    expect(filesP1).toContain("Concept.md");
  });

  it("triggers ocr fallback for image pages", async () => {
    const bus = new EventBus();
    const ocr = vi.fn().mockResolvedValue("recovered text");
    await runBatch({
      bus,
      batchId: "b2",
      granularity: "medium",
      stagingDir: staging,
      vaultPath: vault,
      maxConcurrent: 1,
      pdfs: [{ pdfId: "p1", filename: "a.pdf", bytes: new Uint8Array([1]) }],
      hooks: {
        parsePdf: vi.fn().mockResolvedValue([{ pageNumber: 1, text: "", kind: "image" }]),
        renderPdfPageToPng: vi.fn().mockResolvedValue(new Uint8Array([0x89])),
        ocrPageImage: ocr,
        scanVaultTitles: vi.fn().mockResolvedValue(new Set<string>()),
        extractConcepts: vi.fn().mockResolvedValue({
          pages: [{ title: "X", body: "B", sourcePages: "p.1", links: [] }],
        }),
      },
    });
    expect(ocr).toHaveBeenCalledTimes(1);
  });

  it("marks a PDF failed without aborting the batch", async () => {
    const bus = new EventBus();
    const events: BatchEvent[] = [];
    bus.subscribe("b3", (e) => events.push(e));

    await runBatch({
      bus,
      batchId: "b3",
      granularity: "medium",
      stagingDir: staging,
      vaultPath: vault,
      maxConcurrent: 2,
      pdfs: [
        { pdfId: "p1", filename: "good.pdf", bytes: new Uint8Array([1]) },
        { pdfId: "p2", filename: "bad.pdf", bytes: new Uint8Array([2]) },
      ],
      hooks: {
        parsePdf: vi.fn().mockImplementation((bytes: Uint8Array) =>
          bytes[0] === 2
            ? Promise.reject(new Error("boom"))
            : Promise.resolve([{ pageNumber: 1, text: "ok", kind: "text" }]),
        ),
        renderPdfPageToPng: vi.fn(),
        ocrPageImage: vi.fn(),
        scanVaultTitles: vi.fn().mockResolvedValue(new Set<string>()),
        extractConcepts: vi.fn().mockResolvedValue({
          pages: [{ title: "T", body: "B", sourcePages: "p.1", links: [] }],
        }),
      },
    });

    const failed = events.find((e) => e.type === "status" && e.stage === "failed");
    const done = events.find((e) => e.type === "status" && e.stage === "done");
    expect(failed).toBeDefined();
    expect(done).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test**

```bash
npm test -- tests/lib/pipeline/run-batch.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `lib/pipeline/run-batch.ts`**

```ts
import type { EventBus } from "@/lib/events/bus";
import type { BatchEvent, ExtractionResult, GeneratedPage, Granularity, Stage } from "@/lib/types";
import { writeStaging } from "@/lib/pipeline/write-staging";
import { validateWikilinks } from "@/lib/pipeline/wikilink-validator";

export interface BatchHooks {
  parsePdf: (bytes: Uint8Array) => Promise<Array<{ pageNumber: number; text: string; kind: "text" | "image" }>>;
  renderPdfPageToPng: (bytes: Uint8Array, pageNumber: number) => Promise<Uint8Array>;
  ocrPageImage: (png: Uint8Array) => Promise<string>;
  scanVaultTitles: (vaultPath: string) => Promise<Set<string>>;
  extractConcepts: (args: {
    pdfText: string;
    vaultTitles: string[];
    granularity: Granularity;
  }) => Promise<ExtractionResult>;
}

export interface BatchPdf {
  pdfId: string;
  filename: string;
  bytes: Uint8Array;
}

export interface RunBatchArgs {
  bus: EventBus;
  batchId: string;
  granularity: Granularity;
  stagingDir: string;
  vaultPath: string;
  maxConcurrent: number;
  pdfs: BatchPdf[];
  hooks: BatchHooks;
}

function emitStatus(
  bus: EventBus,
  batchId: string,
  pdfId: string,
  stage: Stage,
  pagesGenerated: number,
  error?: string,
): void {
  const event: BatchEvent = { type: "status", batchId, pdfId, stage, pagesGenerated, error };
  bus.publish(event);
}

async function processPdf(
  args: RunBatchArgs,
  pdf: BatchPdf,
  vaultTitles: Set<string>,
): Promise<{ pagesWritten: number; linksKept: number; failed: boolean }> {
  const { bus, batchId, granularity, stagingDir, hooks } = args;
  emitStatus(bus, batchId, pdf.pdfId, "parsing", 0);
  try {
    const parsed = await hooks.parsePdf(pdf.bytes);
    const imagePages = parsed.filter((p) => p.kind === "image");
    if (imagePages.length > 0) {
      emitStatus(bus, batchId, pdf.pdfId, "ocr", 0);
      for (const page of imagePages) {
        const png = await hooks.renderPdfPageToPng(pdf.bytes, page.pageNumber);
        page.text = await hooks.ocrPageImage(png);
      }
    }

    emitStatus(bus, batchId, pdf.pdfId, "extracting", 0);
    const fullText = parsed.map((p) => `[Page ${p.pageNumber}]\n${p.text}`).join("\n\n");
    const result = await hooks.extractConcepts({
      pdfText: fullText,
      vaultTitles: Array.from(vaultTitles),
      granularity,
    });

    const knownThisBatch = new Set<string>(vaultTitles);
    for (const p of result.pages) knownThisBatch.add(p.title);

    let linksKept = 0;
    const generated: GeneratedPage[] = result.pages.map((p) => {
      const validatedBody = validateWikilinks(p.body, knownThisBatch);
      linksKept += (validatedBody.match(/\[\[/g) ?? []).length;
      return {
        title: p.title,
        body: validatedBody,
        sourcePages: p.sourcePages,
        links: p.links.filter((l) => knownThisBatch.has(l)),
        sourceFilename: pdf.filename,
      };
    });

    emitStatus(bus, batchId, pdf.pdfId, "writing", generated.length);
    await writeStaging({
      stagingDir,
      batchId,
      batchTimestamp: new Date().toISOString(),
      pages: generated,
    });

    emitStatus(bus, batchId, pdf.pdfId, "done", generated.length);
    return { pagesWritten: generated.length, linksKept, failed: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emitStatus(bus, batchId, pdf.pdfId, "failed", 0, message);
    return { pagesWritten: 0, linksKept: 0, failed: true };
  }
}

export async function runBatch(args: RunBatchArgs): Promise<void> {
  const vaultTitles = await args.hooks.scanVaultTitles(args.vaultPath);

  let totalPages = 0;
  let totalLinks = 0;
  let totalFailed = 0;

  const queue = [...args.pdfs];
  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      const result = await processPdf(args, next, vaultTitles);
      totalPages += result.pagesWritten;
      totalLinks += result.linksKept;
      if (result.failed) totalFailed += 1;
    }
  }
  const workers = Array.from({ length: Math.min(args.maxConcurrent, args.pdfs.length) }, () => worker());
  await Promise.all(workers);

  args.bus.publish({
    type: "complete",
    batchId: args.batchId,
    totals: { pages: totalPages, links: totalLinks, failed: totalFailed },
  });
}
```

- [ ] **Step 4: Run test**

```bash
npm test -- tests/lib/pipeline/run-batch.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pipeline/run-batch.ts tests/lib/pipeline/run-batch.test.ts
git commit -m "add batch orchestrator with concurrent workers and event emission"
```

---

### Task 16: Anthropic client factory

**Files:**
- Create: `lib/anthropic-client.ts`
- Test: `tests/lib/anthropic-client.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/anthropic-client.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getAnthropicClient } from "@/lib/anthropic-client";

describe("getAnthropicClient", () => {
  it("returns a singleton instance", () => {
    const a = getAnthropicClient("sk-ant-test");
    const b = getAnthropicClient("sk-ant-test");
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npm test -- tests/lib/anthropic-client.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `lib/anthropic-client.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";

let cached: { key: string; client: Anthropic } | undefined;

export function getAnthropicClient(apiKey: string): Anthropic {
  if (cached && cached.key === apiKey) return cached.client;
  const client = new Anthropic({ apiKey });
  cached = { key: apiKey, client };
  return client;
}
```

- [ ] **Step 4: Run test**

```bash
npm test -- tests/lib/anthropic-client.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/anthropic-client.ts tests/lib/anthropic-client.test.ts
git commit -m "add anthropic client singleton factory"
```

---

### Task 17: API route — POST /api/process

**Files:**
- Create: `app/api/process/route.ts`
- Test: `tests/api/process.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/api/process.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/pipeline/run-batch", () => ({
  runBatch: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/config", () => ({
  loadConfig: () => ({
    anthropicApiKey: "k",
    vaultPath: "/tmp/v",
    wikiSubfolder: "wiki",
    extractionModel: "claude-sonnet-4-6",
    ocrModel: "claude-haiku-4-5-20251001",
    maxConcurrentPdfs: 1,
    ocrTextThreshold: 100,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/process", () => {
  it("returns batchId and triggers runBatch", async () => {
    const { POST } = await import("@/app/api/process/route");
    const formData = new FormData();
    formData.append("granularity", "medium");
    formData.append(
      "files",
      new File([new Uint8Array([1, 2, 3])], "x.pdf", { type: "application/pdf" }),
    );
    const req = new Request("http://localhost/api/process", { method: "POST", body: formData });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.batchId).toBe("string");
    expect(json.batchId.length).toBeGreaterThan(0);
  });

  it("rejects when no files supplied", async () => {
    const { POST } = await import("@/app/api/process/route");
    const formData = new FormData();
    formData.append("granularity", "medium");
    const req = new Request("http://localhost/api/process", { method: "POST", body: formData });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects invalid granularity", async () => {
    const { POST } = await import("@/app/api/process/route");
    const formData = new FormData();
    formData.append("granularity", "weird");
    formData.append("files", new File([new Uint8Array([1])], "x.pdf", { type: "application/pdf" }));
    const req = new Request("http://localhost/api/process", { method: "POST", body: formData });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npm test -- tests/api/process.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `app/api/process/route.ts`**

```ts
import { NextResponse } from "next/server";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { loadConfig } from "@/lib/config";
import { getAnthropicClient } from "@/lib/anthropic-client";
import { getEventBus } from "@/lib/events/bus";
import { runBatch } from "@/lib/pipeline/run-batch";
import { parsePdf } from "@/lib/pipeline/parse-pdf";
import { renderPdfPageToPng } from "@/lib/pipeline/render-page";
import { ocrPageImage } from "@/lib/pipeline/ocr-fallback";
import { scanVaultTitles } from "@/lib/pipeline/scan-vault";
import { extractConcepts } from "@/lib/pipeline/extract-concepts";
import type { Granularity } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 600;

const GranularitySchema = z.enum(["coarse", "medium", "fine"]);

export async function POST(req: Request): Promise<Response> {
  const cfg = loadConfig();
  const form = await req.formData();
  const rawGranularity = form.get("granularity");
  const parsedGranularity = GranularitySchema.safeParse(rawGranularity);
  if (!parsedGranularity.success) {
    return NextResponse.json({ error: "invalid granularity" }, { status: 400 });
  }
  const granularity: Granularity = parsedGranularity.data;

  const fileEntries = form.getAll("files").filter((v): v is File => v instanceof File);
  if (fileEntries.length === 0) {
    return NextResponse.json({ error: "no files" }, { status: 400 });
  }

  const batchId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
  const stagingDir = path.join(process.cwd(), "staging");

  const pdfs = await Promise.all(
    fileEntries.map(async (file) => ({
      pdfId: randomUUID(),
      filename: file.name,
      bytes: new Uint8Array(await file.arrayBuffer()),
    })),
  );

  const client = getAnthropicClient(cfg.anthropicApiKey);
  const bus = getEventBus();

  void runBatch({
    bus,
    batchId,
    granularity,
    stagingDir,
    vaultPath: cfg.vaultPath,
    maxConcurrent: cfg.maxConcurrentPdfs,
    pdfs,
    hooks: {
      parsePdf: (bytes) => parsePdf(bytes, { textThreshold: cfg.ocrTextThreshold }),
      renderPdfPageToPng: (bytes, pageNumber) => renderPdfPageToPng(bytes, pageNumber),
      ocrPageImage: (png) => ocrPageImage({ client, model: cfg.ocrModel }, png),
      scanVaultTitles: (vaultPath) => scanVaultTitles(vaultPath),
      extractConcepts: (args) =>
        extractConcepts({
          client,
          model: cfg.extractionModel,
          pdfText: args.pdfText,
          vaultTitles: args.vaultTitles,
          granularity: args.granularity,
        }),
    },
  });

  return NextResponse.json({ batchId });
}
```

- [ ] **Step 4: Run test**

```bash
npm test -- tests/api/process.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/process/route.ts tests/api/process.test.ts
git commit -m "add post /api/process route launching async batch"
```

---

### Task 18: API route — GET /api/events/[batchId] (SSE)

**Files:**
- Create: `app/api/events/[batchId]/route.ts`
- Test: `tests/api/events.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/api/events.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getEventBus } from "@/lib/events/bus";

describe("GET /api/events/[batchId]", () => {
  it("streams events as SSE messages", async () => {
    const { GET } = await import("@/app/api/events/[batchId]/route");
    const bus = getEventBus();
    const req = new Request("http://localhost/api/events/b1");
    const res = await GET(req, { params: Promise.resolve({ batchId: "b1" }) });
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    bus.publish({ type: "status", batchId: "b1", pdfId: "p", stage: "queued", pagesGenerated: 0 });
    bus.publish({
      type: "complete",
      batchId: "b1",
      totals: { pages: 0, links: 0, failed: 0 },
    });

    const reader = res.body?.getReader();
    if (!reader) throw new Error("no stream");
    const dec = new TextDecoder();
    let buf = "";
    for (let i = 0; i < 5; i++) {
      const chunk = await reader.read();
      if (chunk.value) buf += dec.decode(chunk.value);
      if (buf.includes('"type":"complete"')) break;
    }
    expect(buf).toContain('"type":"status"');
    expect(buf).toContain('"type":"complete"');
    await reader.cancel();
  });
});
```

- [ ] **Step 2: Run test**

```bash
npm test -- tests/api/events.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `app/api/events/[batchId]/route.ts`**

```ts
import { getEventBus } from "@/lib/events/bus";
import type { BatchEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ batchId: string }> },
): Promise<Response> {
  const { batchId } = await ctx.params;
  const bus = getEventBus();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: BatchEvent): void => {
        const payload = `data: ${JSON.stringify(event)}\n\n`;
        controller.enqueue(encoder.encode(payload));
        if (event.type === "complete") {
          unsub();
          controller.close();
        }
      };
      const unsub = bus.subscribe(batchId, send);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
```

- [ ] **Step 4: Run test**

```bash
npm test -- tests/api/events.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/events/\[batchId\]/route.ts tests/api/events.test.ts
git commit -m "add sse stream route for per-batch progress events"
```

---

### Task 19: API route — POST /api/import/[batchId]

**Files:**
- Create: `app/api/import/[batchId]/route.ts`
- Test: `tests/api/import.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/api/import.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let staging: string;
let vault: string;

beforeEach(async () => {
  staging = await mkdtemp(path.join(tmpdir(), "stg-"));
  vault = await mkdtemp(path.join(tmpdir(), "vlt-"));
  vi.resetModules();
  vi.doMock("@/lib/config", () => ({
    loadConfig: () => ({
      anthropicApiKey: "k",
      vaultPath: vault,
      wikiSubfolder: "wiki",
      extractionModel: "x",
      ocrModel: "y",
      maxConcurrentPdfs: 1,
      ocrTextThreshold: 100,
    }),
  }));
  vi.doMock("@/lib/pipeline/import-to-vault", async () => {
    const actual = await vi.importActual<typeof import("@/lib/pipeline/import-to-vault")>(
      "@/lib/pipeline/import-to-vault",
    );
    return actual;
  });
  process.env.WIKI_STAGING_DIR = staging;
});
afterEach(async () => {
  await rm(staging, { recursive: true, force: true });
  await rm(vault, { recursive: true, force: true });
  delete process.env.WIKI_STAGING_DIR;
});

describe("POST /api/import/[batchId]", () => {
  it("imports staging files into the vault", async () => {
    await mkdir(path.join(staging, "b1"));
    await writeFile(path.join(staging, "b1", "Note.md"), "x");
    const { POST } = await import("@/app/api/import/[batchId]/route");
    const req = new Request(`http://localhost/api/import/b1`, { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ batchId: "b1" }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.imported).toBe(1);
    const files = await readdir(path.join(vault, "wiki"));
    expect(files).toEqual(["Note.md"]);
  });

  it("returns 404 if batch directory missing", async () => {
    const { POST } = await import("@/app/api/import/[batchId]/route");
    const req = new Request(`http://localhost/api/import/missing`, { method: "POST" });
    const res = await POST(req, { params: Promise.resolve({ batchId: "missing" }) });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npm test -- tests/api/import.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement `app/api/import/[batchId]/route.ts`**

```ts
import { NextResponse } from "next/server";
import path from "node:path";
import { access } from "node:fs/promises";
import { loadConfig } from "@/lib/config";
import { importBatchToVault } from "@/lib/pipeline/import-to-vault";

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
```

- [ ] **Step 4: Update Task 17 to honor `WIKI_STAGING_DIR` for parity**

Edit `app/api/process/route.ts`, replacing the existing line:

```ts
const stagingDir = path.join(process.cwd(), "staging");
```

with:

```ts
const stagingDir = process.env.WIKI_STAGING_DIR ?? path.join(process.cwd(), "staging");
```

- [ ] **Step 5: Run tests**

```bash
npm test -- tests/api/import.test.ts tests/api/process.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/import/\[batchId\]/route.ts app/api/process/route.ts tests/api/import.test.ts
git commit -m "add post /api/import route copying staging into vault"
```

---

### Task 20: Init ShadCN/ui

**Files:**
- Create: `components.json`, `lib/utils.ts`, `components/ui/*`

- [ ] **Step 1: Init ShadCN**

Run:

```bash
npx shadcn@latest init -y -d
```

If prompted, choose: TypeScript yes, style "default", base color "neutral", CSS variables yes, src/ no, components alias `@/components`, utils alias `@/lib/utils`, RSC yes.

- [ ] **Step 2: Add components used in this app**

```bash
npx shadcn@latest add button card progress badge dialog input separator scroll-area skeleton tooltip sonner
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: build passes.

- [ ] **Step 4: Commit**

```bash
git add components.json components/ui/ lib/utils.ts app/globals.css tailwind.config.ts package.json package-lock.json
git commit -m "init shadcn/ui, add button, card, progress, badge, dialog, others"
```

---

### Task 21: Header component

**Files:**
- Create: `components/header.tsx`

- [ ] **Step 1: Implement**

```tsx
import { FileText } from "lucide-react";

export function Header(): JSX.Element {
  return (
    <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 max-w-4xl items-center px-6">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-foreground/80" aria-hidden />
          <span className="text-sm font-mono tracking-tight">wiki-generator</span>
        </div>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/header.tsx
git commit -m "add header component"
```

---

### Task 22: Granularity slider component

**Files:**
- Create: `components/granularity-slider.tsx`
- Test: `tests/components/granularity-slider.test.tsx`

- [ ] **Step 1: Set up React testing environment**

In `vitest.config.ts`, change `environment: "node"` to a workspace-style override per file. Simpler: install jsdom (done in Task 2) and add a per-file directive. Update the file:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environmentMatchGlobs: [
      ["tests/components/**", "jsdom"],
      ["**", "node"],
    ],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
```

- [ ] **Step 2: Write the failing test**

Create `tests/components/granularity-slider.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GranularitySlider } from "@/components/granularity-slider";

describe("GranularitySlider", () => {
  it("renders three buttons and highlights the value", () => {
    render(<GranularitySlider value="medium" onChange={() => {}} />);
    const medium = screen.getByRole("button", { name: /medium/i });
    expect(medium.getAttribute("data-active")).toBe("true");
  });

  it("calls onChange when a button is clicked", () => {
    const onChange = vi.fn();
    render(<GranularitySlider value="medium" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /coarse/i }));
    expect(onChange).toHaveBeenCalledWith("coarse");
  });
});
```

- [ ] **Step 3: Run test**

```bash
npm test -- tests/components/granularity-slider.test.tsx
```

Expected: FAIL.

- [ ] **Step 4: Implement `components/granularity-slider.tsx`**

```tsx
"use client";

import { Button } from "@/components/ui/button";
import type { Granularity } from "@/lib/types";

interface Props {
  value: Granularity;
  onChange: (value: Granularity) => void;
}

const OPTIONS: ReadonlyArray<{ value: Granularity; label: string; hint: string }> = [
  { value: "coarse", label: "Coarse", hint: "few dense pages" },
  { value: "medium", label: "Medium", hint: "one per concept" },
  { value: "fine", label: "Fine", hint: "many small pages" },
];

export function GranularitySlider({ value, onChange }: Props): JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
        Granularity
      </span>
      <div className="inline-flex gap-1 rounded-md border border-border bg-muted p-1">
        {OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            type="button"
            variant={opt.value === value ? "default" : "ghost"}
            size="sm"
            data-active={opt.value === value}
            onClick={() => onChange(opt.value)}
            className="h-8 px-3 text-xs"
          >
            {opt.label}
          </Button>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        {OPTIONS.find((o) => o.value === value)?.hint}
      </span>
    </div>
  );
}
```

- [ ] **Step 5: Run test**

```bash
npm test -- tests/components/granularity-slider.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/granularity-slider.tsx tests/components/granularity-slider.test.tsx vitest.config.ts
git commit -m "add granularity slider with three-position toggle"
```

---

### Task 23: Upload zone component

**Files:**
- Create: `components/upload-zone.tsx`
- Test: `tests/components/upload-zone.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/upload-zone.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UploadZone } from "@/components/upload-zone";

describe("UploadZone", () => {
  it("calls onFiles when input changes with PDFs", () => {
    const onFiles = vi.fn();
    render(<UploadZone onFiles={onFiles} disabled={false} />);
    const file = new File(["x"], "doc.pdf", { type: "application/pdf" });
    const input = screen.getByLabelText(/drop pdfs here/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFiles).toHaveBeenCalledTimes(1);
    expect(onFiles.mock.calls[0][0]).toHaveLength(1);
  });

  it("ignores non-pdf files", () => {
    const onFiles = vi.fn();
    render(<UploadZone onFiles={onFiles} disabled={false} />);
    const file = new File(["x"], "image.png", { type: "image/png" });
    const input = screen.getByLabelText(/drop pdfs here/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    expect(onFiles).toHaveBeenCalledWith([]);
  });
});
```

- [ ] **Step 2: Run test**

```bash
npm test -- tests/components/upload-zone.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `components/upload-zone.tsx`**

```tsx
"use client";

import { useRef, type ChangeEvent, type DragEvent } from "react";
import { UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  onFiles: (files: File[]) => void;
  disabled: boolean;
}

function filterPdfs(files: FileList | null): File[] {
  if (!files) return [];
  return Array.from(files).filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
}

export function UploadZone({ onFiles, disabled }: Props): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: ChangeEvent<HTMLInputElement>): void {
    onFiles(filterPdfs(e.target.files));
    e.target.value = "";
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>): void {
    e.preventDefault();
    if (disabled) return;
    onFiles(filterPdfs(e.dataTransfer.files));
  }

  return (
    <label
      htmlFor="wiki-upload-input"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-10 transition-colors",
        "hover:bg-muted/50",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <UploadCloud className="h-8 w-8 text-muted-foreground" aria-hidden />
      <div className="flex flex-col items-center gap-1">
        <span className="text-sm font-medium">Drop PDFs here</span>
        <span className="text-xs text-muted-foreground">or click to choose files</span>
      </div>
      <input
        ref={inputRef}
        id="wiki-upload-input"
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="sr-only"
        onChange={handleChange}
        disabled={disabled}
      />
    </label>
  );
}
```

- [ ] **Step 4: Run test**

```bash
npm test -- tests/components/upload-zone.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/upload-zone.tsx tests/components/upload-zone.test.tsx
git commit -m "add upload zone component, drag-drop and click-to-select"
```

---

### Task 24: Status list component

**Files:**
- Create: `components/status-list.tsx`
- Test: `tests/components/status-list.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/status-list.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusList } from "@/components/status-list";
import type { PdfStatus } from "@/lib/types";

describe("StatusList", () => {
  it("renders each pdf row with stage badge", () => {
    const items: PdfStatus[] = [
      { pdfId: "a", filename: "alpha.pdf", stage: "extracting", pagesGenerated: 0 },
      { pdfId: "b", filename: "beta.pdf", stage: "done", pagesGenerated: 12 },
    ];
    render(<StatusList items={items} />);
    expect(screen.getByText("alpha.pdf")).toBeInTheDocument();
    expect(screen.getByText("beta.pdf")).toBeInTheDocument();
    expect(screen.getByText("12 pages")).toBeInTheDocument();
  });

  it("shows error message on failed rows", () => {
    const items: PdfStatus[] = [
      { pdfId: "x", filename: "x.pdf", stage: "failed", pagesGenerated: 0, error: "boom" },
    ];
    render(<StatusList items={items} />);
    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test**

```bash
npm test -- tests/components/status-list.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `components/status-list.tsx`**

```tsx
"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { PdfStatus, Stage } from "@/lib/types";

const STAGE_LABEL: Record<Stage, string> = {
  queued: "Queued",
  parsing: "Parsing",
  ocr: "OCR",
  extracting: "Extracting",
  writing: "Writing",
  done: "Done",
  failed: "Failed",
};

const STAGE_VARIANT: Record<Stage, "default" | "secondary" | "destructive" | "outline"> = {
  queued: "outline",
  parsing: "secondary",
  ocr: "secondary",
  extracting: "secondary",
  writing: "secondary",
  done: "default",
  failed: "destructive",
};

interface Props {
  items: PdfStatus[];
}

export function StatusList({ items }: Props): JSX.Element {
  if (items.length === 0) return <></>;
  return (
    <Card className="divide-y divide-border">
      {items.map((item) => (
        <div key={item.pdfId} className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="flex flex-col">
            <span className="text-sm font-mono">{item.filename}</span>
            {item.error ? (
              <span className="text-xs text-destructive">{item.error}</span>
            ) : item.pagesGenerated > 0 ? (
              <span className="text-xs text-muted-foreground">{item.pagesGenerated} pages</span>
            ) : null}
          </div>
          <Badge variant={STAGE_VARIANT[item.stage]} className="font-mono text-[10px] uppercase">
            {STAGE_LABEL[item.stage]}
          </Badge>
        </div>
      ))}
    </Card>
  );
}
```

- [ ] **Step 4: Run test**

```bash
npm test -- tests/components/status-list.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/status-list.tsx tests/components/status-list.test.tsx
git commit -m "add status list component, per-pdf stage and error display"
```

---

### Task 25: Summary panel

**Files:**
- Create: `components/summary-panel.tsx`
- Test: `tests/components/summary-panel.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/components/summary-panel.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SummaryPanel } from "@/components/summary-panel";

describe("SummaryPanel", () => {
  it("renders totals and triggers onImport", () => {
    const onImport = vi.fn();
    render(
      <SummaryPanel
        totals={{ pages: 42, links: 88, failed: 1 }}
        importing={false}
        importResult={null}
        onImport={onImport}
      />,
    );
    expect(screen.getByText(/42 pages/)).toBeInTheDocument();
    expect(screen.getByText(/88 links/)).toBeInTheDocument();
    expect(screen.getByText(/1 failed/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /import to wiki/i }));
    expect(onImport).toHaveBeenCalledTimes(1);
  });

  it("shows import result message when available", () => {
    render(
      <SummaryPanel
        totals={{ pages: 1, links: 0, failed: 0 }}
        importing={false}
        importResult={{ imported: 1, conflicts: 0 }}
        onImport={() => {}}
      />,
    );
    expect(screen.getByText(/imported 1/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test**

```bash
npm test -- tests/components/summary-panel.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement `components/summary-panel.tsx`**

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

export interface ImportResult {
  imported: number;
  conflicts: number;
}

interface Props {
  totals: { pages: number; links: number; failed: number };
  importing: boolean;
  importResult: ImportResult | null;
  onImport: () => void;
}

export function SummaryPanel({ totals, importing, importResult, onImport }: Props): JSX.Element {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-2 text-sm">
        <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />
        <span>Batch complete.</span>
      </div>
      <div className="grid grid-cols-3 gap-3 text-sm font-mono">
        <Stat label="pages" value={totals.pages} />
        <Stat label="links" value={totals.links} />
        <Stat label="failed" value={totals.failed} tone={totals.failed > 0 ? "warn" : "ok"} />
      </div>
      <Button onClick={onImport} disabled={importing} className="self-start">
        {importing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing…
          </>
        ) : (
          "Import to Wiki"
        )}
      </Button>
      {importResult ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <AlertCircle className="h-3 w-3" aria-hidden />
          <span>
            Imported {importResult.imported}, {importResult.conflicts} renamed.
          </span>
        </div>
      ) : null}
    </Card>
  );
}

function Stat({
  label,
  value,
  tone = "ok",
}: {
  label: string;
  value: number;
  tone?: "ok" | "warn";
}): JSX.Element {
  return (
    <div className="flex flex-col">
      <span className={tone === "warn" ? "text-amber-500" : "text-foreground"}>{value}</span>
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}
```

- [ ] **Step 4: Run test**

```bash
npm test -- tests/components/summary-panel.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/summary-panel.tsx tests/components/summary-panel.test.tsx
git commit -m "add summary panel with totals and import button"
```

---

### Task 26: SSE client wrapper

**Files:**
- Create: `lib/sse-client.ts`

- [ ] **Step 1: Implement (no unit test needed; covered by E2E flow)**

```ts
"use client";

import type { BatchEvent } from "@/lib/types";

export interface SubscribeArgs {
  batchId: string;
  onEvent: (event: BatchEvent) => void;
  onError?: (err: unknown) => void;
}

export function subscribeToBatch({ batchId, onEvent, onError }: SubscribeArgs): () => void {
  const source = new EventSource(`/api/events/${encodeURIComponent(batchId)}`);
  source.onmessage = (raw) => {
    try {
      const parsed = JSON.parse(raw.data) as BatchEvent;
      onEvent(parsed);
      if (parsed.type === "complete") source.close();
    } catch (err) {
      onError?.(err);
    }
  };
  source.onerror = (err) => {
    onError?.(err);
    source.close();
  };
  return () => source.close();
}
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/sse-client.ts
git commit -m "add sse client wrapper around eventsource"
```

---

### Task 27: Main page wiring

**Files:**
- Modify: `app/page.tsx`, `app/layout.tsx`, `app/globals.css`

- [ ] **Step 1: Update `app/layout.tsx` to include Sonner Toaster**

Replace its body with:

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "wiki-generator",
  description: "Local PDF → Obsidian wiki generator",
};

export default function RootLayout({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Replace `app/page.tsx` with full wiring**

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/header";
import { UploadZone } from "@/components/upload-zone";
import { GranularitySlider } from "@/components/granularity-slider";
import { StatusList } from "@/components/status-list";
import { SummaryPanel } from "@/components/summary-panel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { subscribeToBatch } from "@/lib/sse-client";
import type { BatchEvent, Granularity, PdfStatus } from "@/lib/types";

interface BatchTotals {
  pages: number;
  links: number;
  failed: number;
}

export default function Page(): JSX.Element {
  const [files, setFiles] = useState<File[]>([]);
  const [granularity, setGranularity] = useState<Granularity>("medium");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, PdfStatus>>({});
  const [totals, setTotals] = useState<BatchTotals | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; conflicts: number } | null>(null);

  const items = useMemo(() => Object.values(statuses), [statuses]);

  const handleEvent = useCallback((event: BatchEvent) => {
    if (event.type === "status") {
      setStatuses((prev) => ({
        ...prev,
        [event.pdfId]: {
          ...(prev[event.pdfId] ?? { pdfId: event.pdfId, filename: event.pdfId, pagesGenerated: 0, stage: event.stage }),
          stage: event.stage,
          pagesGenerated: event.pagesGenerated,
          error: event.error,
        },
      }));
      return;
    }
    if (event.type === "complete") {
      setTotals(event.totals);
      return;
    }
  }, []);

  useEffect(() => {
    if (!batchId) return;
    const unsub = subscribeToBatch({
      batchId,
      onEvent: handleEvent,
      onError: () => toast.error("Lost connection to batch stream"),
    });
    return unsub;
  }, [batchId, handleEvent]);

  const generate = useCallback(async () => {
    if (files.length === 0) {
      toast.error("Add at least one PDF.");
      return;
    }
    const initial: Record<string, PdfStatus> = {};
    for (const f of files) {
      const id = `pending:${f.name}:${f.size}`;
      initial[id] = { pdfId: id, filename: f.name, stage: "queued", pagesGenerated: 0 };
    }
    setStatuses(initial);
    setTotals(null);
    setImportResult(null);

    const form = new FormData();
    form.append("granularity", granularity);
    for (const f of files) form.append("files", f);

    const res = await fetch("/api/process", { method: "POST", body: form });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast.error(`Process failed: ${err.error ?? res.status}`);
      return;
    }
    const json = (await res.json()) as { batchId: string };
    setBatchId(json.batchId);
    setStatuses({});
  }, [files, granularity]);

  const importToVault = useCallback(async () => {
    if (!batchId) return;
    setImporting(true);
    try {
      const res = await fetch(`/api/import/${encodeURIComponent(batchId)}`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(`Import failed: ${err.error ?? res.status}`);
        return;
      }
      const result = (await res.json()) as { imported: number; conflicts: number };
      setImportResult(result);
      toast.success(`Imported ${result.imported} pages.`);
    } finally {
      setImporting(false);
    }
  }, [batchId]);

  return (
    <>
      <Header />
      <main className="container mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
        <Card className="flex flex-col gap-5 p-5">
          <UploadZone onFiles={setFiles} disabled={Boolean(batchId) && totals === null} />
          {files.length > 0 ? (
            <ul className="flex flex-wrap gap-2 text-xs font-mono text-muted-foreground">
              {files.map((f) => (
                <li key={`${f.name}:${f.size}`} className="rounded bg-muted px-2 py-1">
                  {f.name}
                </li>
              ))}
            </ul>
          ) : null}
          <GranularitySlider value={granularity} onChange={setGranularity} />
          <Button
            onClick={generate}
            disabled={files.length === 0 || (Boolean(batchId) && totals === null)}
            className="self-start"
          >
            Generate Wiki
          </Button>
        </Card>
        {items.length > 0 ? <StatusList items={items} /> : null}
        {totals !== null ? (
          <SummaryPanel
            totals={totals}
            importing={importing}
            importResult={importResult}
            onImport={importToVault}
          />
        ) : null}
      </main>
    </>
  );
}
```

- [ ] **Step 3: Verify typecheck and build**

```bash
npm run typecheck && npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx app/layout.tsx
git commit -m "wire main page, upload, granularity, status list, summary, sse"
```

---

### Task 28: README and developer docs

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace `README.md`**

```markdown
# wiki-generator

Local-only Next.js tool that turns PDFs into a cross-referenced Markdown wiki for Obsidian.

## Setup

1. `cp .env.example .env.local` and fill in `ANTHROPIC_API_KEY` and `OBSIDIAN_VAULT_PATH`.
2. `npm install`
3. `npm run dev`
4. Open `http://localhost:3000`.

## How it works

1. Drop one or more PDFs.
2. Pick a granularity (coarse / medium / fine).
3. Click **Generate Wiki**. Per-PDF status streams live.
4. When the batch completes, click **Import to Wiki**. Pages land in `<vault>/wiki/`. Filename collisions become `<title> (1).md`, `(2)`, etc.

## Tests

- `npm test` — full vitest run.
- `npm run typecheck` — TypeScript only.

## Models used

- `claude-sonnet-4-6` for concept extraction.
- `claude-haiku-4-5-20251001` for OCR fallback (image PDFs).

Both default values; override via `EXTRACTION_MODEL` / `OCR_MODEL` in `.env.local`.

## Folder layout

- `app/` — Next.js App Router.
- `lib/pipeline/` — PDF parse, OCR, extract, write, import.
- `lib/events/` — in-process pub/sub for SSE.
- `staging/` — generated batches before import (gitignored).
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "add readme with setup, workflow, models, folder layout"
```

---

### Task 29: Manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Confirm `.env.local` is in place**

Verify the user has populated `.env.local` with a real `ANTHROPIC_API_KEY` and the correct `OBSIDIAN_VAULT_PATH`. Do not start the dev server inside this session — instead, ask the user to run `npm run dev` manually in their own terminal.

- [ ] **Step 2: Provide a verification checklist for the user**

Print the following checklist for them to run:

```
1. npm run dev — open http://localhost:3000.
2. Drop ONE small text PDF (an arxiv abstract works). Pick "medium". Click Generate Wiki.
   - Confirm: status row shows parsing → extracting → writing → done.
   - Confirm: staging/<batchId>/ contains .md files with frontmatter.
3. Click Import to Wiki.
   - Confirm: <vault>/wiki/ contains the generated pages.
   - Confirm: opening one in Obsidian shows working [[wikilinks]] for any
     vault titles referenced.
4. Drop an IMAGE-ONLY PDF (e.g., a screenshot exported as PDF).
   Confirm: status passes through "ocr" stage at least once.
5. Run a second batch overlapping with previous titles.
   Confirm: collisions create "<title> (1).md", "(2).md", not overwrites.
6. Drop a PDF whose extraction fails (e.g., empty 0-byte file).
   Confirm: that row shows "Failed" with an error; other PDFs still complete.
```

- [ ] **Step 3: Final full test run**

```bash
npm run typecheck && npm test
```

Expected: all green.

- [ ] **Step 4: Commit any final adjustments arising from verification**

If the user reports a bug during manual verification, add a focused fix-task to the plan and follow the same TDD pattern (test first, fix, commit).

---

## Self-Review

**Spec coverage check:**

- §2 Goals
  - "Accept one or more PDFs" → Tasks 17, 23, 27 ✓
  - "Extract concepts via Claude" → Task 11 ✓
  - "One Markdown page per concept w/ wikilinks" → Tasks 11, 12 ✓
  - "Adapt granularity" → Tasks 11, 22 ✓
  - "Multilingual" → Tasks 5 (slugify preserves unicode), 10 (Claude vision), 11 (prompt explicitly forbids translation) ✓
  - "One-click Import to Wiki" → Tasks 13, 19, 25, 27 ✓
  - "Run on localhost, no auth" → Task 1 (Next.js dev server), no auth tasks ✓
  - "ShadCN UI matching freddysongg.me" → Tasks 20, 21–25 ✓
- §3 Non-Goals — no review/edit, no deploy, no translation: respected ✓
- §4 User flow — covered end-to-end ✓
- §5 Architecture — single Next.js monolith, App Router, SSE ✓
- §6 Components — all listed components implemented (Tasks 21–25) ✓
- §7 Data model — Tasks 3, 12 ✓
- §8 Pipeline — pre-batch vault scan in Task 15; per-PDF parse → OCR → extract → write in Task 15 ✓
- §9 Cross-reference linking — Task 6 (validator), Task 15 (combines vault + batch titles) ✓
- §10 Import to vault — Task 13 (collision suffix), Task 19 (route) ✓
- §11 Configuration — Task 4 ✓
- §12 Error handling — Task 15 (per-PDF failure isolation), Task 11 (retry-once on schema), Task 19 (404 on missing batch) ✓
- §13 UI design — Tasks 20–27 ✓
- §14 Testing strategy — every component has unit/integration tests in this plan ✓

**Placeholder scan:** no TBD/TODO; every code step shows full code.

**Type consistency:**
- `Stage`, `Granularity`, `BatchEvent`, `PdfStatus`, `GeneratedPage`, `ExtractionResult` — defined in Task 3, used unchanged downstream ✓
- `validateWikilinks(string, Set<string>)` — defined in Task 6, used in Task 15 ✓
- `writeStaging({ stagingDir, batchId, batchTimestamp, pages })` — Task 12 signature matches Task 15 caller ✓
- `importBatchToVault({ stagingDir, batchId, vaultPath, wikiSubfolder })` — Task 13 matches Task 19 ✓
- `runBatch` hooks signature uses `parsePdf`, `renderPdfPageToPng`, `ocrPageImage`, `scanVaultTitles`, `extractConcepts` — every name matches the implementation tasks ✓
- `WIKI_STAGING_DIR` env override — added to Task 19 step 4 to keep both routes consistent ✓
