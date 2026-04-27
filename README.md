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
