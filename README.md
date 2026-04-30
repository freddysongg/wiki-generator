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

## Frontmatter schema (v1)

Every generated note starts with frozen YAML frontmatter. Plain scalars and arrays only — nothing nested — so plugins like Linter and Templater don't reformat or strip fields.

```yaml
---
title: "Backpropagation"
aliases:
  - Backprop
type: concept
source: "Goodfellow_DeepLearning.pdf, pp. 14-22"
sourcePages: "pp. 14-22"
tags:
  - wiki-generator
batch: "2026-04-27T00-00-00-000Z-abc12345"
created: "2026-04-27T00:00:00.000Z"
---
```

| field | type | notes |
|---|---|---|
| `title` | string | canonical concept name; matches the filename. |
| `aliases` | string[] | alternative names users might type — abbreviations, plural/singular, common variants. always present, may be `[]`. used by Obsidian's wikilink resolver and the Various Complements plugin. |
| `type` | `"concept"` | literal for now. future versions may add `"source"`, `"entity"`. |
| `source` | string | source PDF filename (no path). matches the manifest's `source` field. |
| `sourcePages` | string | the page range alone, e.g. `"pp. 14-22"`. |
| `tags` | string[] | always includes `wiki-generator`. add your own via downstream plugins. |
| `batch` | string | the batch id this note came from. survives import. |
| `created` | string (ISO 8601) | when the batch ran. |

Stable across patch versions. Breaking changes bump the major version of the manifest spec (next section).

## Batch manifest

Each batch writes a single `manifest.json` to `staging/<batchId>/` describing every page produced — the structured form of the wiki. Used by the in-app graph preview and consumable by future Obsidian importers.

`GET /api/manifest/<batchId>` serves the same JSON. Returns 404 if the batch doesn't exist.

```json
{
  "version": "1.0.0",
  "batchId": "2026-04-27T00-00-00-000Z-abc12345",
  "createdAt": "2026-04-27T00:00:00.000Z",
  "granularity": "medium",
  "pages": [
    {
      "title": "Backpropagation",
      "filename": "Backpropagation.md",
      "aliases": ["Backprop"],
      "type": "concept",
      "source": "Goodfellow_DeepLearning.pdf",
      "sourcePages": "pp. 14-22",
      "tags": ["wiki-generator"],
      "links": ["Gradient Descent", "Chain Rule"],
      "createdAt": "2026-04-27T00:00:00.000Z"
    }
  ]
}
```

`links` are the wikilink targets the model emitted. Some may be titles already in the user's vault — they're not necessarily nodes in this batch. The graph view treats unresolved targets as "external links" and counts them separately.

The `version` field follows semver — patch bumps mean schema-compatible additions, minor bumps mean compatible field changes, major bumps mean a breaking schema. Consumers should reject unknown major versions.

## Recommended Obsidian plugins

The wiki-generator's output is shaped to play well with these community plugins. None are required — they amplify the result.

- **PDF++** — links wikilinks to specific PDF page selections. Drop the source PDFs into your vault and `[[file.pdf#page=14]]` becomes navigable. Pairs with the `sourcePages` frontmatter.
- **Extended Graph** — upgrades Obsidian's core graph with property/tag/link-type filters. Filter by `tag:wiki-generator` to isolate generated notes.
- **Dataview** — query the wiki with `TABLE source FROM #wiki-generator`. The frozen frontmatter schema is designed for this; queries written today will keep working.
- **Various Complements** — autocompletes `[[wikilinks]]` against titles AND aliases. Critical companion since cross-references rely on canonical naming.
- **Linter** (optional) — formats YAML. Disable "remove empty properties" or it strips empty `aliases: []` arrays.

Smart Connections, Smart Composer, and Copilot are complementary too: the wiki-generator produces the corpus, those plugins enrich it.

## Folder layout

- `app/` — Next.js App Router.
- `lib/pipeline/` — PDF parse, OCR, extract, write, import.
- `lib/events/` — in-process pub/sub for SSE.
- `staging/` — generated batches before import (gitignored). Each batch directory contains the generated `.md` notes plus a `manifest.json`.
