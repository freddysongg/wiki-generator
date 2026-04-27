# Wiki Generator — Design Spec

**Date:** 2026-04-26
**Status:** Approved (pending implementation plan)
**Owner:** Freddy Song

## 1. Overview

A local-only tool that ingests PDFs, extracts concepts from each, and produces a cross-referenced Markdown wiki suitable for browsing in Obsidian. After processing, the user clicks "Import to Wiki" to copy the generated pages into their Obsidian vault.

Inputs vary in nature and length: arxiv papers, textbook chapters, LinkedIn/X post screenshots, slide exports. The pipeline must adapt to that range.

## 2. Goals

- Accept one or more PDFs of arbitrary structure (text-based, image-based, mixed).
- Extract semantically meaningful "concepts" using Claude (Anthropic SDK).
- Output one Markdown page per concept, with `[[wikilinks]]` to sibling pages and to titles already present in the user's Obsidian vault.
- Adapt extraction granularity (coarse / medium / fine) per upload session.
- Handle multilingual content end-to-end (extraction, OCR, generation).
- Provide a one-click "Import to Wiki" action that copies generated pages into the configured Obsidian vault.
- Run entirely on `localhost`; no deployment, no auth.
- UI built with ShadCN components, visually consistent with `https://freddysongg.me/`.

## 3. Non-Goals

- No review/edit step before import (auto-pipeline; user edits in Obsidian after import).
- No deployment, multi-user, or auth concerns.
- No background scheduling, watch folders, or daemon mode.
- No content translation. Wiki pages are written in the source language.
- No editing of existing vault notes (cross-refs only point to them).
- No mobile or responsive design beyond what ShadCN gives for free.

## 4. User Flow

1. User opens `localhost:3000`.
2. Drag-drops one or more PDFs onto the upload zone.
3. Adjusts the **granularity** control (coarse / medium / fine; default medium).
4. Clicks **Generate Wiki**.
5. Watches a per-PDF status list update live (queued → extracting → OCR fallback → generating → done / failed).
6. When the batch completes, sees a summary panel: number of pages generated, number of cross-refs, list of failed PDFs (if any).
7. Clicks **Import to Wiki**. Generated pages are copied into `<vault>/wiki/`. On filename collision, written as `<title> (1).md`, `(2)`, etc.
8. Opens Obsidian and browses the imported pages.

## 5. Architecture

Single Next.js (App Router) application running on `localhost:3000`. Frontend (React + ShadCN) and backend (Route Handlers) live in the same TypeScript codebase.

```
┌──────────────────────────────────────────────────────────────┐
│  Next.js App (localhost:3000)                                 │
│                                                               │
│  ┌────────────┐      ┌────────────────┐      ┌────────────┐ │
│  │ Upload UI  │─────▶│ POST           │      │ GET        │ │
│  │ Status list│◀─────│ /api/process  │◀────▶│ /api/events│ │
│  │ Import btn │      │ (starts batch) │ SSE  │ (stream)   │ │
│  └────────────┘      └────────────────┘      └────────────┘ │
│        │                     │                                │
│        │                     ▼                                │
│        │             ┌──────────────────┐                    │
│        │             │ Pipeline (per    │                    │
│        │             │ PDF):            │  ┌──────────────┐  │
│        │             │  parse           │─▶│ Anthropic    │  │
│        │             │  OCR fallback    │  │ API (Sonnet  │  │
│        │             │  vault titles    │  │ 4.6, Haiku   │  │
│        │             │  Claude extract  │  │ 4.5 for OCR) │  │
│        │             │  write staging   │  └──────────────┘  │
│        │             └──────────────────┘                    │
│        │                     │                                │
│        │                     ▼                                │
│        │             staging/<batchId>/*.md                  │
│        │                                                      │
│        ▼                                                      │
│  POST /api/import                                             │
│        │                                                      │
│        ▼                                                      │
│  <vault>/wiki/*.md                                            │
└──────────────────────────────────────────────────────────────┘
```

### 5.1 Stack

- **Framework:** Next.js (App Router) with TypeScript.
- **UI:** ShadCN/ui, Tailwind, Radix primitives, lucide-react icons.
- **PDF text + page-image extraction:** `pdfjs-dist` (single library for both text per page and rendering pages to PNG for OCR).
- **LLM SDK:** `@anthropic-ai/sdk`.
- **Streaming:** Native Web Streams + Server-Sent Events for status updates.
- **State management (frontend):** React state + Zustand if it grows; no Redux.
- **Filesystem:** Node `fs/promises`.

### 5.2 Models

- **Concept extraction:** `claude-sonnet-4-6` (good reasoning, structured-output reliable, cost reasonable with prompt caching).
- **OCR transcription:** `claude-haiku-4-5-20251001` (fast, cheap, high-quality vision).
- Both invoked via the Anthropic SDK using prompt caching on the static system prompt and (where applicable) the vault-titles block.

## 6. Components

### 6.1 Frontend modules

- `app/page.tsx` — main screen: upload zone, granularity control, status list, summary, import button.
- `components/upload-zone.tsx` — drag-drop, multi-file, PDF-only, ShadCN styled.
- `components/granularity-slider.tsx` — three-position segmented control (coarse / medium / fine).
- `components/status-list.tsx` — per-PDF row showing name, current stage, progress dot or spinner, error if any. Subscribes to SSE.
- `components/summary-panel.tsx` — shown when batch completes: counts + import button + failed-PDF list.
- `lib/sse-client.ts` — wraps `EventSource` with typed events.

### 6.2 Backend modules

- `app/api/process/route.ts` — `POST` accepting multipart form data (PDFs + granularity). Spawns a batch, returns `{ batchId }`.
- `app/api/events/[batchId]/route.ts` — `GET` SSE stream of status events for a batch.
- `app/api/import/[batchId]/route.ts` — `POST` copies staging files into vault.
- `lib/pipeline/parse-pdf.ts` — text extraction with per-page output.
- `lib/pipeline/ocr-fallback.ts` — page-image rendering + Claude vision transcription, called only for pages whose text is below threshold.
- `lib/pipeline/extract-concepts.ts` — Claude Sonnet call with structured output schema.
- `lib/pipeline/scan-vault.ts` — lists `.md` filenames (without extension) in vault, recursively, excluding `.obsidian/`.
- `lib/pipeline/write-staging.ts` — writes pages to `staging/<batchId>/`.
- `lib/pipeline/import-to-vault.ts` — copies staging → vault with collision suffixing.
- `lib/events/bus.ts` — in-process event bus keyed by `batchId` to bridge pipeline → SSE.
- `lib/config.ts` — loads `.env` config (vault path, API key, model IDs).

## 7. Data Model

### 7.1 In-memory batch state

```ts
type Stage =
  | "queued"
  | "parsing"
  | "ocr"
  | "extracting"
  | "writing"
  | "done"
  | "failed";

interface PdfStatus {
  pdfId: string;
  filename: string;
  stage: Stage;
  pagesGenerated: number;
  error?: string;
}

interface BatchState {
  batchId: string;
  granularity: "coarse" | "medium" | "fine";
  pdfs: Record<string, PdfStatus>;
  startedAt: string;
  completedAt?: string;
}
```

State lives in a module-scoped `Map<batchId, BatchState>` since the app is single-user, single-process. Lost on server restart — acceptable.

### 7.2 Generated wiki page (Markdown)

```markdown
---
title: Stochastic Gradient Descent
source: "deep-learning-textbook.pdf, pages 142–158"
batch: 2026-04-26-1430
generated: 2026-04-26T14:32:11Z
---

# Stochastic Gradient Descent

Brief paragraph defining the concept...

## Key Properties
- ...

## Related
- [[Gradient Descent]]
- [[Mini-batch Gradient Descent]]
- [[Adam Optimizer]]

---
*Source: deep-learning-textbook.pdf, pages 142–158*
```

### 7.3 Claude structured output schema

```ts
interface ExtractionResult {
  pages: Array<{
    title: string;            // becomes filename
    body: string;             // markdown body without frontmatter
    sourcePages: string;      // e.g. "pp. 142–158"
    links: string[];          // wikilink targets (titles only)
  }>;
}
```

The model is instructed to:
- Use exact titles from the supplied vault-titles list when a concept matches one.
- Otherwise propose new titles (which become new sibling pages).
- Avoid creating pages that duplicate vault titles unless materially adding new content; if duplicating, append a disambiguation suffix.

## 8. Pipeline Detail

**Pre-batch (once per upload):**

- **Vault scan** (`scan-vault.ts`)
  - Walk vault recursively, ignoring only `.obsidian/` and `.trash/`. The vault's `wiki/` subfolder IS included so subsequent batches can link to pages from earlier batches.
  - Returns a `Set<string>` of titles (filenames without `.md`).
  - Cached on the `BatchState` and passed to every PDF in the batch.

**Per-PDF (PDFs run in parallel, capped at 3 concurrent):**

1. **Parse** (`parse-pdf.ts`)
   - Extract text per page.
   - Tag each page as `text` (≥ 100 chars meaningful text) or `image` (below threshold).
   - Emit `stage: "parsing"` event.

2. **OCR fallback** (`ocr-fallback.ts`) — only if any page is `image`
   - Render image-flagged pages to PNG (max 2048px wide).
   - For each, call Claude Haiku with the image and a transcription prompt.
   - Replace the page's empty text with the transcription.
   - Emit `stage: "ocr"` event with progress.

3. **Concept extraction** (`extract-concepts.ts`)
   - Build prompt:
     - System prompt (cached): role, output schema, granularity guidance, link policy.
     - User content: vault titles list (cached across batch), full PDF text, granularity choice.
   - Call Sonnet 4.6 with structured output / JSON schema.
   - Validate result; on schema failure, retry once with feedback, then fail this PDF.
   - Emit `stage: "extracting"` event.

4. **Write staging** (`write-staging.ts`)
   - Slugify titles for filenames (preserve case, replace `/` with `-`, etc.).
   - Write `staging/<batchId>/<title>.md` with frontmatter + body.
   - Emit per-page `stage: "writing"` events with `pagesGenerated` count.

5. **Done** — emit `stage: "done"` for the PDF.

When all PDFs reach a terminal state (`done` or `failed`), emit a `batch:complete` event so the frontend can render the import button.

### 8.1 Granularity instructions to the model

- **Coarse:** "Produce 5–25 pages. One per major topic. Each page 500–1500 words."
- **Medium:** "Produce 25–100 pages. One per distinct named concept, theorem, algorithm, or term. Each page 200–600 words."
- **Fine:** "Produce 100–500 pages. One per any definable term, including sub-concepts."

For very short inputs (e.g., a one-page LinkedIn screenshot), the model is told to ignore the lower bound and produce as many as the content supports — even just one page.

## 9. Cross-Reference Linking

- The vault-titles set is built once per batch and passed to the model.
- The model places `[[Title]]` links inline AND lists them in a `links:` field per page.
- Post-processing: walk each generated page's body, ensuring every `[[link]]` either matches a vault title OR matches another generated page's title in the same batch. Stale links are converted to plain text.
- After import, Obsidian's native resolver takes over.

## 10. Import to Vault

- Triggered by `POST /api/import/[batchId]`.
- Reads all files from `staging/<batchId>/`.
- For each, computes target path `<VAULT_PATH>/wiki/<filename>`.
- If target exists: increments `(N)` suffix until free, e.g. `Backpropagation (1).md`, `Backpropagation (2).md`.
- Writes file. Returns `{ imported: number, conflicts: number }`.
- On any FS error (permissions, vault unreachable), surface in UI; do not partial-rollback (Obsidian users can delete bad files manually).
- Vault `wiki/` directory is created on first import if it doesn't exist.

## 11. Configuration

`.env.local`:

```
ANTHROPIC_API_KEY=...
OBSIDIAN_VAULT_PATH=/Users/freddy/Documents/fred's vault
WIKI_SUBFOLDER=wiki
EXTRACTION_MODEL=claude-sonnet-4-6
OCR_MODEL=claude-haiku-4-5-20251001
MAX_CONCURRENT_PDFS=3
OCR_TEXT_THRESHOLD=100
```

`lib/config.ts` validates these at startup; missing required keys → fail fast with a readable message.

## 12. Error Handling

- **Per-PDF isolation:** A failure in one PDF does not abort the batch. The PDF's status becomes `failed` with an `error` string surfaced in the UI.
- **OCR failures:** A failed page gets an empty body and a warning is logged; extraction proceeds with partial text.
- **Schema-violation extractions:** One retry with the validation error in the prompt, then mark PDF failed.
- **Vault unreachable at import:** Surface error in UI; staging files remain so the user can retry.
- **API rate limits:** Respect `Retry-After`; bound retries to 3 per call.
- **No silent failures:** Every catch block either re-throws, sets `stage: "failed"` with a reason, or emits a warning event.
- **TypeScript discipline:** No `any`; failures use discriminated `Result` types or thrown `Error` subclasses.

## 13. UI / Visual Design

- Match the aesthetic of `https://freddysongg.me/` — dark mode default, restrained palette, generous whitespace, mono-style accents where appropriate.
- ShadCN components: `Button`, `Card`, `Progress`, `Badge`, `Dialog`, `Input`, `Tabs`, `Separator`, `ScrollArea`, `Skeleton`, `Tooltip`, `Toast` (Sonner).
- Single screen. No routing beyond root.
- Layout:
  - Header: app name, settings icon (dialog showing resolved config).
  - Main:
    - Upload card (drop zone, granularity slider, generate button).
    - Status card (per-PDF rows, animated stage indicators).
    - Summary card (appears on completion: page count, link count, import button, failed-PDF expandable list).
- Empty state: friendly hint "Drop PDFs here to begin".
- Toasts for completion / errors / import success.

## 14. Testing Strategy

- **Unit tests (vitest):**
  - Parser: known-text PDF returns expected text per page.
  - OCR threshold logic.
  - Filename slugification + collision resolver (`(1)`, `(2)`).
  - Wikilink post-processor (drops stale links, keeps valid ones).
  - Config loader (missing env, malformed paths).
- **Integration tests:**
  - Mock Anthropic SDK; run `extract-concepts.ts` with canned responses; assert structured output is validated.
  - Pipeline end-to-end with a small fixture PDF and a fake vault directory; assert correct files written.
  - Import handler: create vault tmpdir, run import twice, assert `(1)` suffix on second pass.
- **Manual verification:**
  - One arxiv paper, one image-only PDF, one LinkedIn screenshot — verify pages produced and links wired.
  - Run twice in a row, confirm collisions get suffixed correctly.

## 15. Open Items / Defaults Chosen Without Explicit Confirmation

These were assumed during design; the user can override before plan-writing:

1. **Vault path stored in `.env.local`** (with the user's known path as default), not editable from the UI. Rationale: keeps secrets/paths in one place; simplest.
2. **Staging folder location:** `<project>/staging/<batchId>/`. Persists across runs (only cleared by user).
3. **Concurrency cap of 3 PDFs in parallel.** Reasonable for personal use; configurable via env.
4. **Vault scan excludes `.obsidian/` and `.trash/`** but includes everything else.
5. **PDF-only input.** No `.txt`, `.md`, or image input in v1.
6. **No translation.** Wiki pages are in source language; cross-refs match by exact title.
7. **`pdfjs-dist`** chosen for both text extraction and page rendering (single PDF library).

## 16. Out of Scope (v1)

- Per-page review/edit before import.
- Editing existing vault notes (merge/append).
- Watching a directory for new PDFs.
- Multi-batch dashboard / history.
- Authentication, user accounts, deployment.
