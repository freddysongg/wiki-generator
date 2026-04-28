# wiki-generator

Local-only Next.js tool that turns PDFs into a cross-referenced Markdown wiki for Obsidian.

## Setup

1. `cp .env.example .env.local` and fill in `OBSIDIAN_VAULT_PATH` plus the API key for your chosen provider (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`).
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

## LLM provider

Set `LLM_PROVIDER` to `anthropic` (default) or `openai`. Each provider requires its own API key.

### Anthropic (default)
- `ANTHROPIC_API_KEY` required
- Defaults: `claude-sonnet-4-6` for extraction, `claude-haiku-4-5-20251001` for OCR, `claude-haiku-4-5-20251001` for the auto-granularity classifier

### OpenAI
- `OPENAI_API_KEY` required, `LLM_PROVIDER=openai`
- Defaults: `gpt-4o` for extraction, `gpt-4o-mini` for OCR, `gpt-4o-mini` for the auto-granularity classifier
- Both models must support vision and function-calling

Override any default with `EXTRACTION_MODEL` / `OCR_MODEL` / `GRANULARITY_PICKER_MODEL` in `.env.local`.

## Folder layout

- `app/` — Next.js App Router.
- `lib/pipeline/` — PDF parse, OCR, extract, write, import.
- `lib/events/` — in-process pub/sub for SSE.
- `staging/` — generated batches before import (gitignored).
