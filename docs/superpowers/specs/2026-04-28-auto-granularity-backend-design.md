# Auto Granularity Backend — Design Spec

**Date:** 2026-04-28
**Scope:** Implement the backend behavior for `granularity=auto` so that the LLM picks the appropriate wiki granularity per PDF based on document content. UI plumbing for `auto` already exists (slider, type union, API validator, `extract-concepts.ts` fallback to `medium`). This spec replaces that fallback with a real classifier.
**Predecessor spec:** `2026-04-28-brutalist-redesign-design.md` introduced the `auto` UI option and explicitly deferred the backend.

## Goal

When the user submits a batch with `granularity="auto"`, every PDF in the batch is independently classified before extraction. The classifier returns one of `coarse | medium | fine`, which is then used for that PDF's extraction call. From the user's perspective, choosing `Auto` produces the same wiki output it would have produced if they manually picked the granularity that best fits each document.

## Decisions locked

| Axis                   | Choice                                                                                      | Rejected                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Resolution scope       | Per-PDF (each document classified independently)                                            | Per-batch (one classification for all PDFs together — fails on mixed content)       |
| Classification timing  | Inside `runBatch`, after parse/OCR (so OCR'd text is available), before `extractConcepts`   | Before `runBatch` (no parsed text yet); inside `extractConcepts` (couples concerns) |
| Classifier shape       | Dedicated `pickGranularity` function with its own model and tool schema                     | Embed in `extractConcepts` system prompt (harder to test, tangles two outputs)      |
| Model                  | Cheap/fast model — defaults to `claude-haiku-4-5-20251001` / `gpt-4o-mini`, env-overridable | Reuse extraction model (overkill for a 3-way classification)                        |
| Failure handling       | Fall back to `medium` and log a warning; never fail the batch over a classifier failure     | Fail the PDF (poor UX — user picked auto for convenience, not strictness)           |
| Sample size            | First 3000 chars + last 500 chars + page count                                              | Full text (token-wasteful); first 1000 chars (insufficient for long docs)           |
| UI surfacing of choice | None this pass — backend-only                                                               | Emit a new `BatchEvent` variant (out of scope; can add later)                       |

## How `auto` should be picked

The classifier instructs the model to consider document length, conceptual density, and topical breadth. Heuristic rubric encoded in the system prompt:

- **coarse** — short document (under ~5 pages of substantive text), narrow topic, would produce only a handful of useful pages. Examples: a single tutorial, a 2-page memo, a focused conference abstract.
- **medium** — typical academic paper, technical report, or chapter (~5–50 pages of text); multiple distinct concepts but still one coherent topic. Default for ambiguous cases.
- **fine** — long reference material with many independently-linkable concepts (textbooks, full RFCs, encyclopedic content, large manuals).

The model returns its choice plus a one-sentence rationale. The rationale is logged for observability but not surfaced in the UI this pass.

## File-level changes

### Created

| Path                                          | Responsibility                                                                                                                                                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `lib/pipeline/pick-granularity.ts`            | `pickGranularity({ client, model, pdfText, pageCount })` → `Promise<ResolvedGranularity>`. Calls `client.callTool` with a 3-way enum tool schema; returns the picked value or throws on persistent invalid output. |
| `tests/lib/pipeline/pick-granularity.test.ts` | Unit tests — calls each enum, schema validation, retry on invalid, rejection on second invalid.                                                                                                                    |

### Modified

| Path                                          | Change                                                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/types.ts`                                | Add `export type ResolvedGranularity = "coarse" \| "medium" \| "fine";`. Express `Granularity` as `ResolvedGranularity \| "auto"` so the relationship is explicit.                                                                                                                                                                                |
| `lib/pipeline/extract-concepts.ts`            | Tighten `ExtractDeps.granularity` to `ResolvedGranularity` (was `Granularity`). Remove the `auto → medium` normalization block (lines 77-80). The function no longer accepts `"auto"` — that's a contract change enforced by the type.                                                                                                            |
| `lib/pipeline/run-batch.ts`                   | Add `pickGranularity` to `BatchHooks`. Inside `processPdf`, after the parsing/OCR phase, if `args.granularity === "auto"`, call `hooks.pickGranularity({ pdfText: fullText, pageCount: parsed.length })`. Pass the resolved value into `hooks.extractConcepts`. On classifier throw, log a warning to `console.warn` and fall back to `"medium"`. |
| `app/api/process/route.ts`                    | Wire `pickGranularity` into the `hooks` object. Use a new `cfg.granularityPickerModel` value.                                                                                                                                                                                                                                                     |
| `lib/config.ts`                               | Add `granularityPickerModel: string` to `AppConfig`. Add `GRANULARITY_PICKER_MODEL` env binding. Defaults: `claude-haiku-4-5-20251001` for Anthropic, `gpt-4o-mini` for OpenAI.                                                                                                                                                                   |
| `tests/lib/pipeline/run-batch.test.ts`        | Add `pickGranularity: vi.fn()` to every `hooks` block (TypeScript will require it). Add a new test: `granularity: "auto"` → `pickGranularity` called, returned value passed to `extractConcepts`.                                                                                                                                                 |
| `tests/lib/pipeline/extract-concepts.test.ts` | No behavior change. Existing tests use `granularity: "medium"`, which remains valid.                                                                                                                                                                                                                                                              |
| `tests/api/process.test.ts`                   | The existing `loadConfig` mock must add `granularityPickerModel: "claude-haiku-4-5-20251001"` (or any string) so the route can read it. Existing assertions remain valid — `granularity=auto` still flows through.                                                                                                                                |
| `tests/lib/config.test.ts`                    | Add coverage for the new `granularityPickerModel` field — env override and defaults for both providers.                                                                                                                                                                                                                                           |
| `.env.example`                                | Add `GRANULARITY_PICKER_MODEL=` line with a comment.                                                                                                                                                                                                                                                                                              |
| `README.md`                                   | Update the "Models used" section to include the picker model.                                                                                                                                                                                                                                                                                     |

### Untouched

- All UI components (per scope; UI plumbing is already in place).
- SSE event types (no new event variants this pass).
- Tests for unrelated logic.

## API contract

### `pickGranularity` function

```typescript
export interface PickGranularityDeps {
  client: LlmClient;
  model: string;
  pdfText: string;
  pageCount: number;
}

export function pickGranularity(
  deps: PickGranularityDeps,
): Promise<ResolvedGranularity>;
```

Internal contract:

- Sends a tool call request with `system`, `body`, and a single tool definition.
- Sample text passed in body: when the document is longer than 3500 chars, send the first 3000 chars + literal marker `\n\n[…]\n\n` + last 500 chars. When the document is 3500 chars or shorter, send it verbatim with no marker.
- On schema-invalid output, retries once (mirroring `extractConcepts`).
- On second invalid output, throws an `Error` whose message includes the validator failure.

### `BatchHooks` shape

```typescript
export interface BatchHooks {
  parsePdf: (bytes: Uint8Array) => Promise<ParsedPageInput[]>;
  renderPdfPageToPng: (
    bytes: Uint8Array,
    pageNumber: number,
  ) => Promise<Uint8Array>;
  ocrPageImage: (png: Uint8Array) => Promise<string>;
  scanVaultTitles: (vaultPath: string) => Promise<Set<string>>;
  pickGranularity: (args: {
    pdfText: string;
    pageCount: number;
  }) => Promise<ResolvedGranularity>;
  extractConcepts: (args: {
    pdfText: string;
    vaultTitles: string[];
    granularity: ResolvedGranularity;
  }) => Promise<ExtractionResult>;
}
```

### Classifier prompt

System prompt (use exactly):

```
You classify a document to pick the best wiki granularity.

Choose one of three values based on document length, conceptual density, and breadth:
- coarse: short or narrowly-scoped material (under ~5 pages of substantive text). Produces 5-25 wiki pages.
- medium: typical paper, report, or chapter (~5-50 pages). Produces 25-100 pages.
- fine: long reference material (textbook, full RFC, encyclopedia chapter, large manual). Produces 100-500 pages.

If the document is ambiguous between two levels, choose the lower one.

You MUST call the pick_granularity tool. Do not produce a text response.
```

Tool schema:

```json
{
  "type": "object",
  "properties": {
    "choice": { "type": "string", "enum": ["coarse", "medium", "fine"] },
    "reason": { "type": "string" }
  },
  "required": ["choice", "reason"]
}
```

User body:

```
Page count: <N>

Sample (first 3000 chars + last 500 chars):
<text>
```

## Failure modes

| Scenario                                                  | Behavior                                                                                                                                                                                           |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pickGranularity` throws after retry                      | `runBatch` catches the throw inside `processPdf`, logs `console.warn` with PDF id and message, falls back to `medium`, continues to extraction. The batch does NOT fail because of the classifier. |
| Classifier returns malformed output once                  | `pickGranularity` retries (mirrors `extractConcepts` retry pattern).                                                                                                                               |
| Classifier returns malformed output twice                 | `pickGranularity` throws → caught above → fallback to `medium`.                                                                                                                                    |
| User picks `auto` while OCR fails on every page (no text) | The classifier receives empty/near-empty text. Either it picks `coarse` (likely) or returns invalid → fallback. Either way the batch proceeds.                                                     |
| LLM provider unreachable during classifier call           | `pickGranularity` throws via the LLM client → fallback.                                                                                                                                            |

## Acceptance criteria

1. POSTing `granularity=auto` with one PDF to `/api/process` triggers exactly one `pickGranularity` call before `extractConcepts` for that PDF.
2. The value returned by `pickGranularity` is passed verbatim to `extractConcepts.granularity`.
3. POSTing `granularity=auto` with three PDFs triggers three independent `pickGranularity` calls, one per PDF.
4. POSTing `granularity=medium` (or any non-auto value) does NOT call `pickGranularity`.
5. If `pickGranularity` throws, the affected PDF still completes extraction with `granularity=medium` and the batch reports `done` for that PDF (not `failed`).
6. `extractConcepts` no longer contains the `auto → medium` normalization. Calling it with `granularity="auto"` is a TypeScript error.
7. `npm run typecheck` is clean. `npm test` passes.
8. `lib/config.ts` exposes `granularityPickerModel` with the documented defaults and env override.

## Out of scope

- Surfacing the picked granularity in the UI (manifest, pipeline row, toast). Future work.
- Persisting the picked granularity in the staged batch metadata (no batch metadata file exists yet).
- Adaptive sample-size policies (e.g. larger samples for very long documents). Fixed sample is fine for v1.
- Caching classifier decisions across re-runs (no batch-level persistence layer).
- Allowing the user to override an `auto` choice mid-batch.

## Open questions

None. All ambiguities listed during scoping resolved into the decisions table or the failure modes table above.

## Risks

- **Picker model misclassifies short documents as `fine`.** Mitigated by the system prompt's explicit length guidance and the "if ambiguous, pick lower" rule. If misclassification rates prove high, the rubric tightens in a future spec.
- **Adding a hook breaks every existing `runBatch` test.** Each test's `hooks` block needs `pickGranularity: vi.fn()`. Mechanical fix; covered in the plan.
- **Cost.** Adds one cheap-model call per PDF. Haiku/4o-mini at ~3500 chars input + ~50 tokens output is well under one cent per PDF for both providers. Acceptable.
