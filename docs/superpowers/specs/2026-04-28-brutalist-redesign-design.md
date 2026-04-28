# Brutalist Redesign — Design Spec

**Date:** 2026-04-28
**Scope:** Visual + structural redesign of the wiki-generator UI. Pipeline, API routes, and types are untouched.
**Source skill:** `industrial-brutalist-ui` (raw mechanical interfaces, rigid grids, Swiss-print typography), tuned for softer contrast and non-terminal type.

## Goal

Replace the current retro Mac-OS pastiche with a **softened industrial-brutalist** UI that scales to multiple feature views (Generate today; Graph, Plugins, History as future stubs). The redesign is a re-skin **plus** a structural change — the OS-window frame, traffic lights, dashed/dotted ornamentation, and centered single-column shell all go away.

## Decisions locked during brainstorm

| Axis       | Choice                                                             | Rejected                                                                                                    |
| ---------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Scope      | Re-skin + restructure key surfaces. Pipeline logic untouched.      | Pure re-skin (loses brutalist feel); full rebuild (scope creep)                                             |
| Palette    | Charcoal & Bone (warm-dark default)                                | Bone & Ink (light); Oat & Coal + Clay (light w/ accent); pure black/white (too harsh)                       |
| Typography | Inter only — extreme weight contrast (900 / 600 / 400)             | Editorial serif + sans; soft display serif + sans + numeral mono; mono-as-chrome (rejected as "robotic OS") |
| Layout     | Two-column shell: sidebar + main, full-bleed                       | Centered single column; top-nav + sidebar (rejected)                                                        |
| Hero       | **Per-view hero in the main column.** Sidebar holds wordmark only. | Banner hero across top; wide-sidebar hero                                                                   |
| Navigation | Sidebar nav list (Generate / Graph / Plugins / History)            | Top nav strip (rejected)                                                                                    |

## Visual system

### Palette (CSS custom properties, dark default)

```
--bg:        #1f1d1a   /* warm charcoal — page background */
--bg-2:      #25221e   /* sidebar / panel surface */
--fg:        #e6dfcd   /* bone — primary text + active inverts */
--fg-mute:   #9a9180   /* secondary text, labels */
--fg-faint:  #6a6256   /* tertiary text, muted markers */
--rule:      #4a463d   /* hairline borders, default */
--rule-2:    #5e5848   /* hairline borders, emphasized */
--accent:    #c25a3a   /* terracotta — error / destructive only, used sparingly */
--ok:        #e6dfcd   /* success uses fg, not green — keeps palette tight */
```

Light mode is **out of scope** for this pass. The current `[data-theme="dark"]` toggle is removed; the app ships dark.

### Typography

Single family: **Inter**, weights 400 / 500 / 600 / 700 / 900. IBM Plex Mono is removed from the layout, package, and CSS variables. No mono anywhere — labels use Inter 600, numerals use Inter `font-variation-settings: 'tnum'` for tabular alignment.

Type scale (no fluid units; rigid):

| Token         | Size | Weight | Tracking         | Use                                           |
| ------------- | ---- | ------ | ---------------- | --------------------------------------------- |
| `--t-hero`    | 64px | 900    | -0.04em          | Per-view hero headline                        |
| `--t-display` | 28px | 800    | -0.02em          | Section headlines (e.g. "Output", "Pipeline") |
| `--t-body`    | 13px | 400    | -0.005em         | Body copy, descriptions                       |
| `--t-label`   | 10px | 600    | -0.005em         | Section markers ("001 — Input")               |
| `--t-eyebrow` | 9px  | 600    | 0.18em uppercase | View eyebrow ("View 01"), masthead            |
| `--t-meta`    | 9px  | 500    | -0.005em         | Right-aligned spec blocks, status bar         |

Mixed case throughout. **No all-caps body text, no `::before "//"` ornaments.** Eyebrows use uppercase + wide tracking, never the body or labels.

### Surfaces, rules, density

- Background: flat `--bg`. **No** dot grid, scanlines, radial gradients, or paper texture.
- All borders are **1px solid `--rule`**. No dashed, no rounded — `border-radius: 0` everywhere on chrome and content. The drop zone keeps a dashed border as the single deliberate exception, since "drop here" is its semantic.
- Shadow: none. The retro `box-shadow: 4px 4px 0 0 ink` window shadow is removed.
- Section separators are hairline rules pinned to the content edges, never inset.

## Page chrome

```
┌─────────────────────────────────────────────────────────────┐
│ TOP RULE  ── wiki-gen / v0.1 ······· Idle · 0 queued        │ ← --t-meta, sticky
├──────────────┬──────────────────────────────────────────────┤
│ wiki-gen     │                                              │
│              │  View 01                                     │ ← --t-eyebrow
│ 01 · Generate│  PDF → Wiki.                                 │ ← --t-hero
│ 02 · Graph   │  Local-only generator. Drop PDFs, …          │ ← --t-body
│ 03 · Plugins │ ──────────────────────────────────────       │
│ 04 · History │                                              │
│              │  001 — Input                       0 files   │ ← --t-label
│              │  ┌────────────────────────────────────────┐  │
│  ──────────  │  │  Drop or select PDF                    │  │
│  Manifest    │  └────────────────────────────────────────┘  │
│  Stage  Idle │                                              │
│  Files  0    │  002 — Granularity                Medium    │
│  Pages  —    │  ┌──────────┬──────────┬──────────┐         │
│  Links  —    │  │ Coarse   │ Medium ▌ │ Fine     │         │
│              │  └──────────┴──────────┴──────────┘         │
├──────────────┴──────────────────────────────────────────────┤
│ BOTTOM RULE  ── Ready ········· v0.1 · Generate              │ ← --t-meta, sticky
└─────────────────────────────────────────────────────────────┘
```

- **Top rule (sticky, full-bleed).** Single hairline-bottom row. Left: `wiki-gen / v0.1`. Right: live state — same content as the manifest's `Stage` row, condensed.
- **Bottom rule (sticky, full-bleed).** Mirror of the top rule. Left: status line ("Ready", "Processing · 2/3", "Complete · 41 pages · 187 links"). Right: `v0.1 · <active-view>`.
- **Sidebar (left rail, 200px fixed width, full-height).** Three blocks separated by hairline rules:
  1. Wordmark `wiki-gen` (Inter 700, 11px).
  2. Nav list — one row per view. Active row inverts (`--fg` background, `--bg` text, weight 700). Disabled rows show a muted "soon" tag at the right edge.
  3. Manifest — sticks to the bottom of the rail. Title eyebrow + four rows (`Stage`, `Files`, `Pages`, `Links`). Values come from the live batch state; placeholders are em-dashes.
- **Main column.** Padding: 24px top/bottom, 28px left/right. Hero row at the top (eyebrow + headline + right-aligned spec block, with a hairline-bottom rule). Stack of marker-rows + content blocks below.

## View structure

Each view is a route under `app/`. View shells share the same chrome (top rule, sidebar, bottom rule); only the main column content differs.

### `/` — Generate (full functionality, current logic preserved)

Hero: eyebrow `View 01`, headline `PDF → Wiki.`, body description, right-aligned spec block (`Local-only / Multi-provider / Obsidian-ready`). Spec lines are deliberately provider-neutral — both Anthropic and OpenAI are supported via `EXTRACTION_MODEL` / `OCR_MODEL` env vars; the UI does not name vendors.

Sections (in order, separated by hairline rules):

1. **001 — Input.** Drop zone (single dashed-bordered rectangle, 1.5px, `--rule-2`); on drag-active, swap to a solid 2px border in `--fg` and tint surface to `--bg-2`. Below the zone, queued files render as flush-bordered rows (filename, size in tabular numerals, remove ×).
2. **002 — Granularity.** **Four** flush segments in one rule-bounded bar: `Coarse`, `Medium`, `Fine`, `Auto`. Active segment inverts. The `Auto` segment is fully selectable and visually identical except for a `--t-eyebrow`-sized "AI" tag in the top-right corner of the segment to flag that the model decides. Caption row beneath shows the active hint at `--t-meta`. Hints: coarse — "few dense pages"; medium — "one per concept"; fine — "many small pages"; auto — "model decides per document". Selecting `Auto` posts `granularity=auto` to `/api/process`. **Backend handling of `auto` is out of scope for this redesign**; if the backend rejects it, the existing toast error path surfaces the message. UI ships ready so the backend swap is drop-in.
3. **003 — Pipeline** (renders only when files queued). Each row is a 4-column grid: `idx | filename | stage | pages-count`. Stage strings are short labels at `--t-eyebrow`. Active rows show progress fragments inline (`OCR · 4/8`). Errored rows expand a second sub-row with the message in `--accent`. Rule between rows.
4. **004 — Output** (renders only on `complete`). Three-cell numeric block: `Pages / Links / Failed`, each value at `--t-hero` size. Below: destination path on the left, `Import to Wiki` button on the right (full-width-on-mobile collapse later; not in scope now).

The footer button row (Generate Wiki) sits at the bottom of the input section and remains the primary action while idle. It moves out of the way once a batch is in flight.

### `/graph`, `/plugins`, `/history` — Stubs

Each renders the same shell with a hero block and a single `Coming soon.` placeholder card in the main column. No business logic. The sidebar nav reflects the active view via Next.js `usePathname`.

## File-level changes

### Modified

| Path                                | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/layout.tsx`                    | Drop `IBM_Plex_Mono` import. Remove `--font-ibm-plex-mono` variable. Wrap children in `<AppShell>`. Default to dark — set `data-theme="dark"` on `<html>` (or just remove the toggle and use brutalist tokens at root).                                                                                                                                                                                                                                                                   |
| `app/page.tsx`                      | Becomes the Generate view. Strip the `os-window` wrapper and `Header` import. Replace top-level layout with `<PageHero>` + ordered sections. State management (files / batchId / statuses / totals / importResult) and effects unchanged.                                                                                                                                                                                                                                                 |
| `app/globals.css`                   | Replace the OS token block with the brutalist token block above. Remove `os-eyebrow`, `os-chip`, `os-status-bar`, `os-window`, `os-titlebar`, `os-traffic*`, `os-tab`, `os-press` component classes. Remove body `::before` dot grid + `::after` scanlines + radial-gradient background image. Light-mode block deleted.                                                                                                                                                                  |
| `components/granularity-slider.tsx` | Replace `os-tab` styling with **four** flush-bordered segments (`Coarse / Medium / Fine / Auto`). Drop `.toUpperCase()` on labels — render in mixed case. Add the `Auto` option, with a corner `AI` tag at `--t-eyebrow` size. Hint text moves to `--t-meta` with the new `auto` hint.                                                                                                                                                                                                    |
| `lib/types.ts`                      | Extend `Granularity` union to `"coarse" \| "medium" \| "fine" \| "auto"`.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `app/api/process/route.ts`          | Accept `auto` in the granularity validation set. Forward it through unchanged — backend pipeline support is a separate task; UI must not block submission.                                                                                                                                                                                                                                                                                                                                |
| `components/upload-zone.tsx`        | Drop `font-mono`, `tracking-[0.04em]`, `❒` glyph. Use `--t-label` text "Drop or select PDF" + `--t-meta` sub-line. Active state: solid border in `--fg`, no terracotta. Keep keyboard / file-input semantics.                                                                                                                                                                                                                                                                             |
| `components/status-list.tsx`        | Replace card-row layout with a 4-col grid: `idx                                                                                                                                                                                                                                                                                                                                                                                                                                           | filename | stage | pages-count`. Drop `Badge`+ glyph. Stage labels render at`--t-eyebrow` (`Queued`, `Parsing`, `OCR · 4/8`, `Done`, `Failed`). Errored row appends a second grid row with the message text in `--accent`. |
| `components/summary-panel.tsx`      | Replace tile grid with the three-cell `--t-hero`-sized numeric block. Drop the `◉ batch complete` mono ornament. Move the import button into a flush row below the numbers; render the destination path (from `process.env.NEXT_PUBLIC_VAULT_HINT` if exposed, otherwise omit) on the left.                                                                                                                                                                                               |
| `components/ui/button.tsx`          | Replace `font-mono`, `rounded-[4px]`, `border-line`, `shadow-[var(--shadow-soft)]` and the press-translate animation. Brutalist variants: `default` (filled bone, charcoal text, no shadow, no rounding); `outline` (transparent, `--rule-2` border, fg text); `ghost` (transparent, fg text, hover swaps to `--bg-2`); destructive (filled `--accent`, fg text). Sizes: `default 36px`, `sm 28px`, `lg 44px`. Drop `link` and `xs`/`icon-xs` variants if unused; verify before removing. |
| `components/ui/badge.tsx`           | Strip rounded, drop mono. Single variant: 1px border, `--t-eyebrow` text, no fill. Used for soft tags only. Verify call sites still need it after status-list rewrite — possibly delete.                                                                                                                                                                                                                                                                                                  |
| `components/ui/card.tsx`            | Drop rounded + shadow. Border 1px `--rule`. Padding tokens unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `components/ui/sonner.tsx`          | Restyle toaster to charcoal background, bone foreground, 1px `--rule` border, square corners.                                                                                                                                                                                                                                                                                                                                                                                             |
| `app/page.tsx` (file list)          | Drop the per-row `PDF` mono pill, `rounded-[2px]`, dashed border. Render as flush-bordered rows; numerals tabular.                                                                                                                                                                                                                                                                                                                                                                        |

### Created

| Path                                                                 | Purpose                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| `components/app-shell.tsx`                                           | Top-level chrome. Renders sticky top rule, `<Sidebar>`, slot for view content, sticky bottom rule. Reads `usePathname` for active-view highlighting and the bottom-right segment.                                                          |
| `components/sidebar.tsx`                                             | Left rail: wordmark + `<SidebarNav>` + `<Manifest>`.                                                                                                                                                                                       |
| `components/sidebar-nav.tsx`                                         | Static nav list. Each entry is `{ href, index, label, status: "active"                                                                                                                                                                     | "soon" }`. Active matched against `usePathname`. |
| `components/manifest.tsx`                                            | Live stats panel. Subscribes to a lightweight `BatchContext` (see below) and renders the Stage / Files / Pages / Links rows. Shows em-dashes when no batch is running.                                                                     |
| `components/page-hero.tsx`                                           | Per-view hero. Props: `eyebrow`, `headline`, `description`, `spec` (right-aligned list of small rows).                                                                                                                                     |
| `components/section-marker.tsx`                                      | The `001 — Input · 0 files` row. Props: `index`, `label`, `tail` (right side). Used by every section header.                                                                                                                               |
| `components/batch-context.tsx`                                       | React context that exposes the current batch state (files queued, statuses, totals, stage). The Generate view writes to it; the manifest reads from it. Initially scoped to the Generate view; future views can subscribe or stay neutral. |
| `app/graph/page.tsx`, `app/plugins/page.tsx`, `app/history/page.tsx` | Stub views. Each renders `<PageHero>` with its own eyebrow + headline + body copy, then a single "Coming soon." block.                                                                                                                     |

### Deleted

| Path                    | Reason                                                          |
| ----------------------- | --------------------------------------------------------------- |
| `components/header.tsx` | Replaced by `<AppShell>`'s top rule and `<Sidebar>`'s wordmark. |

### Untouched (verified during scope check)

- `app/api/**` — all routes, including `process`, `import`, `progress`.
- `lib/**` — pipeline, events, types, sse-client, utils.
- `tests/**` — existing tests still cover unchanged logic.

## State and behavior preservation

- Generate view's React state shape (files, batchId, statuses, totals, isImporting, importResult) is unchanged.
- SSE subscription via `subscribeToBatch` is unchanged.
- Toast surface (`sonner`) stays — only its styling moves to brutalist tokens.
- `BatchContext` is the only new state surface; it wraps the same primitives the existing page component already manages, so swap-in is mechanical.

## Acceptance criteria

1. Loading `/` shows the new shell: top rule, left sidebar with wordmark + 4-row nav + idle manifest, hero "PDF → Wiki.", three-section workflow, sticky bottom rule.
2. Drag a PDF in → input section accepts; queued file row appears below the zone with tabular size + remove ×.
3. Click `Generate Wiki` with one or more PDFs → pipeline section renders; rows update in real time via SSE; manifest's `Stage` flips to `Processing`; bottom-rule status mirrors progress.
4. On complete → output section renders with three big numerals; manifest updates to `Complete`; `Import to Wiki` action remains.
5. Click `Import to Wiki` → import succeeds with toast; manifest stays at complete; importResult line renders below the numerals.
6. Click `02 · Graph` → route changes to `/graph`; sidebar nav highlight moves; main column shows the Graph stub hero + "Coming soon."; chrome / sidebar / manifest persist; top-rule + bottom-rule update with the new view name.
7. No mono font is loaded by the page (network panel shows only Inter).
8. No element on the page has `border-radius > 0` except focus rings and the explicit drop-zone semantic dashes.
9. `npm run typecheck` is clean. Existing `npm test` passes.

## Out of scope

- Light theme.
- Real Graph / Plugins / History functionality.
- Mobile breakpoints below 720px (sidebar collapse). Desktop-first this pass; the layout doesn't break on narrow viewports but isn't optimized.
- Replacing shadcn primitives that aren't used in views being touched (`progress`, `tooltip`, `dialog`, `scroll-area`, `separator`, `skeleton`, `input` keep their current styles unless the redesign touches them).
- Animation polish beyond hover/active state changes. No transitions longer than 100ms.
- Persisting the manifest across page navigations within a single batch (in scope only if the batch starts on `/` and survives navigation — current React state lives in `app/page.tsx` and resets on route change; if the manifest needs to persist, lift batch state into a layout-level context. Decide during planning).

## Open questions for the implementation plan

1. **Batch state lifetime across views.** Right now, navigating away from `/` would lose batch state since it's local to the page component. Should the manifest update if the user clicks `02 · Graph` mid-batch? Options: (a) keep state local — manifest goes idle on nav; (b) lift to root layout — manifest persists. Recommend (b) for a polished feel; small refactor.
2. **Vault destination path display.** The current code doesn't surface `OBSIDIAN_VAULT_PATH` to the client. Either expose a coarse hint (`~/vault/wiki/`) via a dedicated `/api/config` endpoint or omit the destination line. Recommend omit for now.
3. **shadcn variants pruning.** Several button sizes/variants exist (`xs`, `link`, `icon-xs`). If they're unused after this pass, they get deleted; if used in `components/ui/sonner.tsx` or elsewhere, they stay. Audit during plan.

## Risks

- **OS-class CSS removal** is wide. Several files use `os-eyebrow`, `os-chip`, `os-window`, etc. A grep-and-replace miss would leave un-styled elements. Mitigation: search before deletion; re-grep after.
- **Inter-only on a Next.js font setup** is a one-line change but the existing `font-mono` Tailwind utility is referenced in many files. Need to either keep `font-mono` mapped to Inter (low-risk) or scrub every `font-mono` usage (cleaner).
- **No light-mode** simplifies CSS but means anyone toggling system theme sees no change. Acceptable per scope.
