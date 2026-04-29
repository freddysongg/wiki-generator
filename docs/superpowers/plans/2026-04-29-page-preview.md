# Wiki Page Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users inspect each generated wiki page from the Generate view via inline expand-on-click in the Pipeline section + a dialog with rendered Markdown.

**Architecture:** New `GET /api/batches/:batchId/pages/:filename` returns cleaned Markdown body for a manifest-listed page, validating filename against the manifest as an allowlist. UI: `BatchProvider` fetches the manifest once when batch completes; `<StatusList>` rows expand to show per-PDF page titles; clicking a title opens `<PagePreviewDialog>` with `react-markdown`-rendered content.

**Tech Stack:** Next.js App Router (existing), Vitest, React 19, `react-markdown` v9 (new dep).

**Spec:** [`docs/superpowers/specs/2026-04-29-page-preview-design.md`](../specs/2026-04-29-page-preview-design.md)

---

## Task ordering

```
T1  Pure helper: stripPageChrome (TDD red → green)
T2  GET /api/batches/:batchId/pages/:filename + tests
T3  BatchContext: fetch manifest on complete; expose getPagesForSource
T4  Add react-markdown dep
T5  PagePreviewDialog component + tests
T6  StatusList expand-on-click + integration into app/page.tsx
T7  Final typecheck + tests
```

Sequential. T2 depends on T1. T5 depends on T4. T6 depends on T3+T5.

---

## File Structure

### Created

| Path                                                  | Responsibility                                       |
| ----------------------------------------------------- | ---------------------------------------------------- |
| `lib/pipeline/strip-page-chrome.ts`                   | Pure helper: `stripPageChrome(raw: string): string`. |
| `tests/lib/pipeline/strip-page-chrome.test.ts`        | Unit tests.                                          |
| `app/api/batches/[batchId]/pages/[filename]/route.ts` | GET endpoint serving cleaned Markdown.               |
| `tests/api/page-content.test.ts`                      | API route tests.                                     |
| `components/page-preview-dialog.tsx`                  | Dialog with rendered Markdown.                       |
| `tests/components/page-preview-dialog.test.tsx`       | Dialog render tests.                                 |

### Modified

| Path                           | Change                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------- |
| `components/batch-context.tsx` | Add `manifest` to snapshot, fetch on `complete`, expose `getPagesForSource`. |
| `components/status-list.tsx`   | Expand chevron + sub-list of pages on done rows.                             |
| `app/page.tsx`                 | Wire selected-page state and render `<PagePreviewDialog>`.                   |
| `package.json`                 | Add `react-markdown`.                                                        |

---

## Task T1: stripPageChrome helper

**Files:** Create `lib/pipeline/strip-page-chrome.ts`, `tests/lib/pipeline/strip-page-chrome.test.ts`

- [ ] **Step 1: Write tests (TDD red)**

`tests/lib/pipeline/strip-page-chrome.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { stripPageChrome } from "@/lib/pipeline/strip-page-chrome";

describe("stripPageChrome", () => {
  it("strips frontmatter, leading title heading, and trailing source line", () => {
    const raw = [
      "---",
      'title: "Backpropagation"',
      'source: "alpha.pdf"',
      "---",
      "",
      "# Backpropagation",
      "",
      "Body line one.",
      "",
      "## Subhead",
      "",
      "Body line two.",
      "",
      "---",
      "*Source: alpha.pdf, pp. 14-22*",
      "",
    ].join("\n");

    expect(stripPageChrome(raw)).toBe(
      ["Body line one.", "", "## Subhead", "", "Body line two."].join("\n"),
    );
  });

  it("handles missing trailing source line", () => {
    const raw = ["---", 'title: "X"', "---", "", "# X", "", "Body.", ""].join(
      "\n",
    );
    expect(stripPageChrome(raw)).toBe("Body.");
  });

  it("handles missing leading heading", () => {
    const raw = [
      "---",
      'title: "X"',
      "---",
      "",
      "Just a body, no heading.",
      "",
    ].join("\n");
    expect(stripPageChrome(raw)).toBe("Just a body, no heading.");
  });

  it("handles input with no frontmatter at all", () => {
    const raw = "# X\n\nBody only.\n";
    expect(stripPageChrome(raw)).toBe("Body only.");
  });

  it("preserves internal --- horizontal rules in body", () => {
    const raw = [
      "---",
      'title: "X"',
      "---",
      "",
      "# X",
      "",
      "Before rule.",
      "",
      "---",
      "",
      "After rule.",
      "",
    ].join("\n");
    expect(stripPageChrome(raw)).toBe(
      ["Before rule.", "", "---", "", "After rule."].join("\n"),
    );
  });
});
```

- [ ] **Step 2: Run — should FAIL**

Run: `npx vitest run tests/lib/pipeline/strip-page-chrome.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement (TDD green)**

`lib/pipeline/strip-page-chrome.ts`:

```typescript
const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n+/;
const LEADING_HEADING_RE = /^#\s.*\r?\n+/;
const TRAILING_SOURCE_RE = /\r?\n---\r?\n\*Source:[^\n]*\*\s*$/;

export function stripPageChrome(raw: string): string {
  let result = raw.replace(FRONTMATTER_RE, "");
  result = result.replace(LEADING_HEADING_RE, "");
  result = result.replace(TRAILING_SOURCE_RE, "");
  return result.trim();
}
```

- [ ] **Step 4: Run — should PASS**

Run: `npx vitest run tests/lib/pipeline/strip-page-chrome.test.ts`
Expected: 5/5 PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/pipeline/strip-page-chrome.ts tests/lib/pipeline/strip-page-chrome.test.ts
git commit -m "add: strippagechrome helper for page-preview rendering"
```

---

## Task T2: Page-content API route

**Files:** Create `app/api/batches/[batchId]/pages/[filename]/route.ts`, `tests/api/page-content.test.ts`

- [ ] **Step 1: Write the route**

```typescript
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { isValidBatchId } from "@/lib/batch-id";
import {
  BatchManifestSchema,
  MANIFEST_FILENAME,
} from "@/lib/pipeline/manifest";
import { stripPageChrome } from "@/lib/pipeline/strip-page-chrome";

export const runtime = "nodejs";

interface Params {
  batchId: string;
  filename: string;
}

function stagingRoot(): string {
  return process.env.WIKI_STAGING_DIR ?? path.join(process.cwd(), "staging");
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<Params> },
): Promise<Response> {
  const { batchId, filename: rawFilename } = await ctx.params;
  if (!isValidBatchId(batchId)) {
    return NextResponse.json({ error: "invalid batch id" }, { status: 400 });
  }
  const filename = decodeURIComponent(rawFilename);
  const stagingDir = stagingRoot();
  const batchDir = path.join(stagingDir, batchId);

  let manifestRaw: string;
  try {
    manifestRaw = await readFile(
      path.join(batchDir, MANIFEST_FILENAME),
      "utf8",
    );
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "batch not found" }, { status: 404 });
    }
    throw err;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(manifestRaw);
  } catch {
    return NextResponse.json({ error: "manifest unreadable" }, { status: 500 });
  }
  const manifest = BatchManifestSchema.safeParse(parsedJson);
  if (!manifest.success) {
    return NextResponse.json({ error: "manifest invalid" }, { status: 500 });
  }

  const allowed = manifest.data.pages.some((p) => p.filename === filename);
  if (!allowed) {
    return NextResponse.json({ error: "page not found" }, { status: 404 });
  }

  let pageRaw: string;
  try {
    pageRaw = await readFile(path.join(batchDir, filename), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "page not found" }, { status: 404 });
    }
    throw err;
  }

  const cleaned = stripPageChrome(pageRaw);
  return new Response(cleaned, {
    status: 200,
    headers: { "content-type": "text/markdown; charset=utf-8" },
  });
}
```

- [ ] **Step 2: Write tests**

`tests/api/page-content.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let staging: string;
const ORIGINAL_STAGING = process.env.WIKI_STAGING_DIR;

beforeEach(async () => {
  staging = await mkdtemp(path.join(tmpdir(), "stg-"));
  process.env.WIKI_STAGING_DIR = staging;
});

afterEach(async () => {
  await rm(staging, { recursive: true, force: true });
  if (ORIGINAL_STAGING === undefined) {
    delete process.env.WIKI_STAGING_DIR;
  } else {
    process.env.WIKI_STAGING_DIR = ORIGINAL_STAGING;
  }
});

const VALID_BATCH_ID = "2026-04-29-batch-1";
const VALID_FILENAME = "Backpropagation.md";

async function seedBatch(batchId: string): Promise<void> {
  const dir = path.join(staging, batchId);
  await mkdir(dir, { recursive: true });
  const manifest = {
    version: "1.0.0",
    batchId,
    createdAt: "2026-04-29T00:00:00.000Z",
    granularity: "medium",
    pages: [
      {
        title: "Backpropagation",
        filename: VALID_FILENAME,
        aliases: [],
        type: "concept",
        source: "alpha.pdf",
        sourcePages: "pp. 14-22",
        tags: ["wiki-generator"],
        links: [],
        createdAt: "2026-04-29T00:00:00.000Z",
      },
    ],
  };
  await writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify(manifest),
    "utf8",
  );
  const md = [
    "---",
    'title: "Backpropagation"',
    'source: "alpha.pdf"',
    "---",
    "",
    "# Backpropagation",
    "",
    "Body content here.",
    "",
    "---",
    "*Source: alpha.pdf, pp. 14-22*",
    "",
  ].join("\n");
  await writeFile(path.join(dir, VALID_FILENAME), md, "utf8");
}

describe("GET /api/batches/:batchId/pages/:filename", () => {
  it("returns cleaned markdown for a valid request", async () => {
    await seedBatch(VALID_BATCH_ID);
    const { GET } =
      await import("@/app/api/batches/[batchId]/pages/[filename]/route");
    const res = await GET(
      new Request(
        `http://localhost/api/batches/${VALID_BATCH_ID}/pages/${encodeURIComponent(VALID_FILENAME)}`,
      ),
      {
        params: Promise.resolve({
          batchId: VALID_BATCH_ID,
          filename: encodeURIComponent(VALID_FILENAME),
        }),
      },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    const body = await res.text();
    expect(body).toBe("Body content here.");
  });

  it("returns 400 on invalid batch id", async () => {
    const { GET } =
      await import("@/app/api/batches/[batchId]/pages/[filename]/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({
        batchId: "../etc",
        filename: encodeURIComponent("anything.md"),
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 when manifest is missing", async () => {
    const { GET } =
      await import("@/app/api/batches/[batchId]/pages/[filename]/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({
        batchId: "nonexistent-batch",
        filename: encodeURIComponent("anything.md"),
      }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when filename is not in manifest allowlist", async () => {
    await seedBatch(VALID_BATCH_ID);
    const { GET } =
      await import("@/app/api/batches/[batchId]/pages/[filename]/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({
        batchId: VALID_BATCH_ID,
        filename: encodeURIComponent("../../etc/passwd"),
      }),
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 3: Run tests — should PASS**

Run: `npx vitest run tests/api/page-content.test.ts`
Expected: 4/4 PASS.

- [ ] **Step 4: Commit**

```bash
git add app/api/batches/[batchId]/pages/[filename]/route.ts tests/api/page-content.test.ts
git commit -m "add: page content api with manifest allowlist and chrome stripping"
```

---

## Task T3: BatchContext fetches manifest on complete

**Files:** Modify `components/batch-context.tsx`

- [ ] **Step 1: Read the current file**

The provider already manages `batchId`, `statuses`, `totals`, etc. Add manifest fetching.

- [ ] **Step 2: Update imports and types**

Add to imports:

```typescript
import type { BatchManifest, ManifestPage } from "@/lib/types";
```

Update `BatchSnapshot`:

```typescript
export interface BatchSnapshot {
  stage: BatchStage;
  queuedCount: number;
  statuses: PdfStatus[];
  totals: BatchTotals | null;
  importResult: ImportResult | null;
  manifest: BatchManifest | null;
}
```

Update `BatchContextValue`:

```typescript
interface BatchContextValue {
  snapshot: BatchSnapshot;
  setQueuedCount: (count: number) => void;
  startBatch: (batchId: string, pdfs: ReadonlyArray<SeedPdf>) => void;
  importBatch: () => Promise<void>;
  isImporting: boolean;
  resetBatch: () => void;
  getPagesForSource: (source: string) => ManifestPage[];
}
```

- [ ] **Step 3: Add manifest state and fetch effect**

Inside `BatchProvider`, add:

```typescript
const [manifest, setManifest] = useState<BatchManifest | null>(null);
```

Reset in `startBatch` and `resetBatch` (set `setManifest(null)` alongside the existing resets).

After the existing SSE effect, add:

```typescript
useEffect(() => {
  if (totals === null || !batchId || manifest !== null) return;
  let cancelled = false;
  void (async (): Promise<void> => {
    try {
      const response = await fetch(
        `/api/manifest/${encodeURIComponent(batchId)}`,
      );
      if (!response.ok) return;
      const json = (await response.json()) as BatchManifest;
      if (!cancelled) setManifest(json);
    } catch {
      // manifest fetch is best-effort; UI degrades gracefully without it
    }
  })();
  return () => {
    cancelled = true;
  };
}, [totals, batchId, manifest]);
```

Update the snapshot memo to include `manifest`:

```typescript
const snapshot = useMemo<BatchSnapshot>(() => {
  const stage = deriveStage({ batchId, totals, queuedCount });
  return {
    stage,
    queuedCount,
    statuses: statusList,
    totals,
    importResult,
    manifest,
  };
}, [batchId, totals, queuedCount, statusList, importResult, manifest]);
```

Add the helper:

```typescript
const getPagesForSource = useCallback(
  (source: string): ManifestPage[] => {
    if (!manifest) return [];
    return manifest.pages.filter((p) => p.source === source);
  },
  [manifest],
);
```

Add `getPagesForSource` to the value's `useMemo` deps and returned object.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/batch-context.tsx
git commit -m "add: manifest fetch on batch complete and getpagesforsource helper"
```

---

## Task T4: Add react-markdown dependency

**Files:** Modify `package.json`

- [ ] **Step 1: Install**

```bash
npm install react-markdown@^9
```

- [ ] **Step 2: Verify install**

```bash
grep "react-markdown" package.json
```

Should show `"react-markdown": "^9.…"`.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "add: react-markdown dependency for page preview rendering"
```

---

## Task T5: PagePreviewDialog component

**Files:** Create `components/page-preview-dialog.tsx`, `tests/components/page-preview-dialog.test.tsx`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useEffect, useState } from "react";
import type { JSX } from "react";
import ReactMarkdown from "react-markdown";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; markdown: string }
  | { status: "error" };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batchId: string | null;
  filename: string | null;
  title: string | null;
  source: string | null;
  sourcePages: string | null;
}

export function PagePreviewDialog({
  open,
  onOpenChange,
  batchId,
  filename,
  title,
  source,
  sourcePages,
}: Props): JSX.Element {
  const [state, setState] = useState<FetchState>({ status: "idle" });

  useEffect(() => {
    if (!open || !batchId || !filename) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    void (async (): Promise<void> => {
      try {
        const response = await fetch(
          `/api/batches/${encodeURIComponent(batchId)}/pages/${encodeURIComponent(filename)}`,
        );
        if (!response.ok) {
          if (!cancelled) setState({ status: "error" });
          return;
        }
        const text = await response.text();
        if (!cancelled) setState({ status: "ready", markdown: text });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, batchId, filename]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border border-rule bg-bg text-fg">
        <DialogHeader>
          <DialogTitle className="t-display text-fg">{title ?? ""}</DialogTitle>
          <DialogDescription className="t-meta text-fg-mute">
            {source ?? ""} · {sourcePages ?? ""}
          </DialogDescription>
        </DialogHeader>
        <div className="page-preview-body">
          {state.status === "loading" ? (
            <p className="t-meta text-fg-mute">Loading…</p>
          ) : null}
          {state.status === "error" ? (
            <p className="t-meta text-brand-accent">Could not load page.</p>
          ) : null}
          {state.status === "ready" ? (
            <ReactMarkdown
              components={{
                h1: () => null,
                h2: ({ children }) => (
                  <h2 className="t-display text-fg mt-4 mb-2">{children}</h2>
                ),
                h3: ({ children }) => (
                  <h3 className="t-body text-fg font-bold mt-3 mb-1">
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p className="t-body text-fg my-2">{children}</p>
                ),
                ul: ({ children }) => (
                  <ul className="list-disc pl-5 t-body text-fg my-2">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal pl-5 t-body text-fg my-2">
                    {children}
                  </ol>
                ),
                li: ({ children }) => <li className="my-1">{children}</li>,
                code: ({ children }) => (
                  <code className="bg-bg-2 border border-rule px-1 py-0.5 rounded-none text-[12px]">
                    {children}
                  </code>
                ),
                pre: ({ children }) => (
                  <pre className="bg-bg-2 border border-rule p-3 overflow-x-auto rounded-none my-2">
                    {children}
                  </pre>
                ),
                a: ({ children, href }) => (
                  <a
                    className="text-fg underline underline-offset-2 hover:text-brand-accent"
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {children}
                  </a>
                ),
                hr: () => <hr className="border-t border-rule my-4" />,
              }}
            >
              {state.markdown}
            </ReactMarkdown>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Write tests**

`tests/components/page-preview-dialog.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { PagePreviewDialog } from "@/components/page-preview-dialog";

const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn(
    async () =>
      new Response("Body content here.", {
        status: 200,
        headers: { "content-type": "text/markdown" },
      }),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = ORIGINAL_FETCH;
});

describe("PagePreviewDialog", () => {
  it("renders fetched markdown when open", async () => {
    render(
      <PagePreviewDialog
        open={true}
        onOpenChange={() => {}}
        batchId="b1"
        filename="X.md"
        title="X"
        source="alpha.pdf"
        sourcePages="pp. 1-2"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/Body content here/)).toBeInTheDocument();
    });
    expect(screen.getByText("X")).toBeInTheDocument();
    expect(screen.getByText(/alpha\.pdf/)).toBeInTheDocument();
  });

  it("shows an error message when fetch fails", async () => {
    global.fetch = vi.fn(
      async () => new Response("not found", { status: 404 }),
    ) as unknown as typeof fetch;

    render(
      <PagePreviewDialog
        open={true}
        onOpenChange={() => {}}
        batchId="b1"
        filename="X.md"
        title="X"
        source="alpha.pdf"
        sourcePages="pp. 1-2"
      />,
    );
    await waitFor(() => {
      expect(screen.getByText(/could not load page/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 3: Run targeted tests**

Run: `npx vitest run tests/components/page-preview-dialog.test.tsx`
Expected: 2/2 PASS.

- [ ] **Step 4: Commit**

```bash
git add components/page-preview-dialog.tsx tests/components/page-preview-dialog.test.tsx
git commit -m "add: page preview dialog with rendered markdown"
```

---

## Task T6: Wire StatusList expand + page.tsx dialog

**Files:** Modify `components/status-list.tsx`, `app/page.tsx`

- [ ] **Step 1: Update StatusList**

Replace `components/status-list.tsx` with:

```tsx
"use client";

import { useState } from "react";
import type { JSX } from "react";
import type { ManifestPage, PdfStatus, Stage } from "@/lib/types";
import { useBatch } from "@/components/batch-context";
import { cn } from "@/lib/utils";

const STAGE_LABEL: Record<Stage, string> = {
  queued: "Queued",
  parsing: "Parsing",
  ocr: "OCR",
  extracting: "Extracting",
  writing: "Writing",
  done: "Done",
  failed: "Failed",
};

interface Props {
  items: PdfStatus[];
  onPageOpen?: (page: ManifestPage) => void;
}

export function StatusList({ items, onPageOpen }: Props): JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col">
      {items.map((item, idx) => (
        <StatusRow
          key={item.pdfId}
          item={item}
          index={idx}
          onPageOpen={onPageOpen}
        />
      ))}
    </ul>
  );
}

interface RowProps {
  item: PdfStatus;
  index: number;
  onPageOpen?: (page: ManifestPage) => void;
}

function StatusRow({ item, index, onPageOpen }: RowProps): JSX.Element {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const { getPagesForSource } = useBatch();
  const pages = item.stage === "done" ? getPagesForSource(item.filename) : [];
  const canExpand = pages.length > 0 && Boolean(onPageOpen);
  const isFailed = item.stage === "failed";
  const isDone = item.stage === "done";
  const indexLabel = String(index + 1).padStart(2, "0");

  return (
    <li className="flex flex-col border-t border-rule first:border-t-0 py-2">
      <div className="grid grid-cols-[28px_1fr_120px_80px_28px] gap-3 items-baseline">
        <span className="t-label text-fg-faint num-tabular">{indexLabel}</span>
        <span className="t-body text-fg truncate" title={item.filename}>
          {item.filename}
        </span>
        <span
          className={cn(
            "t-eyebrow",
            isFailed
              ? "text-brand-accent"
              : isDone
                ? "text-fg"
                : "text-fg-mute",
          )}
        >
          {STAGE_LABEL[item.stage]}
        </span>
        <span className="t-meta text-fg-mute text-right num-tabular">
          {item.pagesGenerated > 0 ? `${item.pagesGenerated} pgs` : "— pgs"}
        </span>
        {canExpand ? (
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "collapse pages" : "expand pages"}
            className="t-meta text-fg-mute hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-fg focus-visible:outline-offset-[-2px]"
          >
            {isExpanded ? "▾" : "▸"}
          </button>
        ) : (
          <span aria-hidden></span>
        )}
      </div>
      {isFailed && item.error ? (
        <div className="grid grid-cols-[28px_1fr] gap-3 mt-1">
          <span aria-hidden></span>
          <span className="t-meta text-brand-accent break-words">
            {item.error}
          </span>
        </div>
      ) : null}
      {canExpand && isExpanded ? (
        <ul className="flex flex-col mt-2 ml-7 border-l border-rule">
          {pages.map((page) => (
            <li key={page.filename}>
              <button
                type="button"
                onClick={() => onPageOpen?.(page)}
                className="w-full grid grid-cols-[1fr_auto] gap-3 items-baseline px-3 py-1.5 text-left border-t border-rule first:border-t-0 hover:bg-bg-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-fg focus-visible:outline-offset-[-2px]"
              >
                <span className="t-body text-fg truncate" title={page.title}>
                  {page.title}
                </span>
                <span className="t-meta text-fg-mute num-tabular">
                  {page.sourcePages}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
```

- [ ] **Step 2: Update app/page.tsx**

Add imports:

```typescript
import { PagePreviewDialog } from "@/components/page-preview-dialog";
import type { ManifestPage } from "@/lib/types";
```

Inside the component, add state:

```typescript
const [selectedPage, setSelectedPage] = useState<ManifestPage | null>(null);
```

Get the current batchId from context (already available via `snapshot.manifest?.batchId` if manifest is loaded; otherwise we can read it from the existing `batchId` flow). Cleanest: read from `snapshot.manifest?.batchId`:

```typescript
const previewBatchId = snapshot.manifest?.batchId ?? null;
```

Pass `onPageOpen` to `<StatusList>`:

```tsx
<StatusList items={items} onPageOpen={setSelectedPage} />
```

Render the dialog (anywhere in the JSX, but conventionally at the end of the fragment, before the closing `</>`):

```tsx
<PagePreviewDialog
  open={selectedPage !== null}
  onOpenChange={(open) => {
    if (!open) setSelectedPage(null);
  }}
  batchId={previewBatchId}
  filename={selectedPage?.filename ?? null}
  title={selectedPage?.title ?? null}
  source={selectedPage?.source ?? null}
  sourcePages={selectedPage?.sourcePages ?? null}
/>
```

- [ ] **Step 3: Update existing status-list test**

`tests/components/status-list.test.tsx` currently renders `<StatusList items={...} />` directly. Now `StatusList` calls `useBatch()` for `getPagesForSource`, so tests need to wrap in `<BatchProvider>`. Update the existing tests:

Read the existing file and wrap each `render(<StatusList ... />)` in `<BatchProvider>`. The simplest change:

```tsx
import { BatchProvider } from "@/components/batch-context";

// in each test, change:
render(<StatusList items={items} />);
// to:
render(
  <BatchProvider>
    <StatusList items={items} />
  </BatchProvider>,
);
```

Add a new test that verifies the chevron does NOT appear when no manifest is loaded (since `getPagesForSource` returns `[]`):

```tsx
it("does not render an expand chevron when manifest is not loaded", () => {
  const items: PdfStatus[] = [
    { pdfId: "a", filename: "alpha.pdf", stage: "done", pagesGenerated: 3 },
  ];
  render(
    <BatchProvider>
      <StatusList items={items} onPageOpen={() => {}} />
    </BatchProvider>,
  );
  expect(screen.queryByRole("button", { name: /expand pages/i })).toBeNull();
});
```

- [ ] **Step 4: Run targeted tests**

Run: `npx vitest run tests/components/status-list.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/status-list.tsx app/page.tsx tests/components/status-list.test.tsx
git commit -m "feat: expand pdf rows to inspect generated pages and open preview dialog"
```

---

## Task T7: Final verification

- [ ] **Step 1: Whole-codebase typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 2: Whole-codebase tests**

Run: `npm test`
Expected: PASS. Count grew by 5 (strip-page-chrome) + 4 (page-content api) + 2 (dialog) + 1 (status-list new test) = 12.

- [ ] **Step 3: If anything fails**

Repair, commit fixes (`fix: <what>`).

---

## Self-Review

**Spec coverage check:**

- Acceptance #1 (manifest fetched once on complete) → T3 effect with `manifest === null` guard ✓
- Acceptance #2 (chevron on done rows with pages) → T6 `canExpand` ✓
- Acceptance #3 (sub-list filtered to PDF) → T6 uses `getPagesForSource(item.filename)` ✓
- Acceptance #4 (dialog with title/source/sourcePages) → T5 props ✓
- Acceptance #5 (renders body, no duplicate H1, no source line) → T1 strip + T5 `h1: () => null` ✓
- Acceptance #6 (ESC closes; reopen fetches fresh) → Dialog defaults + T5 effect deps ✓
- Acceptance #7 (path traversal 404) → T2 manifest allowlist + test case ✓
- Acceptance #8 (invalid batchId 400) → T2 + test ✓
- Acceptance #9 (typecheck + tests clean) → T7 ✓

**Placeholder scan:** None.

**Type consistency:** `ManifestPage` from `lib/types.ts` is used identically in BatchContext, StatusList, PagePreviewDialog props (via individual fields), and the API route's manifest validation. `BatchManifest` from `lib/types.ts` matches `BatchManifestSchema` from `lib/pipeline/manifest.ts`.

**Spec gap check:** None.

---

## Execution

Single subagent dispatch, sequential tasks. Then a code review pass and any fixes.
