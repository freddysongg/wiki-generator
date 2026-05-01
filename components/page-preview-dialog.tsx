"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { JSX, MouseEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PdfViewerDialog } from "@/components/pdf-viewer-dialog";

const FIRST_INTEGER_PATTERN = /\d+/;

function parseFirstPageNumber(sourcePages: string): number | undefined {
  const match = sourcePages.match(FIRST_INTEGER_PATTERN);
  if (!match) return undefined;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : undefined;
}

const WIKILINK_HREF_PREFIX = "#wiki/";
const WIKILINK_BROKEN_HREF = "#wiki-broken";
const WIKILINK_PATTERN = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

interface PageRef {
  filename: string;
  title: string;
  source: string;
  sourcePages: string;
}

interface ManifestPageEntry {
  title: string;
  filename: string;
  source: string;
  sourcePages: string;
}

type BodyState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; markdown: string }
  | { status: "error" };

type ManifestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; pages: ManifestPageEntry[] }
  | { status: "error" };

interface MdastTextNode {
  type: "text";
  value: string;
}

interface MdastLinkNode {
  type: "link";
  url: string;
  title?: string | null;
  children: MdastTextNode[];
}

interface MdastParentNode {
  type: string;
  children?: MdastChildNode[];
}

type MdastChildNode = MdastTextNode | MdastLinkNode | MdastParentNode;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batchId: string | null;
  filename: string | null;
  title: string | null;
  source: string | null;
  sourcePages: string | null;
}

function buildTitleIndex(pages: ManifestPageEntry[]): Map<string, ManifestPageEntry> {
  const index = new Map<string, ManifestPageEntry>();
  for (const page of pages) {
    index.set(page.title, page);
    index.set(page.title.toLowerCase(), page);
  }
  return index;
}

function resolveWikilinkTarget(
  rawTarget: string,
  index: Map<string, ManifestPageEntry>,
): ManifestPageEntry | null {
  const trimmed = rawTarget.trim();
  return index.get(trimmed) ?? index.get(trimmed.toLowerCase()) ?? null;
}

function splitTextByWikilinks(
  raw: string,
  index: Map<string, ManifestPageEntry>,
): MdastChildNode[] {
  const segments: MdastChildNode[] = [];
  let cursor = 0;
  WIKILINK_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null = WIKILINK_PATTERN.exec(raw);
  while (match !== null) {
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;
    if (matchStart > cursor) {
      segments.push({ type: "text", value: raw.slice(cursor, matchStart) });
    }
    const target = match[1];
    const alias = match[2];
    const display = (alias ?? target).trim();
    const resolved = resolveWikilinkTarget(target, index);
    if (resolved !== null) {
      segments.push({
        type: "link",
        url: `${WIKILINK_HREF_PREFIX}${encodeURIComponent(resolved.title)}`,
        children: [{ type: "text", value: display }],
      });
    } else {
      segments.push({
        type: "link",
        url: WIKILINK_BROKEN_HREF,
        children: [{ type: "text", value: display }],
      });
    }
    cursor = matchEnd;
    match = WIKILINK_PATTERN.exec(raw);
  }
  if (cursor < raw.length) {
    segments.push({ type: "text", value: raw.slice(cursor) });
  }
  return segments;
}

function transformWikilinks(node: MdastChildNode, index: Map<string, ManifestPageEntry>): void {
  if (!("children" in node) || !Array.isArray(node.children)) return;
  if (node.type === "code" || node.type === "inlineCode" || node.type === "link") return;
  const next: MdastChildNode[] = [];
  for (const child of node.children) {
    if (child.type === "text") {
      const text = child as MdastTextNode;
      if (!text.value.includes("[[")) {
        next.push(child);
        continue;
      }
      const replaced = splitTextByWikilinks(text.value, index);
      next.push(...replaced);
      continue;
    }
    transformWikilinks(child, index);
    next.push(child);
  }
  node.children = next;
}

function makeWikilinkPlugin(
  index: Map<string, ManifestPageEntry>,
): () => (tree: MdastParentNode) => void {
  return () => (tree: MdastParentNode): void => {
    transformWikilinks(tree, index);
  };
}

function isInternalWikiHref(href: string | undefined): href is string {
  return typeof href === "string" && href.startsWith(WIKILINK_HREF_PREFIX);
}

function isBrokenWikiHref(href: string | undefined): href is string {
  return href === WIKILINK_BROKEN_HREF;
}

function decodeWikiTitle(href: string): string {
  const raw = href.slice(WIKILINK_HREF_PREFIX.length);
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
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
  const [bodyState, setBodyState] = useState<BodyState>({ status: "idle" });
  const [manifestState, setManifestState] = useState<ManifestState>({
    status: "idle",
  });
  const [navigationStack, setNavigationStack] = useState<PageRef[]>([]);
  const [currentPage, setCurrentPage] = useState<PageRef | null>(null);
  const [isPdfViewerOpen, setIsPdfViewerOpen] = useState<boolean>(false);
  const manifestCacheRef = useRef<Map<string, ManifestPageEntry[]>>(new Map());

  const activePage: PageRef | null = useMemo(() => {
    if (currentPage !== null) return currentPage;
    if (filename === null) return null;
    return {
      filename,
      title: title ?? "",
      source: source ?? "",
      sourcePages: sourcePages ?? "",
    };
  }, [currentPage, filename, title, source, sourcePages]);

  useEffect(() => {
    if (!open) {
      setNavigationStack([]);
      setCurrentPage(null);
      setBodyState({ status: "idle" });
      setManifestState({ status: "idle" });
      setIsPdfViewerOpen(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || batchId === null) {
      return;
    }
    const cached = manifestCacheRef.current.get(batchId);
    if (cached !== undefined) {
      setManifestState({ status: "ready", pages: cached });
      return;
    }
    const controller = new AbortController();
    setManifestState({ status: "loading" });
    void (async (): Promise<void> => {
      try {
        const response = await fetch(
          `/api/manifest/${encodeURIComponent(batchId)}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          console.error(
            `[page-preview] manifest fetch failed: ${response.status}`,
          );
          if (!controller.signal.aborted) {
            setManifestState({ status: "error" });
          }
          return;
        }
        const parsed = (await response.json()) as {
          pages?: Array<{
            title?: unknown;
            filename?: unknown;
            source?: unknown;
            sourcePages?: unknown;
          }>;
        };
        const pages: ManifestPageEntry[] = Array.isArray(parsed.pages)
          ? parsed.pages
              .filter(
                (
                  entry,
                ): entry is {
                  title: string;
                  filename: string;
                  source?: unknown;
                  sourcePages?: unknown;
                } =>
                  typeof entry.title === "string" &&
                  typeof entry.filename === "string",
              )
              .map((entry) => ({
                title: entry.title,
                filename: entry.filename,
                source: typeof entry.source === "string" ? entry.source : "",
                sourcePages:
                  typeof entry.sourcePages === "string" ? entry.sourcePages : "",
              }))
          : [];
        manifestCacheRef.current.set(batchId, pages);
        if (!controller.signal.aborted) {
          setManifestState({ status: "ready", pages });
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        console.error("[page-preview] manifest fetch error:", err);
        if (!controller.signal.aborted) {
          setManifestState({ status: "error" });
        }
      }
    })();
    return () => {
      controller.abort();
    };
  }, [open, batchId]);

  useEffect(() => {
    if (!open || batchId === null || activePage === null) {
      return;
    }
    const controller = new AbortController();
    setBodyState({ status: "loading" });
    void (async (): Promise<void> => {
      try {
        const response = await fetch(
          `/api/batches/${encodeURIComponent(batchId)}/pages/${encodeURIComponent(activePage.filename)}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          console.error(
            `[page-preview] body fetch failed: ${response.status}`,
          );
          if (!controller.signal.aborted) setBodyState({ status: "error" });
          return;
        }
        const text = await response.text();
        if (!controller.signal.aborted) {
          setBodyState({ status: "ready", markdown: text });
        }
      } catch (err) {
        if ((err as { name?: string }).name === "AbortError") return;
        console.error("[page-preview] body fetch error:", err);
        if (!controller.signal.aborted) setBodyState({ status: "error" });
      }
    })();
    return () => {
      controller.abort();
    };
  }, [open, batchId, activePage]);

  const titleIndex = useMemo<Map<string, ManifestPageEntry>>(() => {
    if (manifestState.status !== "ready") return new Map();
    return buildTitleIndex(manifestState.pages);
  }, [manifestState]);

  const remarkPlugins = useMemo(
    () => [remarkGfm, makeWikilinkPlugin(titleIndex)],
    [titleIndex],
  );

  const handleAnchorClick = (
    event: MouseEvent<HTMLAnchorElement>,
    href: string | undefined,
  ): void => {
    if (!isInternalWikiHref(href)) return;
    event.preventDefault();
    const targetTitle = decodeWikiTitle(href);
    const resolved = titleIndex.get(targetTitle);
    if (resolved === undefined) return;
    const previous = activePage;
    if (previous !== null) {
      setNavigationStack((prev) => [...prev, previous]);
    }
    setCurrentPage({
      filename: resolved.filename,
      title: resolved.title,
      source: resolved.source,
      sourcePages: resolved.sourcePages,
    });
  };

  const handleBack = (): void => {
    setNavigationStack((prev) => {
      if (prev.length === 0) return prev;
      const restored = prev[prev.length - 1];
      const next = prev.slice(0, -1);
      setCurrentPage(next.length === 0 ? null : restored);
      return next;
    });
  };

  const headerTitle = activePage?.title ?? "";
  const headerSource = activePage?.source ?? "";
  const headerPages = activePage?.sourcePages ?? "";
  const canGoBack = navigationStack.length > 0;
  const canOpenPdf = batchId !== null && headerSource.length > 0;
  const pdfInitialPage = parseFirstPageNumber(headerPages);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl border border-rule bg-bg text-fg">
        <DialogHeader>
          {canGoBack ? (
            <button
              type="button"
              onClick={handleBack}
              className="t-meta text-fg-mute hover:text-fg self-start mb-1"
            >
              ← Back
            </button>
          ) : null}
          <DialogTitle className="t-display text-fg">{headerTitle}</DialogTitle>
          <div className="flex items-baseline justify-between gap-3">
            <DialogDescription className="t-meta text-fg-mute">
              {headerSource}
              {headerSource && headerPages ? " · " : ""}
              {headerPages}
            </DialogDescription>
            {canOpenPdf ? (
              <button
                type="button"
                onClick={() => setIsPdfViewerOpen(true)}
                className="t-meta text-fg-mute hover:text-fg shrink-0"
              >
                Open PDF →
              </button>
            ) : null}
          </div>
        </DialogHeader>
        <div className="page-preview-body">
          {bodyState.status === "loading" ? (
            <p className="t-meta text-fg-mute">Loading…</p>
          ) : null}
          {bodyState.status === "error" ? (
            <p className="t-meta text-brand-accent">Could not load page.</p>
          ) : null}
          {bodyState.status === "ready" ? (
            <ReactMarkdown
              remarkPlugins={remarkPlugins}
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
                table: ({ children }) => (
                  <table className="t-body text-fg my-3 border border-rule border-collapse w-full">
                    {children}
                  </table>
                ),
                thead: ({ children }) => (
                  <thead className="bg-bg-2">{children}</thead>
                ),
                tbody: ({ children }) => <tbody>{children}</tbody>,
                tr: ({ children }) => (
                  <tr className="border-b border-rule">{children}</tr>
                ),
                th: ({ children }) => (
                  <th className="t-meta text-fg text-left px-2 py-1 border-r border-rule last:border-r-0">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="t-body text-fg px-2 py-1 border-r border-rule last:border-r-0 align-top">
                    {children}
                  </td>
                ),
                del: ({ children }) => (
                  <del className="text-fg-mute">{children}</del>
                ),
                input: (props) =>
                  props.type === "checkbox" ? (
                    <input
                      type="checkbox"
                      checked={props.checked ?? false}
                      readOnly
                      className="mr-2 align-middle"
                    />
                  ) : (
                    <input {...props} />
                  ),
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
                a: ({ children, href }) => {
                  if (isBrokenWikiHref(href)) {
                    return (
                      <span
                        data-wikilink="broken"
                        className="text-fg-mute line-through"
                      >
                        {children}
                      </span>
                    );
                  }
                  if (isInternalWikiHref(href)) {
                    return (
                      <a
                        data-wikilink="resolved"
                        className="text-fg underline underline-offset-2 decoration-rule hover:text-brand-accent cursor-pointer"
                        href={href}
                        onClick={(event) => handleAnchorClick(event, href)}
                      >
                        {children}
                      </a>
                    );
                  }
                  return (
                    <a
                      className="text-fg underline underline-offset-2 hover:text-brand-accent"
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {children}
                    </a>
                  );
                },
                hr: () => <hr className="border-t border-rule my-4" />,
              }}
            >
              {bodyState.markdown}
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
      <PdfViewerDialog
        open={isPdfViewerOpen}
        onOpenChange={setIsPdfViewerOpen}
        batchId={isPdfViewerOpen ? batchId : null}
        filename={isPdfViewerOpen && headerSource.length > 0 ? headerSource : null}
        initialPage={pdfInitialPage}
      />
    </>
  );
}
