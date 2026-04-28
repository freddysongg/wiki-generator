# Auto Granularity Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire a per-PDF classifier into the pipeline so `granularity=auto` produces real model-driven granularity decisions instead of a hardcoded fallback to `medium`.

**Architecture:** Introduces `pickGranularity()` — a small LLM-tool call returning `coarse | medium | fine` per PDF. `runBatch` resolves `auto` after parse/OCR but before extraction; non-`auto` values bypass the classifier entirely. Failures fall back to `medium` and never fail the batch.

**Tech Stack:** Same as existing pipeline — Anthropic / OpenAI via `lib/llm`, Zod for validation, Vitest for tests.

**Spec:** [`docs/superpowers/specs/2026-04-28-auto-granularity-backend-design.md`](../specs/2026-04-28-auto-granularity-backend-design.md)

---

## Task ordering

```
T1  ResolvedGranularity type
T2  Config — granularityPickerModel field
T3  Config tests for new field
T4  pickGranularity tests (TDD red)
T5  pickGranularity implementation (TDD green)
T6  Tighten extractConcepts type, drop auto-fallback
T7  Wire pickGranularity into run-batch + new test
T8  Wire pickGranularity into /api/process route + test mock update
T9  .env.example + README
T10 Final typecheck + tests
```

All sequential — they share contract surfaces.

---

## File Structure

### Created

| Path                                          | Responsibility                                                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `lib/pipeline/pick-granularity.ts`            | Classifier function. Single export `pickGranularity({ client, model, pdfText, pageCount }) → Promise<ResolvedGranularity>`. |
| `tests/lib/pipeline/pick-granularity.test.ts` | Unit tests for the classifier.                                                                                              |

### Modified

| Path                                   | Reason                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| `lib/types.ts`                         | Add `ResolvedGranularity` type.                                                 |
| `lib/config.ts`                        | Add `granularityPickerModel` field.                                             |
| `lib/pipeline/extract-concepts.ts`     | Narrow `granularity` to `ResolvedGranularity`; remove `auto → medium` block.    |
| `lib/pipeline/run-batch.ts`            | Add `pickGranularity` hook, resolve `auto` per PDF, log + fall back on failure. |
| `app/api/process/route.ts`             | Wire `pickGranularity` hook with `cfg.granularityPickerModel`.                  |
| `tests/lib/config.test.ts`             | Cover the new field's defaults + override.                                      |
| `tests/lib/pipeline/run-batch.test.ts` | Add `pickGranularity` to every `hooks` block; add new `auto` test.              |
| `tests/api/process.test.ts`            | Add `granularityPickerModel` to the `loadConfig` mock.                          |
| `.env.example`                         | Document `GRANULARITY_PICKER_MODEL`.                                            |
| `README.md`                            | List the picker model in the "Models used" section.                             |

---

## Task T1: Add `ResolvedGranularity` type

**Files:** Modify `lib/types.ts`

- [ ] **Step 1: Add the type and rewrite Granularity in terms of it**

In `lib/types.ts`, replace the existing `Granularity` line:

```typescript
export type Granularity = "coarse" | "medium" | "fine" | "auto";
```

with:

```typescript
export type ResolvedGranularity = "coarse" | "medium" | "fine";

export type Granularity = ResolvedGranularity | "auto";
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: PASS. The new alias is structurally identical.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "add: resolvedgranularity type for non-auto granularity values"
```

---

## Task T2: Add `granularityPickerModel` to config

**Files:** Modify `lib/config.ts`

- [ ] **Step 1: Update the schema, defaults, AppConfig, and loadConfig**

In `lib/config.ts`:

1. Add `granularityPickerModel: z.string().min(1).optional(),` inside `RawSchema`, alongside the existing `extractionModel` / `ocrModel` fields.
2. Extend the per-provider defaults blocks:

```typescript
const ANTHROPIC_DEFAULTS = {
  extraction: "claude-sonnet-4-6",
  ocr: "claude-haiku-4-5-20251001",
  granularityPicker: "claude-haiku-4-5-20251001",
} as const;

const OPENAI_DEFAULTS = {
  extraction: "gpt-4o",
  ocr: "gpt-4o-mini",
  granularityPicker: "gpt-4o-mini",
} as const;
```

3. Add the field to the `AppConfig` interface:

```typescript
export interface AppConfig {
  llmProvider: "anthropic" | "openai";
  anthropicApiKey?: string;
  openaiApiKey?: string;
  vaultPath: string;
  wikiSubfolder: string;
  extractionModel: string;
  ocrModel: string;
  granularityPickerModel: string;
  maxConcurrentPdfs: number;
  ocrTextThreshold: number;
}
```

4. Add to the `loadConfig` raw object:

```typescript
const raw = {
  // existing entries
  granularityPickerModel: process.env.GRANULARITY_PICKER_MODEL,
  // remaining existing entries
};
```

5. Add to the returned config:

```typescript
return {
  // existing entries
  ocrModel: data.ocrModel ?? defaults.ocr,
  granularityPickerModel:
    data.granularityPickerModel ?? defaults.granularityPicker,
  // remaining existing entries
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add lib/config.ts
git commit -m "add: granularitypickermodel config field with provider defaults"
```

---

## Task T3: Config tests for new field

**Files:** Modify `tests/lib/config.test.ts`

- [ ] **Step 1: Read the existing test file**

Run: `cat tests/lib/config.test.ts` (or read the file). Identify the existing pattern for asserting defaults and overrides.

- [ ] **Step 2: Add tests for the new field**

Add tests that mirror the existing `ocrModel` tests — one assertion that the Anthropic default is `claude-haiku-4-5-20251001`, one for OpenAI's `gpt-4o-mini`, and one for `GRANULARITY_PICKER_MODEL` env override. The exact test shape depends on the existing file's testing utilities; follow whatever pattern is already there for `ocrModel`.

If the existing tests pass `loadConfig` with an env stub object, do the same. If they manipulate `process.env`, follow that. **Do not introduce a new pattern.**

- [ ] **Step 3: Run targeted tests**

Run: `npx vitest run tests/lib/config.test.ts`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/lib/config.test.ts
git commit -m "add: tests for granularitypickermodel default and env override"
```

---

## Task T4: pickGranularity tests (TDD red)

**Files:** Create `tests/lib/pipeline/pick-granularity.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import { describe, it, expect, vi } from "vitest";
import { pickGranularity } from "@/lib/pipeline/pick-granularity";
import type { LlmClient, ToolCallRequest } from "@/lib/llm";

type CallToolFn = (req: ToolCallRequest) => Promise<unknown>;

function makeClient(callTool: CallToolFn): LlmClient {
  return {
    callTool,
    vision: vi.fn(async () => ""),
  };
}

describe("pickGranularity", () => {
  it("returns coarse / medium / fine when the model picks it", async () => {
    for (const choice of ["coarse", "medium", "fine"] as const) {
      const callTool = vi.fn<CallToolFn>(async () => ({
        choice,
        reason: "test",
      }));
      const result = await pickGranularity({
        client: makeClient(callTool),
        model: "claude-haiku-4-5-20251001",
        pdfText: "x".repeat(2000),
        pageCount: 4,
      });
      expect(result).toBe(choice);
    }
  });

  it("sends a sample with first 3000 + last 500 chars when text is long", async () => {
    const head = "H".repeat(3000);
    const tail = "T".repeat(500);
    const middle = "M".repeat(2000);
    const callTool = vi.fn<CallToolFn>(async () => ({
      choice: "medium",
      reason: "test",
    }));
    await pickGranularity({
      client: makeClient(callTool),
      model: "claude-haiku-4-5-20251001",
      pdfText: head + middle + tail,
      pageCount: 12,
    });
    const req = callTool.mock.calls[0]?.[0];
    expect(req).toBeDefined();
    if (!req) throw new Error("expected callTool call");
    expect(req.body).toContain(head);
    expect(req.body).toContain(tail);
    expect(req.body).not.toContain(middle);
    expect(req.body).toContain("[…]");
    expect(req.body).toContain("Page count: 12");
  });

  it("sends the document verbatim when shorter than the threshold", async () => {
    const callTool = vi.fn<CallToolFn>(async () => ({
      choice: "coarse",
      reason: "short",
    }));
    const text = "Just a small doc. Three sentences total. End.";
    await pickGranularity({
      client: makeClient(callTool),
      model: "claude-haiku-4-5-20251001",
      pdfText: text,
      pageCount: 1,
    });
    const req = callTool.mock.calls[0]?.[0];
    expect(req).toBeDefined();
    if (!req) throw new Error("expected callTool call");
    expect(req.body).toContain(text);
    expect(req.body).not.toContain("[…]");
  });

  it("retries once on schema-invalid output, then succeeds", async () => {
    const callTool = vi
      .fn<CallToolFn>()
      .mockResolvedValueOnce({ wrong: "shape" })
      .mockResolvedValueOnce({ choice: "fine", reason: "long" });
    const result = await pickGranularity({
      client: makeClient(callTool),
      model: "claude-haiku-4-5-20251001",
      pdfText: "x",
      pageCount: 200,
    });
    expect(result).toBe("fine");
    expect(callTool).toHaveBeenCalledTimes(2);
  });

  it("throws after a second schema failure", async () => {
    const callTool = vi.fn<CallToolFn>(async () => ({ nope: 1 }));
    await expect(
      pickGranularity({
        client: makeClient(callTool),
        model: "claude-haiku-4-5-20251001",
        pdfText: "x",
        pageCount: 1,
      }),
    ).rejects.toThrow();
  });

  it("rejects out-of-enum choice values", async () => {
    const callTool = vi.fn<CallToolFn>(async () => ({
      choice: "extra-fine",
      reason: "made up",
    }));
    await expect(
      pickGranularity({
        client: makeClient(callTool),
        model: "claude-haiku-4-5-20251001",
        pdfText: "x",
        pageCount: 1,
      }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests — should FAIL (function does not exist)**

Run: `npx vitest run tests/lib/pipeline/pick-granularity.test.ts`
Expected: FAIL with module-not-found or undefined errors.

- [ ] **Step 3: Stage but do NOT commit yet** — commit alongside T5 implementation.

---

## Task T5: pickGranularity implementation (TDD green)

**Files:** Create `lib/pipeline/pick-granularity.ts`

- [ ] **Step 1: Write the file**

```typescript
import { z } from "zod";
import type { LlmClient } from "@/lib/llm";
import type { ResolvedGranularity } from "@/lib/types";

export interface PickGranularityDeps {
  client: LlmClient;
  model: string;
  pdfText: string;
  pageCount: number;
}

const SYSTEM_PROMPT = `You classify a document to pick the best wiki granularity.

Choose one of three values based on document length, conceptual density, and breadth:
- coarse: short or narrowly-scoped material (under ~5 pages of substantive text). Produces 5-25 wiki pages.
- medium: typical paper, report, or chapter (~5-50 pages). Produces 25-100 pages.
- fine: long reference material (textbook, full RFC, encyclopedia chapter, large manual). Produces 100-500 pages.

If the document is ambiguous between two levels, choose the lower one.

You MUST call the pick_granularity tool. Do not produce a text response.`;

const ResultSchema = z.object({
  choice: z.enum(["coarse", "medium", "fine"]),
  reason: z.string(),
});

const TOOL_NAME = "pick_granularity";
const TOOL_DESCRIPTION =
  "Return the wiki granularity that best fits this document.";
const TOOL_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    choice: { type: "string", enum: ["coarse", "medium", "fine"] },
    reason: { type: "string" },
  },
  required: ["choice", "reason"],
};

const HEAD_CHARS = 3000;
const TAIL_CHARS = 500;
const SAMPLE_THRESHOLD = HEAD_CHARS + TAIL_CHARS;
const MAX_TOKENS = 200;
const MAX_ATTEMPTS = 2;

function buildSample(pdfText: string): string {
  if (pdfText.length <= SAMPLE_THRESHOLD) return pdfText;
  const head = pdfText.slice(0, HEAD_CHARS);
  const tail = pdfText.slice(pdfText.length - TAIL_CHARS);
  return `${head}\n\n[…]\n\n${tail}`;
}

export async function pickGranularity(
  deps: PickGranularityDeps,
): Promise<ResolvedGranularity> {
  const sample = buildSample(deps.pdfText);
  const body = `Page count: ${deps.pageCount}\n\nSample:\n${sample}`;

  let lastError: string | undefined;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const systemPrompt = lastError
      ? `${SYSTEM_PROMPT}\n\nPrevious attempt failed validation: ${lastError}. Fix and retry.`
      : SYSTEM_PROMPT;

    const raw = await deps.client.callTool({
      model: deps.model,
      maxTokens: MAX_TOKENS,
      systemPrompt,
      body,
      tool: {
        name: TOOL_NAME,
        description: TOOL_DESCRIPTION,
        schema: TOOL_SCHEMA,
      },
    });

    const parsed = ResultSchema.safeParse(raw);
    if (parsed.success) return parsed.data.choice;
    lastError = parsed.error.message;
  }

  throw new Error(
    `Granularity classifier failed schema validation after retry: ${lastError}`,
  );
}
```

- [ ] **Step 2: Run tests — should PASS**

Run: `npx vitest run tests/lib/pipeline/pick-granularity.test.ts`
Expected: all 6 tests PASS.

- [ ] **Step 3: Commit T4 + T5 together**

```bash
git add lib/pipeline/pick-granularity.ts tests/lib/pipeline/pick-granularity.test.ts
git commit -m "add: pickgranularity classifier with retry and bounded sampling"
```

---

## Task T6: Tighten extractConcepts type and drop auto fallback

**Files:** Modify `lib/pipeline/extract-concepts.ts`

- [ ] **Step 1: Update the import and the type**

In `lib/pipeline/extract-concepts.ts`:

Change:

```typescript
import type { ExtractionResult, Granularity } from "@/lib/types";
```

to:

```typescript
import type { ExtractionResult, ResolvedGranularity } from "@/lib/types";
```

Change `ExtractDeps.granularity` from `Granularity` to `ResolvedGranularity`.

- [ ] **Step 2: Remove the auto fallback**

Delete the block:

```typescript
/* auto granularity defaults to medium until backend support lands; spec 2026-04-28 */
const promptGranularity =
  deps.granularity === "auto" ? "medium" : deps.granularity;
const body = `Granularity: ${promptGranularity}\n\nPDF text:\n${deps.pdfText}`;
```

Replace with:

```typescript
const body = `Granularity: ${deps.granularity}\n\nPDF text:\n${deps.pdfText}`;
```

- [ ] **Step 3: Verify**

Run: `npx vitest run tests/lib/pipeline/extract-concepts.test.ts`
Expected: PASS — existing tests use `granularity: "medium"`, which is a valid `ResolvedGranularity`.

Run: `npm run typecheck`
Expected: typecheck will FAIL on `lib/pipeline/run-batch.ts` because it currently passes `Granularity` (which includes `"auto"`) into a parameter typed `ResolvedGranularity`. T7 fixes this.

- [ ] **Step 4: Stage but do NOT commit yet** — commit alongside T7.

---

## Task T7: Wire pickGranularity into run-batch

**Files:** Modify `lib/pipeline/run-batch.ts`, `tests/lib/pipeline/run-batch.test.ts`

- [ ] **Step 1: Update `BatchHooks` and `processPdf`**

In `lib/pipeline/run-batch.ts`:

Add to imports:

```typescript
import type {
  BatchEvent,
  ExtractionResult,
  GeneratedPage,
  Granularity,
  ResolvedGranularity,
  Stage,
} from "@/lib/types";
```

Update `BatchHooks`:

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

In `processPdf`, after the OCR phase and `fullText` is constructed (line ~99) but before the `extractConcepts` call, insert:

```typescript
let resolvedGranularity: ResolvedGranularity;
if (granularity === "auto") {
  try {
    resolvedGranularity = await hooks.pickGranularity({
      pdfText: fullText,
      pageCount: parsed.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `[run-batch] pickGranularity failed for ${pdf.filename}; falling back to medium:`,
      message,
    );
    resolvedGranularity = "medium";
  }
} else {
  resolvedGranularity = granularity;
}
```

Replace the existing `extractConcepts` call to pass `granularity: resolvedGranularity`.

- [ ] **Step 2: Update existing run-batch tests**

In `tests/lib/pipeline/run-batch.test.ts`, every `hooks` block must add a `pickGranularity` mock. Add this line to each block:

```typescript
pickGranularity: vi.fn().mockResolvedValue("medium"),
```

(There are four `hooks` objects in the file at this point — every test gets the addition.)

- [ ] **Step 3: Add new test for the auto path**

Append a new `it(...)` inside the `describe("runBatch", ...)` block:

```typescript
it("calls pickGranularity per pdf when granularity is auto and forwards the result", async () => {
  const bus = new EventBus();
  const picker = vi.fn().mockResolvedValue("fine");
  const extract = vi.fn().mockResolvedValue({
    pages: [{ title: "T", body: "B", sourcePages: "p.1", links: [] }],
  });

  await runBatch({
    bus,
    batchId: "bauto",
    granularity: "auto",
    stagingDir: staging,
    vaultPath: vault,
    maxConcurrent: 2,
    pdfs: [
      { pdfId: "p1", filename: "a.pdf", bytes: new Uint8Array([1]) },
      { pdfId: "p2", filename: "b.pdf", bytes: new Uint8Array([2]) },
    ],
    hooks: {
      parsePdf: vi
        .fn()
        .mockResolvedValue([{ pageNumber: 1, text: "the page", kind: "text" }]),
      renderPdfPageToPng: vi.fn(),
      ocrPageImage: vi.fn(),
      scanVaultTitles: vi.fn().mockResolvedValue(new Set<string>()),
      pickGranularity: picker,
      extractConcepts: extract,
    },
  });

  expect(picker).toHaveBeenCalledTimes(2);
  expect(extract).toHaveBeenCalledTimes(2);
  expect(extract.mock.calls[0]?.[0]?.granularity).toBe("fine");
  expect(extract.mock.calls[1]?.[0]?.granularity).toBe("fine");
});

it("does not call pickGranularity when granularity is non-auto", async () => {
  const bus = new EventBus();
  const picker = vi.fn().mockResolvedValue("fine");
  await runBatch({
    bus,
    batchId: "bskip",
    granularity: "coarse",
    stagingDir: staging,
    vaultPath: vault,
    maxConcurrent: 1,
    pdfs: [{ pdfId: "p1", filename: "a.pdf", bytes: new Uint8Array([1]) }],
    hooks: {
      parsePdf: vi
        .fn()
        .mockResolvedValue([{ pageNumber: 1, text: "ok", kind: "text" }]),
      renderPdfPageToPng: vi.fn(),
      ocrPageImage: vi.fn(),
      scanVaultTitles: vi.fn().mockResolvedValue(new Set<string>()),
      pickGranularity: picker,
      extractConcepts: vi.fn().mockResolvedValue({
        pages: [{ title: "T", body: "B", sourcePages: "p.1", links: [] }],
      }),
    },
  });
  expect(picker).not.toHaveBeenCalled();
});

it("falls back to medium and continues when pickGranularity throws", async () => {
  const bus = new EventBus();
  const events: BatchEvent[] = [];
  bus.subscribe("bfail", (e) => events.push(e));
  const picker = vi.fn().mockRejectedValue(new Error("classifier down"));
  const extract = vi.fn().mockResolvedValue({
    pages: [{ title: "T", body: "B", sourcePages: "p.1", links: [] }],
  });

  await runBatch({
    bus,
    batchId: "bfail",
    granularity: "auto",
    stagingDir: staging,
    vaultPath: vault,
    maxConcurrent: 1,
    pdfs: [{ pdfId: "p1", filename: "a.pdf", bytes: new Uint8Array([1]) }],
    hooks: {
      parsePdf: vi
        .fn()
        .mockResolvedValue([{ pageNumber: 1, text: "ok", kind: "text" }]),
      renderPdfPageToPng: vi.fn(),
      ocrPageImage: vi.fn(),
      scanVaultTitles: vi.fn().mockResolvedValue(new Set<string>()),
      pickGranularity: picker,
      extractConcepts: extract,
    },
  });

  expect(picker).toHaveBeenCalledTimes(1);
  expect(extract.mock.calls[0]?.[0]?.granularity).toBe("medium");
  const done = events.find((e) => e.type === "status" && e.stage === "done");
  expect(done).toBeDefined();
});
```

- [ ] **Step 4: Run targeted tests**

Run: `npx vitest run tests/lib/pipeline/run-batch.test.ts tests/lib/pipeline/extract-concepts.test.ts tests/lib/pipeline/pick-granularity.test.ts`
Expected: PASS.

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit T6 + T7 together**

```bash
git add lib/pipeline/extract-concepts.ts lib/pipeline/run-batch.ts tests/lib/pipeline/run-batch.test.ts
git commit -m "feat: resolve auto granularity per pdf via pickgranularity hook"
```

---

## Task T8: Wire pickGranularity into the API route

**Files:** Modify `app/api/process/route.ts`, `tests/api/process.test.ts`

- [ ] **Step 1: Update the route**

In `app/api/process/route.ts`:

Add an import at the top of the imports block:

```typescript
import { pickGranularity } from "@/lib/pipeline/pick-granularity";
```

Inside the `hooks` object passed to `runBatch`, add (alongside the existing hooks):

```typescript
pickGranularity: (args) =>
  pickGranularity({
    client: llm,
    model: cfg.granularityPickerModel,
    pdfText: args.pdfText,
    pageCount: args.pageCount,
  }),
```

- [ ] **Step 2: Update the api test mock**

In `tests/api/process.test.ts`, add `granularityPickerModel: "claude-haiku-4-5-20251001",` to the `loadConfig` mock object alongside the existing `extractionModel` and `ocrModel`.

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/api/process.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/api/process/route.ts tests/api/process.test.ts
git commit -m "feat: wire pickgranularity into /api/process"
```

---

## Task T9: Update env example and README

**Files:** Modify `.env.example`, `README.md`

- [ ] **Step 1: Add to `.env.example`**

After the existing `OCR_MODEL=` line (or wherever models are listed), add:

```
GRANULARITY_PICKER_MODEL=
```

If `.env.example` includes a leading comment, add a single matching comment line above:

```
# Optional: model used for the auto-granularity classifier. Defaults to a small/fast model per provider.
```

- [ ] **Step 2: Update `README.md` Models section**

In the section that currently lists `claude-sonnet-4-6` for extraction and `claude-haiku-4-5-20251001` for OCR, add a third bullet:

```
- claude-haiku-4-5-20251001 (or gpt-4o-mini) for the auto-granularity classifier.
```

Or rephrase to fit the existing prose. The point is to document the third model.

- [ ] **Step 3: Commit**

```bash
git add .env.example README.md
git commit -m "update: document granularity_picker_model env var"
```

---

## Task T10: Final typecheck + tests

- [ ] **Step 1: Whole-codebase typecheck**

Run: `npm run typecheck`
Expected: PASS. If errors appear, repair them in a follow-up commit.

- [ ] **Step 2: Whole-codebase tests**

Run: `npm test`
Expected: all tests PASS. The count grew from 74 to ~85 (6 new pickGranularity tests + 3 new run-batch tests + 3 new config tests).

- [ ] **Step 3: If anything fails**

Repair, commit fixes with concise messages (`fix: <what>`).

---

## Self-Review

**Spec coverage check:**

- Goal — covered across T1–T8.
- Decisions table all axes:
  - Per-PDF resolution → T7 (loop in `processPdf`).
  - Resolution timing after parse/OCR → T7 (placement of the new block).
  - Dedicated function → T4/T5.
  - Cheap default model → T2 (defaults block).
  - Failure fallback → T7 (try/catch with `medium`).
  - Sample size 3000+500 → T5 (`buildSample`).
  - No UI surfacing → no UI tasks; matches spec scope.
- File-level changes: every "Modified" path in the spec has a task.
- Acceptance criteria #1–#8 → covered by run-batch tests (T7) and final verification (T10). #6 (TypeScript error on `auto`) is enforced by T6's type narrowing.

**Placeholder scan:** No "TBD"/"TODO"/"similar to" left. Every code step shows the exact code or the exact diff to apply.

**Type consistency:** `ResolvedGranularity` is used identically in pickGranularity output, BatchHooks input, and ExtractDeps. The function name `pickGranularity` is used consistently across files. The hook arg shape `{ pdfText, pageCount }` matches between `BatchHooks.pickGranularity` (T7) and the route wiring (T8).

**Spec gap check:** None.

---

## Execution

Single subagent dispatched in this session. The tasks are sequential and share contract surfaces, so no parallelization. After the subagent completes, run a final code review and fix any issues.
