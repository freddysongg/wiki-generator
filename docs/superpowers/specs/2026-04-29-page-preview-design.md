# Wiki Page Preview — Design Spec

**Date:** 2026-04-29
**Scope:** Let the user inspect each generated wiki page from the Generate view — title list per source PDF, plus a rendered Markdown preview in a dialog. Pre- and post-import.

## Goal

After a batch completes, every PDF row in the Pipeline section is expandable. Expanding shows the wiki page titles generated from that PDF (with source-page reference). Clicking a title opens a dialog with the page's rendered Markdown body. Failed PDFs stay collapsed.

This is the missing inspection surface. Today the user only sees aggregate counts (`14 pgs`) — they cannot see what the generator produced until they import to their vault and open Obsidian.

## Decisions locked

| Axis                   | Choice                                                                                                      | Rejected                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Display surface        | Inline expand-on-click in the existing Pipeline section + Dialog for body                                   | Dedicated `/library` view (overscoped); side drawer (overlaps with dialog)                         |
| Data source            | Pre- and post-import: read manifest + page bodies from `staging/<batchId>/`                                 | Read from vault post-import (manifest is not copied; rename collisions complicate filename lookup) |
| Source-PDF linkage     | Use existing `manifest.pages[i].source` field (PDF filename)                                                | Add a new field (already there, just unused by UI)                                                 |
| Markdown renderer      | `react-markdown` (no GFM plugin)                                                                            | Custom inline renderer (reinvents the wheel); raw `<pre>` (defeats the point of "rendered")        |
| Wikilinks              | Render as plain text `[[Title]]`                                                                            | Resolve to internal links (no internal route to point at; future work)                             |
| Body cleanup           | Server strips YAML frontmatter, the duplicated `# Title` heading, and the trailing `*Source: …*` decoration | Strip on client (more code, less cacheable)                                                        |
| Path safety            | Manifest acts as the allowlist — only filenames listed in `manifest.pages[i].filename` are served           | Regex-validate filename (looser; manifest is the source of truth anyway)                           |
| When to fetch manifest | When the batch reaches `complete` stage; cached in `BatchProvider`                                          | Fetch on every expand (wasteful); fetch up-front (manifest doesn't exist until batch is done)      |

## How `react-markdown` is configured

- No GFM plugin (saves ~15KB; tables/strikethrough not needed for v1).
- Component overrides:
  - `h1` → suppressed (the dialog header already shows the title).
  - `h2`/`h3` → use `t-display` / `t-body` weight tokens.
  - `code` (inline) → bone background `bg-bg-2`, hairline border `border-rule`, no rounding, mono font (whatever `font-mono` resolves to — it's currently aliased to Inter; that's fine).
  - `pre` → `bg-bg-2`, `border-rule`, `overflow-x-auto`, no rounding.
  - `a` → external links open in a new tab; internal targets render as plain text since the wiki has no internal routing.
- The container gets a Tailwind `prose` analog hand-rolled in CSS (no @tailwindcss/typography dependency to keep build slim) — defined inline in the dialog body via classes.

## Data flow

```
Batch reaches "complete" stage
    │
    ▼
BatchProvider effect: GET /api/manifest/:batchId  →  store in context as `manifest`
    │
    ▼
StatusList row (stage === "done") renders an expand chevron
    │
    ▼ (user clicks chevron)
StatusList row expands → reads manifest.pages.filter(p => p.source === item.filename)
    │  renders sub-list of page titles
    ▼ (user clicks a title)
PagePreviewDialog opens
    │
    ▼
Dialog effect: GET /api/batches/:batchId/pages/:filename  →  rendered Markdown body
```

The manifest is fetched once per batch. Page bodies are fetched on demand (one fetch per dialog open) and not cached — page bodies are small (a few KB each); a stale-while-revalidate cache adds complexity.

## File-level changes

### Created

| Path                                                  | Responsibility                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/api/batches/[batchId]/pages/[filename]/route.ts` | `GET` handler that returns cleaned Markdown body for a manifest-listed page in a staged batch. Validates `batchId` via `isValidBatchId`. Validates `filename` via the manifest allowlist. Strips YAML frontmatter, leading `# Title\n\n`, and trailing source-line decoration before responding. Returns `text/markdown; charset=utf-8`. |
| `lib/pipeline/strip-page-chrome.ts`                   | Pure helper — `stripPageChrome(raw: string): string`. Removes leading `---\n…\n---\n+`, leading `# .*\n+`, and trailing `\n---\n\*Source: .*\*\n*$`. Reused by the API route and unit-tested.                                                                                                                                            |
| `components/page-preview-dialog.tsx`                  | Controlled dialog. Props: `{ open, onOpenChange, batchId, filename, title, source, sourcePages }`. Fetches body on open, renders with `react-markdown`. Shows a small spec block (source PDF + page range). Loading/error states.                                                                                                        |
| `tests/api/page-content.test.ts`                      | API route tests — happy path, invalid batchId 400, manifest-missing 404, filename-not-in-manifest 404, frontmatter stripping.                                                                                                                                                                                                            |
| `tests/lib/pipeline/strip-page-chrome.test.ts`        | Pure-function tests.                                                                                                                                                                                                                                                                                                                     |
| `tests/components/page-preview-dialog.test.tsx`       | Dialog renders content on success, error state on fetch failure, suppresses h1.                                                                                                                                                                                                                                                          |

### Modified

| Path                           | Change                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/batch-context.tsx` | Add `manifest: BatchManifest \| null` to `BatchSnapshot`. Effect inside `BatchProvider`: when `stage` flips to `complete` AND `manifest === null`, fetch `/api/manifest/${batchId}` and store the result. Reset to `null` in `startBatch`/`resetBatch`. Expose a `getPagesForSource(source: string): ManifestPage[]` helper from `useBatch()` so consumers don't reach into the snapshot.                           |
| `components/status-list.tsx`   | Each row: when `item.stage === "done"` and the manifest has pages for this `item.filename`, render an expand chevron (`▸` → `▾`). Expand toggles per-row local state. Expanded body renders a hairline-bordered sub-list of pages — title + source-pages — clickable. Failed and in-progress rows are unchanged (no chevron). The component now takes an optional `onPageOpen?: (page: ManifestPage) => void` prop. |
| `app/page.tsx`                 | Add a `useState<{ filename: string; title: string; source: string; sourcePages: string } \| null>(null)` for "selected preview." Pass `onPageOpen` to `StatusList`. Render `<PagePreviewDialog>` controlled by this state.                                                                                                                                                                                          |
| `lib/types.ts`                 | No type additions — `ManifestPage` already has every field the UI needs (`filename`, `title`, `source`, `sourcePages`).                                                                                                                                                                                                                                                                                             |
| `package.json`                 | Add `react-markdown` (`^9`). No GFM plugin.                                                                                                                                                                                                                                                                                                                                                                         |
| `lib/pipeline/manifest.ts`     | No change.                                                                                                                                                                                                                                                                                                                                                                                                          |

### Untouched

- Pipeline (parse/OCR/extract/write/manifest write).
- `/api/manifest/:batchId` route (already serves the manifest correctly).
- Import-to-vault logic. (Pages-API reads from staging only; the batch's manifest persists in staging after import because import-to-vault only copies `*.md`.)
- Stub views (Graph / Plugins / History).

## API contract

### `GET /api/batches/:batchId/pages/:filename`

**Path params:**

- `batchId` — must satisfy `isValidBatchId`. Else 400.
- `filename` — URL-encoded; will be decoded server-side.

**Response codes:**

- `200 OK` — body is `text/markdown; charset=utf-8`. Content is the cleaned Markdown body.
- `400` — invalid `batchId`.
- `404` — staging dir missing, manifest missing, or filename not in manifest's allowlist.
- `500` — read failure on a file the manifest claimed exists.

**Cleanup performed before responding:**

1. Strip leading YAML frontmatter block (matches `/^---\r?\n[\s\S]*?\r?\n---\r?\n+/`).
2. Strip the very first `# heading\n+` line if present (the duplicate title written by `writeStaging`).
3. Strip the trailing `\n---\n*Source: …*\n*$` block.
4. Trim leading/trailing whitespace.

These three pieces of chrome are emitted by `writeStaging.renderPage` deterministically; `stripPageChrome` reverses that exact rendering.

## UI behavior detail

### `<StatusList>` row, expanded state

```
01  alpha.pdf            Done            14 pgs   ▾
    ├── Backpropagation                                pp. 14-22
    ├── Gradient Descent                               pp. 18-22
    └── Loss Function                                  pp. 25-26
```

- Expand chevron is keyboard-focusable (`<button aria-expanded>`).
- Sub-rows are anchor-styled: hover `bg-bg-2`, focus-visible outline matching other interactive elements.
- Title and source-pages are on one line on desktop; wrap on narrow viewports.
- Sub-list separator is a hairline `border-t border-rule` per item.

### `<PagePreviewDialog>`

- Built on top of the existing shadcn `Dialog` component.
- Title row: page title (Inter 800, 22px) + small spec block on the right (`alpha.pdf · pp. 14-22`).
- Body: rendered Markdown, max width `60ch`, `t-body` size with `text-fg`. Headings inherit `t-display`. Code blocks: `bg-bg-2` + 1px `border-rule` + 12px padding.
- Footer: a small "Close" button (no other actions).
- Loading: a single line `Loading…` in `--t-meta`.
- Error: a single line `Could not load page.` in `text-brand-accent`.
- ESC and click-outside both close the dialog (Dialog defaults).

## Acceptance criteria

1. After a batch completes, `GET /api/manifest/:batchId` is called exactly once and the result is stored in `BatchProvider`.
2. Each `done`-stage row in `<StatusList>` for a PDF whose `filename` matches at least one manifest page renders an expand chevron.
3. Clicking the chevron toggles a sub-list showing each page's title and source-pages reference. The sub-list is filtered to only this PDF's pages.
4. Clicking a title opens `<PagePreviewDialog>` with the correct title, source PDF, and source-page reference visible.
5. The dialog fetches `GET /api/batches/:batchId/pages/:filename` and renders the body via `react-markdown`. The duplicate `# Title` heading from the file is NOT shown again. The trailing `*Source: …*` line is NOT shown.
6. ESC closes the dialog; opening another title fetches that page's body fresh.
7. `GET /api/batches/:batchId/pages/:filename` rejects path-traversal attempts (e.g., `..%2F..%2Fetc%2Fpasswd.md`) with 404 because the manifest allowlist does not contain those filenames. A test asserts this.
8. `GET /api/batches/:batchId/pages/:filename` returns 400 for invalid `batchId`.
9. `npm run typecheck` is clean. `npm test` passes (count grows by ~6–10).

## Out of scope

- Rendering wikilinks `[[Title]]` as clickable internal links.
- A library/history view that lists all batches.
- Editing pages from the dialog.
- Caching page bodies across dialog opens.
- Search within a batch's pages.
- Importing per-PDF subsets ("import only these 3 pages").

## Open questions

None. All ambiguities resolved during scoping.

## Risks

- **Manifest fetch race.** If the user navigates away from `/` mid-batch and returns just as the batch completes, the `complete` transition fires once (already idempotent) and the manifest fetch races against the transition's effect. Mitigation: the effect guards on `manifest === null`, so a re-render after navigation does not refetch.
- **Frontmatter strip regex misses an edge case.** If `extractConcepts` ever emits a body that begins with literal `---`, the strip could over-eat. Mitigation: anchor the strip to `^---\n` followed by `---\n` on its own line; the body never starts that way (the first body char is set by `extractConcepts` rules and is always a Markdown block other than `---`).
- **`react-markdown` v9 has React 19 compatibility.** Confirm before adding (tests will catch if the install fails).
