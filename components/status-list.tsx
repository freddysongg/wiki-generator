"use client";

import type { JSX } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { PdfStatus, Stage } from "@/lib/types";

const STAGE_LABEL: Record<Stage, string> = {
  queued: "Queued",
  parsing: "Parsing",
  ocr: "OCR",
  extracting: "Extracting",
  writing: "Writing",
  done: "Done",
  failed: "Failed",
};

const STAGE_VARIANT: Record<
  Stage,
  "default" | "secondary" | "destructive" | "outline"
> = {
  queued: "outline",
  parsing: "secondary",
  ocr: "secondary",
  extracting: "secondary",
  writing: "secondary",
  done: "default",
  failed: "destructive",
};

interface Props {
  items: PdfStatus[];
}

export function StatusList({ items }: Props): JSX.Element | null {
  if (items.length === 0) return null;
  return (
    <Card className="divide-y divide-border">
      {items.map((item) => (
        <div
          key={item.pdfId}
          className="flex items-center justify-between gap-4 px-4 py-3"
        >
          <div className="flex flex-col">
            <span className="text-sm font-mono">{item.filename}</span>
            {item.error ? (
              <span className="text-xs text-destructive">{item.error}</span>
            ) : item.pagesGenerated > 0 ? (
              <span className="text-xs text-muted-foreground">
                {item.pagesGenerated} pages
              </span>
            ) : null}
          </div>
          <Badge
            variant={STAGE_VARIANT[item.stage]}
            className="font-mono text-[10px] uppercase"
          >
            {STAGE_LABEL[item.stage]}
          </Badge>
        </div>
      ))}
    </Card>
  );
}
