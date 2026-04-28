# Brutalist Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the wiki-generator's retro Mac-OS UI with a softened industrial-brutalist redesign while keeping all pipeline / API / SSE behavior unchanged. Add forward-readiness for multi-view navigation and an `auto` granularity option.

**Architecture:** Two-column shell (sidebar + main column) under sticky top/bottom rules. New components: `<AppShell>`, `<Sidebar>` (wordmark + nav + manifest), `<SidebarNav>`, `<Manifest>`, `<PageHero>`, `<SectionMarker>`, `BatchContext`. The Generate view at `/` retains all current state and effects; manifest stats are exposed via `BatchContext`. Stub routes for Graph / Plugins / History.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS v4 (CSS custom-property tokens), Inter (Google Fonts), shadcn-style primitives via `class-variance-authority`, Vitest + Testing Library.

**Spec:** [`docs/superpowers/specs/2026-04-28-brutalist-redesign-design.md`](../specs/2026-04-28-brutalist-redesign-design.md)

---

## Parallelization Map

```
Stage 1 — Foundation (sequential)
  T1  Tokens + globals.css rewrite
  T2  Granularity type extension
  T3  /api/process accepts "auto"
  T4  Root layout (Inter only)

Stage 2 — Slices (parallel; A and B independent)
  Slice A — Shell:        T5 → T6 → T7 → T8 → T9 → T10 → T11 → T12
  Slice B — UI primitives: T13 (button) ‖ T14 (card) ‖ T15 (sonner) ‖ T16 (badge audit)

Stage 3 — Feature components (parallel after Stage 2)
  T17 GranularitySlider (with Auto)
  T18 UploadZone
  T19 StatusList
  T20 SummaryPanel

Stage 4 — Integration (sequential)
  T21 Rewrite app/page.tsx (Generate view)
  T22 Delete components/header.tsx
  T23 Stub routes — graph, plugins, history pages

Stage 5 — Verify (sequential)
  T24 Typecheck
  T25 Test suite
  T26 Manual smoke against dev server (call out to user; do not start server)
```

---

## File Structure

### Created

| Path                            | Responsibility                                                                                                   |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `components/app-shell.tsx`      | Top rule, sidebar slot, main slot, bottom rule. Reads `usePathname` for active-view labels in the rules.         |
| `components/sidebar.tsx`        | Composes wordmark, `<SidebarNav>`, `<Manifest>`.                                                                 |
| `components/sidebar-nav.tsx`    | Nav list — links to /, /graph, /plugins, /history. Highlights active row via `usePathname`.                      |
| `components/manifest.tsx`       | Live stats panel reading `BatchContext`. Shows em-dashes when no batch is active.                                |
| `components/page-hero.tsx`      | Per-view hero — eyebrow, headline, body, optional right-aligned spec block.                                      |
| `components/section-marker.tsx` | The `001 — Input` row. Props: `index`, `label`, `tail`.                                                          |
| `components/batch-context.tsx`  | React context exposing `{ stage, files, statuses, totals }` so the manifest and bottom-rule can read live state. |
| `app/graph/page.tsx`            | Stub view.                                                                                                       |
| `app/plugins/page.tsx`          | Stub view.                                                                                                       |
| `app/history/page.tsx`          | Stub view.                                                                                                       |

### Modified

| Path                                           | Change                                                                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `app/globals.css`                              | Replace OS token block + remove all `os-*` component classes + remove background ornament.                                     |
| `app/layout.tsx`                               | Drop `IBM_Plex_Mono`. Wrap children in `<BatchProvider>` and `<AppShell>`.                                                     |
| `app/page.tsx`                                 | Strip OS window wrapper. Render `<PageHero>` + section markers + workflow blocks. State unchanged; pushes into `BatchContext`. |
| `app/api/process/route.ts`                     | Accept `auto` in granularity validation.                                                                                       |
| `lib/types.ts`                                 | Extend `Granularity` union to include `"auto"`.                                                                                |
| `components/granularity-slider.tsx`            | Four flush segments with `Auto` + AI tag.                                                                                      |
| `components/upload-zone.tsx`                   | Strip mono / glyph. New brutalist styling.                                                                                     |
| `components/status-list.tsx`                   | Grid-row layout. Drop badge + glyph.                                                                                           |
| `components/summary-panel.tsx`                 | Three-cell hero-numeric block + flush import row.                                                                              |
| `components/ui/button.tsx`                     | Brutalist variants (filled bone / outline / ghost / destructive). Sans only.                                                   |
| `components/ui/card.tsx`                       | 1px hairline border, no shadow, no radius.                                                                                     |
| `components/ui/sonner.tsx`                     | Charcoal/bone toaster, 1px border, 0 radius.                                                                                   |
| `tests/components/granularity-slider.test.tsx` | Add coverage for `Auto`.                                                                                                       |
| `tests/components/summary-panel.test.tsx`      | Update label assertions (mixed case `Pages`/`Links`/`Failed`, button label `Import to Wiki`).                                  |
| `tests/components/status-list.test.tsx`        | Update for grid layout (filename + stage label assertion).                                                                     |
| `tests/components/upload-zone.test.tsx`        | Update label match (`/drop or select pdf/i`).                                                                                  |
| `tests/api/process.test.ts`                    | Add `auto` accept case.                                                                                                        |

### Deleted

| Path                      | Reason                                                     |
| ------------------------- | ---------------------------------------------------------- |
| `components/header.tsx`   | Replaced by `<AppShell>` chrome and `<Sidebar>` wordmark.  |
| `components/ui/badge.tsx` | If audit shows zero usages after Stage 3. Decision in T16. |

---

## Stage 1 — Foundation

### Task T1: Replace globals.css tokens

**Files:**

- Modify: `app/globals.css`

- [ ] **Step 1: Replace the entire file**

```css
@import "tailwindcss";
@import "tw-animate-css";
@import "shadcn/tailwind.css";

:root {
  --bg: #1f1d1a;
  --bg-2: #25221e;
  --fg: #e6dfcd;
  --fg-mute: #9a9180;
  --fg-faint: #6a6256;
  --rule: #4a463d;
  --rule-2: #5e5848;
  --accent: #c25a3a;

  --t-hero-size: 64px;
  --t-display-size: 28px;
  --t-body-size: 13px;
  --t-label-size: 10px;
  --t-eyebrow-size: 9px;
  --t-meta-size: 9px;

  --rail-w: 200px;
  --rule-h-top: 32px;
  --rule-h-bot: 28px;

  --background: var(--bg);
  --foreground: var(--fg);
  --card: var(--bg-2);
  --card-foreground: var(--fg);
  --popover: var(--bg-2);
  --popover-foreground: var(--fg);
  --primary: var(--fg);
  --primary-foreground: var(--bg);
  --secondary: var(--bg-2);
  --secondary-foreground: var(--fg);
  --muted: var(--bg-2);
  --muted-foreground: var(--fg-mute);
  --accent-foreground: var(--fg);
  --destructive: var(--accent);
  --border: var(--rule);
  --input: var(--rule);
  --ring: var(--fg);
  --radius: 0;
}

@theme inline {
  --color-background: var(--bg);
  --color-foreground: var(--fg);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);

  --color-bg: var(--bg);
  --color-bg-2: var(--bg-2);
  --color-fg: var(--fg);
  --color-fg-mute: var(--fg-mute);
  --color-fg-faint: var(--fg-faint);
  --color-rule: var(--rule);
  --color-rule-2: var(--rule-2);
  --color-brand-accent: var(--accent);

  --radius-sm: 0;
  --radius-md: 0;
  --radius-lg: 0;

  --font-sans: var(--font-inter), -apple-system, system-ui, sans-serif;
  --font-mono: var(--font-inter), -apple-system, system-ui, sans-serif;
  --font-heading: var(--font-inter), -apple-system, system-ui, sans-serif;
}

@layer base {
  * {
    border-color: var(--rule);
  }
  html,
  body {
    background: var(--bg);
    color: var(--fg);
    font-family:
      var(--font-inter),
      -apple-system,
      system-ui,
      sans-serif;
    font-feature-settings:
      "tnum" 1,
      "ss01" 1;
    -webkit-font-smoothing: antialiased;
  }
  body {
    min-height: 100vh;
  }
}

@layer components {
  .t-hero {
    font-size: var(--t-hero-size);
    font-weight: 900;
    line-height: 0.92;
    letter-spacing: -0.04em;
  }
  .t-display {
    font-size: var(--t-display-size);
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.02em;
  }
  .t-body {
    font-size: var(--t-body-size);
    font-weight: 400;
    line-height: 1.45;
    letter-spacing: -0.005em;
  }
  .t-label {
    font-size: var(--t-label-size);
    font-weight: 600;
    letter-spacing: -0.005em;
  }
  .t-eyebrow {
    font-size: var(--t-eyebrow-size);
    font-weight: 600;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }
  .t-meta {
    font-size: var(--t-meta-size);
    font-weight: 500;
    letter-spacing: -0.005em;
  }
  .num-tabular {
    font-variant-numeric: tabular-nums;
  }
}
```

- [ ] **Step 2: Verify nothing references removed `os-*` classes**

Run: `grep -RIn "os-eyebrow\|os-chip\|os-status-bar\|os-window\|os-titlebar\|os-traffic\|os-tab\|os-press" app components lib`
Expected: matches will exist (we'll fix them in later tasks). Note them but do not fix here — proceed to T2.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "update: globals.css tokens to brutalist palette and type scale"
```

---

### Task T2: Extend Granularity type

**Files:**

- Modify: `lib/types.ts:10`

- [ ] **Step 1: Update the union**

In `lib/types.ts`, change:

```typescript
export type Granularity = "coarse" | "medium" | "fine";
```

to:

```typescript
export type Granularity = "coarse" | "medium" | "fine" | "auto";
```

- [ ] **Step 2: Run typecheck (will likely surface call sites)**

Run: `npm run typecheck`
Expected: PASS or specific errors. Any errors should be in pipeline code that switches on granularity. If the pipeline uses exhaustive checks, leave the case unhandled for now — the spec marks `auto` backend handling as out of scope. If a switch becomes non-exhaustive and breaks typecheck, add a temporary fallthrough to the existing `medium` behavior with a comment noting the spec, e.g.:

```typescript
case "auto":
  // spec: backend handling for auto granularity is pending; fall through to medium for now
  return runWithGranularity("medium");
```

If pipeline code uses `as const` arrays or string-literal lookups, fix those at the call site to widen to the new type.

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts <any other files touched in step 2>
git commit -m "feat: add auto granularity option to type system"
```

---

### Task T3: API route accepts `auto`

**Files:**

- Modify: `app/api/process/route.ts:19`
- Test: `tests/api/process.test.ts`

- [ ] **Step 1: Add failing test**

Append to `tests/api/process.test.ts` (inside the existing `describe`):

```typescript
it("accepts auto granularity", async () => {
  const { POST } = await import("@/app/api/process/route");
  const formData = new FormData();
  formData.append("granularity", "auto");
  formData.append(
    "files",
    new File([new Uint8Array([1])], "x.pdf", { type: "application/pdf" }),
  );
  const req = new Request("http://localhost/api/process", {
    method: "POST",
    body: formData,
  });
  const res = await POST(req);
  expect(res.status).toBe(200);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/process.test.ts -t "accepts auto"`
Expected: FAIL with `expected 400 to be 200` or similar.

- [ ] **Step 3: Update validator**

In `app/api/process/route.ts`, change:

```typescript
const GranularitySchema = z.enum(["coarse", "medium", "fine"]);
```

to:

```typescript
const GranularitySchema = z.enum(["coarse", "medium", "fine", "auto"]);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/api/process.test.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/process/route.ts tests/api/process.test.ts
git commit -m "feat: accept auto granularity in /api/process"
```

---

### Task T4: Root layout — Inter only

**Files:**

- Modify: `app/layout.tsx`

- [ ] **Step 1: Replace the file**

```tsx
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/app-shell";
import { BatchProvider } from "@/components/batch-context";
import type { ReactNode, JSX } from "react";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "wiki-gen",
  description: "Local PDF → Markdown wiki generator",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="bg-bg text-fg antialiased">
        <BatchProvider>
          <AppShell>{children}</AppShell>
        </BatchProvider>
        <Toaster />
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Note unresolved imports**

`<AppShell>` and `<BatchProvider>` do not exist yet. Typecheck will fail until Stage 2 finishes — that is intentional. **Do not commit T4 yet.** Hold the change in working tree and proceed.

```bash
git add -N app/layout.tsx
```

(The `-N` adds the path to the index without staging content, so later commits can include it cleanly.) If the orchestrator prefers to keep the change unstaged, that is also fine.

---

## Stage 2 — Slices (parallel)

### Slice A — Shell components

#### Task T5: BatchContext

**Files:**

- Create: `components/batch-context.tsx`

- [ ] **Step 1: Write the file**

```tsx
"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type JSX,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { PdfStatus } from "@/lib/types";

export type BatchStage = "idle" | "queued" | "processing" | "complete";

export interface BatchTotals {
  pages: number;
  links: number;
  failed: number;
}

export interface BatchSnapshot {
  stage: BatchStage;
  fileCount: number;
  statuses: PdfStatus[];
  totals: BatchTotals | null;
}

interface BatchContextValue {
  snapshot: BatchSnapshot;
  setSnapshot: Dispatch<SetStateAction<BatchSnapshot>>;
}

const INITIAL: BatchSnapshot = {
  stage: "idle",
  fileCount: 0,
  statuses: [],
  totals: null,
};

const BatchContext = createContext<BatchContextValue | null>(null);

export function BatchProvider({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  const [snapshot, setSnapshot] = useState<BatchSnapshot>(INITIAL);
  const value = useMemo<BatchContextValue>(
    () => ({ snapshot, setSnapshot }),
    [snapshot],
  );
  return (
    <BatchContext.Provider value={value}>{children}</BatchContext.Provider>
  );
}

export function useBatch(): BatchContextValue {
  const ctx = useContext(BatchContext);
  if (!ctx) {
    throw new Error("useBatch must be used inside <BatchProvider>");
  }
  return ctx;
}
```

- [ ] **Step 2: Typecheck this file standalone**

Run: `npx tsc --noEmit components/batch-context.tsx` (or `npm run typecheck` if other tasks already in flight)
Expected: PASS.

- [ ] **Step 3: Commit (only if running standalone; otherwise batch with subsequent shell tasks)**

```bash
git add components/batch-context.tsx
git commit -m "add: batch context for live ui state"
```

---

#### Task T6: Manifest

**Files:**

- Create: `components/manifest.tsx`

- [ ] **Step 1: Write the file**

```tsx
"use client";

import type { JSX } from "react";
import { useBatch } from "@/components/batch-context";

interface Row {
  label: string;
  value: string;
}

const STAGE_LABEL: Record<string, string> = {
  idle: "Idle",
  queued: "Queued",
  processing: "Processing",
  complete: "Complete",
};

function asValue(value: number | null): string {
  if (value === null) return "—";
  return value.toString();
}

export function Manifest(): JSX.Element {
  const { snapshot } = useBatch();
  const totals = snapshot.totals;
  const rows: Row[] = [
    { label: "Stage", value: STAGE_LABEL[snapshot.stage] ?? "Idle" },
    { label: "Files", value: snapshot.fileCount.toString() },
    { label: "Pages", value: asValue(totals?.pages ?? null) },
    { label: "Links", value: asValue(totals?.links ?? null) },
  ];
  return (
    <div className="flex flex-col gap-1.5 px-4 py-4 mt-auto border-t border-rule">
      <div className="t-eyebrow text-fg-faint mb-1">Manifest</div>
      {rows.map((row) => (
        <div
          key={row.label}
          className="flex items-baseline justify-between t-meta text-fg-mute"
        >
          <span>{row.label}</span>
          <span className="num-tabular text-fg">{row.value}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit (or batch)**

```bash
git add components/manifest.tsx
git commit -m "add: sidebar manifest live stats panel"
```

---

#### Task T7: SidebarNav

**Files:**

- Create: `components/sidebar-nav.tsx`

- [ ] **Step 1: Write the file**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { JSX } from "react";
import { cn } from "@/lib/utils";

interface NavItem {
  index: string;
  label: string;
  href: string;
  status: "active" | "soon";
}

const ITEMS: ReadonlyArray<NavItem> = [
  { index: "01", label: "Generate", href: "/", status: "active" },
  { index: "02", label: "Graph", href: "/graph", status: "soon" },
  { index: "03", label: "Plugins", href: "/plugins", status: "soon" },
  { index: "04", label: "History", href: "/history", status: "soon" },
];

export function SidebarNav(): JSX.Element {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col border-b border-rule">
      {ITEMS.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center justify-between px-4 py-2.5 t-label border-b border-rule last:border-b-0",
              isActive
                ? "bg-fg text-bg font-bold"
                : "text-fg-mute hover:bg-bg-2",
            )}
          >
            <span>
              {item.index} · {item.label}
            </span>
            {item.status === "soon" && !isActive ? (
              <span className="t-eyebrow text-fg-faint">soon</span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Commit (or batch)**

```bash
git add components/sidebar-nav.tsx
git commit -m "add: sidebar nav with active highlight"
```

---

#### Task T8: Sidebar

**Files:**

- Create: `components/sidebar.tsx`

- [ ] **Step 1: Write the file**

```tsx
import type { JSX } from "react";
import { SidebarNav } from "@/components/sidebar-nav";
import { Manifest } from "@/components/manifest";

export function Sidebar(): JSX.Element {
  return (
    <aside
      aria-label="primary navigation"
      className="flex flex-col w-[var(--rail-w)] shrink-0 border-r border-rule bg-bg"
    >
      <div className="px-4 py-3 border-b border-rule">
        <span className="font-bold text-[12px] tracking-tight text-fg">
          wiki-gen
        </span>
      </div>
      <SidebarNav />
      <Manifest />
    </aside>
  );
}
```

- [ ] **Step 2: Commit (or batch)**

```bash
git add components/sidebar.tsx
git commit -m "add: sidebar composing wordmark, nav, and manifest"
```

---

#### Task T9: PageHero

**Files:**

- Create: `components/page-hero.tsx`

- [ ] **Step 1: Write the file**

```tsx
import type { JSX, ReactNode } from "react";

interface SpecLine {
  text: string;
}

interface Props {
  eyebrow: string;
  headline: ReactNode;
  description?: string;
  spec?: ReadonlyArray<SpecLine>;
}

export function PageHero({
  eyebrow,
  headline,
  description,
  spec,
}: Props): JSX.Element {
  return (
    <header className="flex items-end justify-between gap-6 pb-3 border-b border-rule">
      <div className="flex flex-col gap-2 min-w-0">
        <span className="t-eyebrow text-fg-mute">{eyebrow}</span>
        <h1 className="t-hero text-fg break-words">{headline}</h1>
        {description ? (
          <p className="t-body text-fg-mute max-w-[42ch]">{description}</p>
        ) : null}
      </div>
      {spec && spec.length > 0 ? (
        <ul className="flex flex-col gap-1 text-right shrink-0 list-none m-0 p-0">
          {spec.map((line) => (
            <li key={line.text} className="t-meta text-fg-mute">
              {line.text}
            </li>
          ))}
        </ul>
      ) : null}
    </header>
  );
}
```

- [ ] **Step 2: Commit (or batch)**

```bash
git add components/page-hero.tsx
git commit -m "add: page hero with eyebrow, headline, and spec block"
```

---

#### Task T10: SectionMarker

**Files:**

- Create: `components/section-marker.tsx`

- [ ] **Step 1: Write the file**

```tsx
import type { JSX, ReactNode } from "react";

interface Props {
  index: string;
  label: string;
  tail?: ReactNode;
}

export function SectionMarker({ index, label, tail }: Props): JSX.Element {
  return (
    <div className="flex items-baseline justify-between t-label text-fg-mute pt-3 border-t border-rule">
      <span>
        {index} — {label}
      </span>
      {tail ? <span className="t-meta text-fg-mute">{tail}</span> : null}
    </div>
  );
}
```

- [ ] **Step 2: Commit (or batch)**

```bash
git add components/section-marker.tsx
git commit -m "add: section marker row component"
```

---

#### Task T11: AppShell

**Files:**

- Create: `components/app-shell.tsx`

- [ ] **Step 1: Write the file**

```tsx
"use client";

import type { JSX, ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { useBatch } from "@/components/batch-context";

const VIEW_LABEL: Record<string, string> = {
  "/": "Generate",
  "/graph": "Graph",
  "/plugins": "Plugins",
  "/history": "History",
};

const STAGE_PHRASE: Record<string, string> = {
  idle: "Ready",
  queued: "Queued",
  processing: "Processing",
  complete: "Complete",
};

interface Props {
  children: ReactNode;
}

export function AppShell({ children }: Props): JSX.Element {
  const pathname = usePathname();
  const view = VIEW_LABEL[pathname] ?? "Generate";
  const { snapshot } = useBatch();
  const stagePhrase = STAGE_PHRASE[snapshot.stage] ?? "Ready";

  let topRight = `${stagePhrase} · ${snapshot.fileCount} queued`;
  let bottomLeft = stagePhrase;
  if (snapshot.stage === "processing") {
    const done = snapshot.statuses.filter((s) => s.stage === "done").length;
    bottomLeft = `Processing · ${done}/${snapshot.statuses.length}`;
    topRight = bottomLeft;
  }
  if (snapshot.stage === "complete" && snapshot.totals) {
    bottomLeft = `Complete · ${snapshot.totals.pages} pages · ${snapshot.totals.links} links`;
    topRight = `Complete · ${snapshot.totals.pages} pages`;
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg text-fg">
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-4 h-[var(--rule-h-top)] border-b border-rule bg-bg t-meta text-fg-mute"
        aria-label="top status rule"
      >
        <span>wiki-gen / v0.1</span>
        <span>{topRight}</span>
      </header>
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 px-7 py-6 flex flex-col gap-5">
          {children}
        </main>
      </div>
      <footer
        className="sticky bottom-0 z-20 flex items-center justify-between px-4 h-[var(--rule-h-bot)] border-t border-rule bg-bg t-meta text-fg-mute"
        aria-label="bottom status rule"
      >
        <span>{bottomLeft}</span>
        <span>v0.1 · {view}</span>
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: Commit Slice A together (if not committing per task)**

```bash
git add components/batch-context.tsx components/manifest.tsx components/sidebar-nav.tsx components/sidebar.tsx components/page-hero.tsx components/section-marker.tsx components/app-shell.tsx
git commit -m "add: app shell, sidebar, manifest, page hero, section marker"
```

---

#### Task T12: Stub routes

**Files:**

- Create: `app/graph/page.tsx`
- Create: `app/plugins/page.tsx`
- Create: `app/history/page.tsx`

- [ ] **Step 1: Write all three**

`app/graph/page.tsx`:

```tsx
import type { JSX } from "react";
import { PageHero } from "@/components/page-hero";

export default function GraphPage(): JSX.Element {
  return (
    <>
      <PageHero
        eyebrow="View 02"
        headline="Graph."
        description="Visualize the wiki's link graph. Coming soon."
      />
      <div className="border border-rule px-5 py-6 t-body text-fg-mute">
        Coming soon.
      </div>
    </>
  );
}
```

`app/plugins/page.tsx`:

```tsx
import type { JSX } from "react";
import { PageHero } from "@/components/page-hero";

export default function PluginsPage(): JSX.Element {
  return (
    <>
      <PageHero
        eyebrow="View 03"
        headline="Plugins."
        description="Connect Obsidian plugins to the generator. Coming soon."
      />
      <div className="border border-rule px-5 py-6 t-body text-fg-mute">
        Coming soon.
      </div>
    </>
  );
}
```

`app/history/page.tsx`:

```tsx
import type { JSX } from "react";
import { PageHero } from "@/components/page-hero";

export default function HistoryPage(): JSX.Element {
  return (
    <>
      <PageHero
        eyebrow="View 04"
        headline="History."
        description="Past batches and their results. Coming soon."
      />
      <div className="border border-rule px-5 py-6 t-body text-fg-mute">
        Coming soon.
      </div>
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/graph/page.tsx app/plugins/page.tsx app/history/page.tsx
git commit -m "add: stub routes for graph, plugins, history views"
```

---

### Slice B — UI primitives (parallel with Slice A)

#### Task T13: Button

**Files:**

- Modify: `components/ui/button.tsx`

- [ ] **Step 1: Replace the variants block**

Open the file and replace its entire body with:

```tsx
import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import type { JSX } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  [
    "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap select-none",
    "font-sans text-[12px] font-semibold tracking-[-0.005em]",
    "border border-rule rounded-none",
    "transition-[background-color,color,border-color] duration-100 ease-out",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-fg focus-visible:outline-offset-2",
    "disabled:pointer-events-none disabled:opacity-40",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-fg text-bg border-fg hover:bg-fg-mute hover:border-fg-mute",
        outline: "bg-transparent text-fg border-rule-2 hover:bg-bg-2",
        ghost: "bg-transparent text-fg border-transparent hover:bg-bg-2",
        destructive:
          "bg-brand-accent text-fg border-brand-accent hover:brightness-110",
      },
      size: {
        default: "h-9 px-4",
        sm: "h-7 px-3 text-[11px]",
        lg: "h-11 px-5 text-[13px]",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps = ButtonPrimitive.Props & VariantProps<typeof buttonVariants>;

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonProps): JSX.Element {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
export type { ButtonProps };
```

- [ ] **Step 2: Audit for removed variants/sizes**

Run: `grep -RIn 'variant="link"\|variant="secondary"\|size="xs"\|size="icon-xs"\|size="icon-sm"\|size="icon-lg"' app components`
Expected: zero matches. If any remain, change them to one of the new values (`outline`, `ghost`, or `default`/`sm`/`lg`/`icon`). Common case: the `×` remove buttons in the file list use `variant="ghost" size="icon"` — that combination still works.

- [ ] **Step 3: Commit**

```bash
git add components/ui/button.tsx
git commit -m "update: button styles to brutalist variants"
```

---

#### Task T14: Card

**Files:**

- Modify: `components/ui/card.tsx`

- [ ] **Step 1: Replace the file**

```tsx
import type { ComponentProps, JSX } from "react";

import { cn } from "@/lib/utils";

type CardSize = "default" | "sm";
type CardProps = ComponentProps<"div"> & { size?: CardSize };

function Card({
  className,
  size = "default",
  ...props
}: CardProps): JSX.Element {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "flex flex-col bg-bg-2 text-fg border border-rule rounded-none",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({
  className,
  ...props
}: ComponentProps<"div">): JSX.Element {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "grid auto-rows-min items-start gap-1 px-5 pt-4 pb-3 border-b border-rule",
        "has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({
  className,
  ...props
}: ComponentProps<"div">): JSX.Element {
  return (
    <div
      data-slot="card-title"
      className={cn("t-display text-fg", className)}
      {...props}
    />
  );
}

function CardDescription({
  className,
  ...props
}: ComponentProps<"div">): JSX.Element {
  return (
    <div
      data-slot="card-description"
      className={cn("t-body text-fg-mute", className)}
      {...props}
    />
  );
}

function CardAction({
  className,
  ...props
}: ComponentProps<"div">): JSX.Element {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className,
      )}
      {...props}
    />
  );
}

function CardContent({
  className,
  ...props
}: ComponentProps<"div">): JSX.Element {
  return (
    <div data-slot="card-content" className={cn("p-5", className)} {...props} />
  );
}

function CardFooter({
  className,
  ...props
}: ComponentProps<"div">): JSX.Element {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center gap-3 px-5 py-3 border-t border-rule",
        className,
      )}
      {...props}
    />
  );
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
};
export type { CardProps, CardSize };
```

- [ ] **Step 2: Commit**

```bash
git add components/ui/card.tsx
git commit -m "update: card styles to brutalist hairline borders"
```

---

#### Task T15: Sonner toaster

**Files:**

- Modify: `components/ui/sonner.tsx`

- [ ] **Step 1: Replace the file**

```tsx
"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";
import {
  CircleCheckIcon,
  InfoIcon,
  TriangleAlertIcon,
  OctagonXIcon,
  Loader2Icon,
} from "lucide-react";
import type { JSX } from "react";

const Toaster = (props: ToasterProps): JSX.Element => {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--bg-2)",
          "--normal-text": "var(--fg)",
          "--normal-border": "var(--rule-2)",
          "--border-radius": "0",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "!rounded-none !border !border-rule-2 !bg-bg-2 !text-fg",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
```

- [ ] **Step 2: Verify no `next-themes` import remains**

Run: `grep -n "next-themes" components/ui/sonner.tsx`
Expected: zero matches.

- [ ] **Step 3: Commit**

```bash
git add components/ui/sonner.tsx
git commit -m "update: sonner toaster to brutalist palette"
```

---

#### Task T16: Badge audit

**Files:**

- Audit: `components/ui/badge.tsx`

- [ ] **Step 1: Find usages**

Run: `grep -RIn 'from "@/components/ui/badge"\|from "../ui/badge"' app components lib`
Expected: at most one match in `components/status-list.tsx` (will be removed in T19).

- [ ] **Step 2: Decision**

If the only usage is in `status-list.tsx` (which T19 rewrites to drop the import), delete `components/ui/badge.tsx` after T19 lands.

If there are other usages, restyle the badge minimally:

```tsx
import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import type { ReactElement } from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  [
    "inline-flex items-center gap-1 whitespace-nowrap",
    "t-eyebrow text-fg-mute",
    "px-2 py-1",
    "border border-rule rounded-none bg-transparent",
  ].join(" "),
  {
    variants: { variant: { default: "" } },
    defaultVariants: { variant: "default" },
  },
);

type BadgeProps = useRender.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants>;

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: BadgeProps): ReactElement {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      { className: cn(badgeVariants({ variant }), className) },
      props,
    ),
    render,
    state: { slot: "badge", variant },
  });
}

export { Badge, badgeVariants };
export type { BadgeProps };
```

- [ ] **Step 3: Defer commit until after T19 has landed (if deleting). Commit in the Stage 4 cleanup if restyling.**

---

## Stage 3 — Feature components (parallel)

### Task T17: GranularitySlider with `Auto`

**Files:**

- Modify: `components/granularity-slider.tsx`
- Test: `tests/components/granularity-slider.test.tsx`

- [ ] **Step 1: Update test first**

Replace the test file:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GranularitySlider } from "@/components/granularity-slider";

describe("GranularitySlider", () => {
  it("renders four radios and marks the active value", () => {
    render(<GranularitySlider value="medium" onChange={() => {}} />);
    const medium = screen.getByRole("radio", { name: /medium/i });
    expect(medium.getAttribute("data-active")).toBe("true");
    expect(medium.getAttribute("aria-checked")).toBe("true");
    expect(
      screen
        .getByRole("radio", { name: /coarse/i })
        .getAttribute("aria-checked"),
    ).toBe("false");
    expect(screen.getByRole("radio", { name: /auto/i })).toBeInTheDocument();
  });

  it("calls onChange when a radio is clicked", () => {
    const onChange = vi.fn();
    render(<GranularitySlider value="medium" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: /coarse/i }));
    expect(onChange).toHaveBeenCalledWith("coarse");
  });

  it("can select auto", () => {
    const onChange = vi.fn();
    render(<GranularitySlider value="medium" onChange={onChange} />);
    fireEvent.click(screen.getByRole("radio", { name: /auto/i }));
    expect(onChange).toHaveBeenCalledWith("auto");
  });

  it("shows the auto hint when auto is selected", () => {
    render(<GranularitySlider value="auto" onChange={() => {}} />);
    expect(screen.getByText(/model decides/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test (will fail)**

Run: `npx vitest run tests/components/granularity-slider.test.tsx`
Expected: FAIL (auto radio not present yet).

- [ ] **Step 3: Replace the component**

```tsx
"use client";

import type { JSX } from "react";
import type { Granularity } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  value: Granularity;
  onChange: (value: Granularity) => void;
}

interface Option {
  value: Granularity;
  label: string;
  hint: string;
  isAuto: boolean;
}

const OPTIONS: ReadonlyArray<Option> = [
  { value: "coarse", label: "Coarse", hint: "few dense pages", isAuto: false },
  { value: "medium", label: "Medium", hint: "one per concept", isAuto: false },
  { value: "fine", label: "Fine", hint: "many small pages", isAuto: false },
  {
    value: "auto",
    label: "Auto",
    hint: "model decides per document",
    isAuto: true,
  },
];

export function GranularitySlider({ value, onChange }: Props): JSX.Element {
  const activeHint = OPTIONS.find((opt) => opt.value === value)?.hint ?? "";
  return (
    <div className="flex flex-col gap-2">
      <div
        role="radiogroup"
        aria-label="granularity"
        className="grid grid-cols-4 border border-rule"
      >
        {OPTIONS.map((opt, idx) => {
          const isActive = opt.value === value;
          return (
            <button
              key={opt.value}
              role="radio"
              aria-checked={isActive}
              type="button"
              onClick={() => onChange(opt.value)}
              data-active={isActive}
              className={cn(
                "relative flex items-center justify-center px-3 py-2 t-label",
                idx > 0 && "border-l border-rule",
                isActive
                  ? "bg-fg text-bg"
                  : "bg-transparent text-fg-mute hover:bg-bg-2",
              )}
            >
              <span>{opt.label}</span>
              {opt.isAuto ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-1 right-1 t-eyebrow",
                    isActive ? "text-bg" : "text-fg-faint",
                  )}
                >
                  AI
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <span className="t-meta text-fg-mute">{activeHint}</span>
    </div>
  );
}
```

- [ ] **Step 4: Run tests (should pass)**

Run: `npx vitest run tests/components/granularity-slider.test.tsx`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add components/granularity-slider.tsx tests/components/granularity-slider.test.tsx
git commit -m "feat: add auto granularity option to slider with ai tag"
```

---

### Task T18: UploadZone

**Files:**

- Modify: `components/upload-zone.tsx`
- Modify: `tests/components/upload-zone.test.tsx`

- [ ] **Step 1: Update test label match**

In `tests/components/upload-zone.test.tsx`, replace `screen.getByLabelText(/drop pdfs here/i)` with `screen.getByLabelText(/drop or select pdf/i)` (both occurrences).

- [ ] **Step 2: Replace the component**

```tsx
"use client";

import type { ChangeEvent, DragEvent, JSX } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  onFiles: (files: File[]) => void;
  disabled: boolean;
}

function filterPdfs(files: FileList | null): File[] {
  if (!files) return [];
  return Array.from(files).filter(
    (f) =>
      f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
  );
}

export function UploadZone({ onFiles, disabled }: Props): JSX.Element {
  const [isDragging, setIsDragging] = useState<boolean>(false);

  function handleChange(e: ChangeEvent<HTMLInputElement>): void {
    onFiles(filterPdfs(e.target.files));
    e.target.value = "";
  }

  function handleDrop(e: DragEvent<HTMLLabelElement>): void {
    e.preventDefault();
    setIsDragging(false);
    if (disabled) return;
    onFiles(filterPdfs(e.dataTransfer.files));
  }

  function handleDragOver(e: DragEvent<HTMLLabelElement>): void {
    e.preventDefault();
    if (disabled) return;
    setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent<HTMLLabelElement>): void {
    e.preventDefault();
    setIsDragging(false);
  }

  return (
    <label
      htmlFor="wiki-upload-input"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      data-active={isDragging}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-1 px-6 py-8 text-center",
        "border border-dashed border-rule-2 bg-bg",
        "transition-[background-color,border-color] duration-100",
        "hover:bg-bg-2",
        "data-[active=true]:border-fg data-[active=true]:border-solid data-[active=true]:bg-bg-2",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      <span className="t-label text-fg">Drop or select PDF</span>
      <span className="t-meta text-fg-mute">multiple files supported</span>
      <input
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

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/components/upload-zone.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/upload-zone.tsx tests/components/upload-zone.test.tsx
git commit -m "update: upload zone to brutalist styling"
```

---

### Task T19: StatusList

**Files:**

- Modify: `components/status-list.tsx`
- Modify: `tests/components/status-list.test.tsx`

- [ ] **Step 1: Update test**

Replace the test file:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusList } from "@/components/status-list";
import type { PdfStatus } from "@/lib/types";

describe("StatusList", () => {
  it("renders each pdf row with stage label", () => {
    const items: PdfStatus[] = [
      {
        pdfId: "a",
        filename: "alpha.pdf",
        stage: "extracting",
        pagesGenerated: 0,
      },
      { pdfId: "b", filename: "beta.pdf", stage: "done", pagesGenerated: 12 },
    ];
    render(<StatusList items={items} />);
    expect(screen.getByText("alpha.pdf")).toBeInTheDocument();
    expect(screen.getByText("beta.pdf")).toBeInTheDocument();
    expect(screen.getByText(/12/)).toBeInTheDocument();
    expect(screen.getByText(/extracting/i)).toBeInTheDocument();
    expect(screen.getByText(/done/i)).toBeInTheDocument();
  });

  it("shows error message on failed rows", () => {
    const items: PdfStatus[] = [
      {
        pdfId: "x",
        filename: "x.pdf",
        stage: "failed",
        pagesGenerated: 0,
        error: "boom",
      },
    ];
    render(<StatusList items={items} />);
    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Replace the component**

```tsx
"use client";

import type { JSX } from "react";
import type { PdfStatus, Stage } from "@/lib/types";
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
}

export function StatusList({ items }: Props): JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col">
      {items.map((item, idx) => {
        const isFailed = item.stage === "failed";
        const isDone = item.stage === "done";
        const indexLabel = String(idx + 1).padStart(2, "0");
        return (
          <li
            key={item.pdfId}
            className="flex flex-col border-t border-rule first:border-t-0 py-2"
          >
            <div className="grid grid-cols-[28px_1fr_120px_80px] gap-3 items-baseline">
              <span className="t-label text-fg-faint num-tabular">
                {indexLabel}
              </span>
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
                {item.pagesGenerated > 0
                  ? `${item.pagesGenerated} pgs`
                  : "— pgs"}
              </span>
            </div>
            {isFailed && item.error ? (
              <div className="grid grid-cols-[28px_1fr] gap-3 mt-1">
                <span aria-hidden></span>
                <span className="t-meta text-brand-accent break-words">
                  {item.error}
                </span>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/components/status-list.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/status-list.tsx tests/components/status-list.test.tsx
git commit -m "update: status list to brutalist grid layout"
```

---

### Task T20: SummaryPanel

**Files:**

- Modify: `components/summary-panel.tsx`
- Modify: `tests/components/summary-panel.test.tsx`

- [ ] **Step 1: Update test**

Replace the test file:

```tsx
// @vitest-environment jsdom
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
    expect(screen.getByText("Pages")).toBeInTheDocument();
    expect(screen.getByText("Links")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("88")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
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

- [ ] **Step 2: Replace the component**

```tsx
"use client";

import type { JSX } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ImportResult {
  imported: number;
  conflicts: number;
}

interface BatchTotals {
  pages: number;
  links: number;
  failed: number;
}

interface Props {
  totals: BatchTotals;
  importing: boolean;
  importResult: ImportResult | null;
  onImport: () => void;
}

interface Cell {
  label: string;
  value: number;
  isWarn: boolean;
}

export function SummaryPanel({
  totals,
  importing,
  importResult,
  onImport,
}: Props): JSX.Element {
  const cells: Cell[] = [
    { label: "Pages", value: totals.pages, isWarn: false },
    { label: "Links", value: totals.links, isWarn: false },
    { label: "Failed", value: totals.failed, isWarn: totals.failed > 0 },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 border-y border-rule py-3">
        {cells.map((cell, idx) => (
          <div
            key={cell.label}
            className={cn(
              "flex flex-col gap-1 px-3",
              idx > 0 && "border-l border-rule",
            )}
          >
            <span className="t-eyebrow text-fg-mute">{cell.label}</span>
            <span
              className={cn(
                "t-hero num-tabular",
                cell.isWarn ? "text-brand-accent" : "text-fg",
              )}
            >
              {cell.value}
            </span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <span className="t-meta text-fg-mute">Awaiting import</span>
        <Button onClick={onImport} disabled={importing}>
          {importing ? "Importing…" : "Import to Wiki"}
        </Button>
      </div>
      {importResult ? (
        <div className="t-meta text-fg">
          Imported {importResult.imported}
          {importResult.conflicts > 0
            ? `, ${importResult.conflicts} renamed`
            : ""}
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/components/summary-panel.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add components/summary-panel.tsx tests/components/summary-panel.test.tsx
git commit -m "update: summary panel to brutalist hero numerals"
```

---

## Stage 4 — Integration

### Task T21: Rewrite app/page.tsx (Generate view)

**Files:**

- Modify: `app/page.tsx`

- [ ] **Step 1: Replace the file**

```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { PageHero } from "@/components/page-hero";
import { SectionMarker } from "@/components/section-marker";
import { UploadZone } from "@/components/upload-zone";
import { GranularitySlider } from "@/components/granularity-slider";
import { StatusList } from "@/components/status-list";
import { SummaryPanel, type ImportResult } from "@/components/summary-panel";
import { Button } from "@/components/ui/button";
import { useBatch } from "@/components/batch-context";
import { toast } from "sonner";
import { subscribeToBatch } from "@/lib/sse-client";
import type { BatchEvent, Granularity, PdfStatus } from "@/lib/types";

interface BatchTotals {
  pages: number;
  links: number;
  failed: number;
}

interface ProcessResponse {
  batchId: string;
  pdfs: Array<{ pdfId: string; filename: string }>;
}

interface ApiError {
  error?: string;
}

const HERO_SPEC = [
  { text: "Local-only" },
  { text: "Multi-provider" },
  { text: "Obsidian-ready" },
] as const;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

export default function Page(): JSX.Element {
  const [files, setFiles] = useState<File[]>([]);
  const [granularity, setGranularity] = useState<Granularity>("medium");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, PdfStatus>>({});
  const [totals, setTotals] = useState<BatchTotals | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const { setSnapshot } = useBatch();

  const items = useMemo(() => Object.values(statuses), [statuses]);
  const isProcessing = Boolean(batchId) && totals === null;
  const hasFiles = items.length > 0;
  const canGenerate = files.length > 0 && !isProcessing;

  useEffect(() => {
    let stage: "idle" | "queued" | "processing" | "complete" = "idle";
    if (totals !== null) stage = "complete";
    else if (isProcessing) stage = "processing";
    else if (files.length > 0) stage = "queued";
    setSnapshot({
      stage,
      fileCount: files.length || items.length,
      statuses: items,
      totals,
    });
  }, [files.length, items, isProcessing, totals, setSnapshot]);

  const handleEvent = useCallback((event: BatchEvent): void => {
    if (event.type === "status") {
      setStatuses((prev) => {
        const existing = prev[event.pdfId];
        if (!existing) return prev;
        return {
          ...prev,
          [event.pdfId]: {
            ...existing,
            stage: event.stage,
            pagesGenerated: event.pagesGenerated,
            error: event.error,
          },
        };
      });
      return;
    }
    if (event.type === "complete") {
      setTotals(event.totals);
    }
  }, []);

  useEffect(() => {
    if (!batchId) return;
    const unsubscribe = subscribeToBatch({
      batchId,
      onEvent: handleEvent,
      onError: () => toast.error("Lost connection to batch stream"),
    });
    return unsubscribe;
  }, [batchId, handleEvent]);

  const generate = useCallback(async (): Promise<void> => {
    if (files.length === 0) {
      toast.error("Add at least one PDF.");
      return;
    }
    setTotals(null);
    setImportResult(null);

    const form = new FormData();
    form.append("granularity", granularity);
    for (const file of files) form.append("files", file);

    const response = await fetch("/api/process", {
      method: "POST",
      body: form,
    });
    if (!response.ok) {
      const errorBody = (await response.json().catch(() => ({}))) as ApiError;
      toast.error(`Process failed: ${errorBody.error ?? response.status}`);
      setStatuses({});
      return;
    }
    const body = (await response.json()) as ProcessResponse;

    const seeded: Record<string, PdfStatus> = {};
    for (const pdf of body.pdfs) {
      seeded[pdf.pdfId] = {
        pdfId: pdf.pdfId,
        filename: pdf.filename,
        stage: "queued",
        pagesGenerated: 0,
      };
    }
    setStatuses(seeded);
    setBatchId(body.batchId);
  }, [files, granularity]);

  const importToVault = useCallback(async (): Promise<void> => {
    if (!batchId) return;
    setIsImporting(true);
    try {
      const response = await fetch(
        `/api/import/${encodeURIComponent(batchId)}`,
        { method: "POST" },
      );
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as ApiError;
        toast.error(`Import failed: ${errorBody.error ?? response.status}`);
        return;
      }
      const result = (await response.json()) as ImportResult;
      setImportResult(result);
      toast.success(`Imported ${result.imported} pages.`);
    } finally {
      setIsImporting(false);
    }
  }, [batchId]);

  return (
    <>
      <PageHero
        eyebrow="View 01"
        headline={<>PDF&nbsp;→&nbsp;Wiki.</>}
        description="Drop PDFs, pick a granularity, generate cross-referenced Markdown for Obsidian."
        spec={HERO_SPEC}
      />

      <section className="flex flex-col gap-3">
        <SectionMarker
          index="001"
          label="Input"
          tail={`${files.length} file${files.length === 1 ? "" : "s"} queued`}
        />
        <UploadZone onFiles={setFiles} disabled={isProcessing} />
        {files.length > 0 ? (
          <ul className="flex flex-col">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${file.size}-${index}`}
                className="flex items-center gap-3 px-3 py-2 border-t border-rule first:border-t-0"
              >
                <span
                  className="t-body text-fg truncate flex-1"
                  title={file.name}
                >
                  {file.name}
                </span>
                <span className="t-meta text-fg-mute num-tabular">
                  {formatBytes(file.size)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setFiles((prev) => prev.filter((_, i) => i !== index))
                  }
                  disabled={isProcessing}
                  aria-label={`remove ${file.name}`}
                >
                  ×
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <SectionMarker
          index="002"
          label="Granularity"
          tail={granularity[0].toUpperCase() + granularity.slice(1)}
        />
        <GranularitySlider value={granularity} onChange={setGranularity} />
        <div className="flex items-center justify-between pt-2">
          <span className="t-meta text-fg-mute">
            {isProcessing
              ? "Processing in flight"
              : `${files.length} file${files.length === 1 ? "" : "s"} queued`}
          </span>
          <Button onClick={generate} disabled={!canGenerate}>
            {isProcessing ? "Processing…" : "Generate Wiki"}
          </Button>
        </div>
      </section>

      {hasFiles ? (
        <section className="flex flex-col gap-3">
          <SectionMarker
            index="003"
            label="Pipeline"
            tail={`${items.filter((i) => i.stage === "done").length} / ${items.length} complete`}
          />
          <StatusList items={items} />
        </section>
      ) : null}

      {totals !== null ? (
        <section className="flex flex-col gap-3">
          <SectionMarker index="004" label="Output" tail="Ready" />
          <SummaryPanel
            totals={totals}
            importing={isImporting}
            importResult={importResult}
            onImport={importToVault}
          />
        </section>
      ) : null}
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx app/layout.tsx
git commit -m "refactor: rewrite generate page in brutalist shell"
```

(Stage T4's `app/layout.tsx` change comes in here too because it depends on `<AppShell>` and `<BatchProvider>` from Slice A.)

---

### Task T22: Delete header.tsx

**Files:**

- Delete: `components/header.tsx`

- [ ] **Step 1: Confirm no remaining imports**

Run: `grep -RIn 'from "@/components/header"\|from "../header"' app components lib`
Expected: zero matches.

- [ ] **Step 2: Delete the file**

```bash
git rm components/header.tsx
```

- [ ] **Step 3: Commit**

```bash
git commit -m "remove: legacy os-style header component"
```

---

### Task T23: Badge cleanup (depends on T19)

- [ ] **Step 1: Re-run grep**

Run: `grep -RIn 'from "@/components/ui/badge"\|from "../ui/badge"' app components lib`
Expected: zero matches if status-list rewrite landed.

- [ ] **Step 2: If zero matches, delete**

```bash
git rm components/ui/badge.tsx
git commit -m "remove: unused badge primitive"
```

If matches remain, leave the restyled badge from T16 in place (commit it now if not yet committed).

---

## Stage 5 — Verify

### Task T24: Typecheck

- [ ] **Step 1: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 2: If errors, fix and re-run**

Common pitfalls:

- `font-mono` Tailwind utility removed but referenced elsewhere → in this redesign `font-mono` maps to Inter via the theme block (T1), so usages still work; no change required.
- Removed `os-*` classes still referenced → search and remove.

```bash
grep -RIn "os-eyebrow\|os-chip\|os-status-bar\|os-window\|os-titlebar\|os-traffic\|os-tab\|os-press" app components lib
```

Each match must be deleted or rewritten. If a deletion lands, commit:

```bash
git commit -am "fix: remove dangling os-* class references"
```

---

### Task T25: Test suite

- [ ] **Step 1: Run all tests**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 2: If failures, repair**

The most likely failures are in the test files that asserted on old labels (`PAGES`, `drop pdfs here`, `import to vault`). These were updated alongside their components (T17–T20), so the test suite should be green. If a non-modified test fails, check whether it asserts on text rendered in `app/page.tsx` (e.g., file size formatting, stage hint) and update accordingly.

---

### Task T26: Manual smoke (handoff)

- [ ] **Step 1: Tell the user**

```
Implementation complete. Spec: docs/superpowers/specs/2026-04-28-brutalist-redesign-design.md.
Smoke checklist (run `npm run dev` yourself):
  1. / loads in dark with sidebar (Generate active), top + bottom rules, hero "PDF → Wiki."
  2. Drag a PDF in; queued row appears; "Generate Wiki" enables.
  3. Pick "Auto" — AI tag visible top-right; hint reads "model decides per document".
  4. Click Generate; pipeline section renders; manifest shows live stage / files / pages / links; bottom rule reflects progress.
  5. On complete, three big numerals; "Import to Wiki" runs the import; toast confirms.
  6. /graph, /plugins, /history each render with their own hero and "Coming soon." block; sidebar nav highlight follows the route.
  7. DevTools network shows only Inter (no IBM Plex Mono).
  8. No element has rounded corners except focus rings; no shadows.
```

(Per project rules, never run the dev server yourself.)

---

## Self-Review

**Spec coverage check:**

- Goal & scope: T1, T4, T11 (chrome) + T21 (page integration) + T12 (stub views) ✓
- Decisions table → all six axes:
  - Scope (re-skin + restructure): covered across all tasks ✓
  - Palette (charcoal & bone): T1 ✓
  - Typography (Inter only): T1, T4 ✓
  - Layout (sidebar + main): T8, T11, T21 ✓
  - Hero (per-view): T9, T21, T12 ✓
  - Navigation (sidebar nav): T7, T11 ✓
- Visual system → palette T1, typography T1, surfaces/rules T1 ✓
- Page chrome → T11 (top + bottom rules), T8 (sidebar), T9 (hero), T21 (main) ✓
- View structure → T21 (Generate full functionality), T12 (stubs) ✓
- File-level changes → all listed in plan File Structure section ✓
- State preservation → T21 explicitly retains all hooks and effects ✓
- Acceptance criteria → mapped to T26 smoke checklist ✓
- Auto granularity (forward-readiness): T2 (type), T3 (API), T17 (UI) ✓
- Multi-provider neutrality: HERO_SPEC in T21 says "Multi-provider" not "Anthropic" ✓
- Manifest persisting across views: addressed in T21 via `BatchContext` lift to layout ✓

**Placeholder scan:** No "TBD", "TODO", or vague guidance left in the plan. Every code step shows the exact code; every command shows the exact invocation.

**Type consistency:** `BatchSnapshot.stage` union (`idle/queued/processing/complete`) is referenced consistently in `<Manifest>`, `<AppShell>`, and `app/page.tsx`. `Granularity` extension is reflected in T2, T3, T17 with matching union literals.

**Spec gap check:** The spec called out a vault-destination display in `<SummaryPanel>` but flagged it as "Recommend omit for now" — T20 omits it, matching the spec.

---

## Execution

Per user direction: **Subagent-Driven Development**, parallelizing where the dependency graph allows. The orchestrator will dispatch:

1. **Stage 1 (sequential):** T1 → T2 → T3 → (T4 staged but uncommitted, depends on Slice A).
2. **Stage 2 (parallel):**
   - Slice A (single subagent): T5 → T6 → T7 → T8 → T9 → T10 → T11 → T12.
   - Slice B (single subagent): T13, T14, T15, T16 in any order.
3. **Stage 3 (parallel after Stage 2):**
   - Subagent per task: T17, T18, T19, T20.
4. **Stage 4 (sequential):** T21 → T22 → T23.
5. **Stage 5 (sequential):** T24 → T25 → T26.

After implementation, the orchestrator runs a code-review pass and applies necessary fixes.
