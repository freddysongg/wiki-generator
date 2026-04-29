"use client";

import { useEffect, useState } from "react";
import type { JSX } from "react";
import ReactMarkdown from "react-markdown";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type FetchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; markdown: string }
  | { status: "error" };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  batchId: string | null;
  filename: string | null;
  title: string | null;
  source: string | null;
  sourcePages: string | null;
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
  const [state, setState] = useState<FetchState>({ status: "idle" });

  useEffect(() => {
    if (!open || !batchId || !filename) {
      setState({ status: "idle" });
      return;
    }
    let isCancelled = false;
    setState({ status: "loading" });
    void (async (): Promise<void> => {
      try {
        const response = await fetch(
          `/api/batches/${encodeURIComponent(batchId)}/pages/${encodeURIComponent(filename)}`,
        );
        if (!response.ok) {
          console.error(
            `[page-preview] body fetch failed: ${response.status}`,
          );
          if (!isCancelled) setState({ status: "error" });
          return;
        }
        const text = await response.text();
        if (!isCancelled) setState({ status: "ready", markdown: text });
      } catch (err) {
        console.error("[page-preview] body fetch error:", err);
        if (!isCancelled) setState({ status: "error" });
      }
    })();
    return () => {
      isCancelled = true;
    };
  }, [open, batchId, filename]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl border border-rule bg-bg text-fg">
        <DialogHeader>
          <DialogTitle className="t-display text-fg">{title ?? ""}</DialogTitle>
          <DialogDescription className="t-meta text-fg-mute">
            {source ?? ""} · {sourcePages ?? ""}
          </DialogDescription>
        </DialogHeader>
        <div className="page-preview-body">
          {state.status === "loading" ? (
            <p className="t-meta text-fg-mute">Loading…</p>
          ) : null}
          {state.status === "error" ? (
            <p className="t-meta text-brand-accent">Could not load page.</p>
          ) : null}
          {state.status === "ready" ? (
            <ReactMarkdown
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
                a: ({ children, href }) => (
                  <a
                    className="text-fg underline underline-offset-2 hover:text-brand-accent"
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {children}
                  </a>
                ),
                hr: () => <hr className="border-t border-rule my-4" />,
              }}
            >
              {state.markdown}
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
  );
}
