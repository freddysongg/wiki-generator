"use client";

import type { JSX } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BatchTotals, ImportResult } from "@/lib/types";

interface Props {
  totals: BatchTotals;
  importing: boolean;
  importResult: ImportResult | null;
  onImport: () => void;
}

type CellTone = "neutral" | "warn";

interface Cell {
  label: string;
  value: number;
  tone: CellTone;
}

export function SummaryPanel({
  totals,
  importing,
  importResult,
  onImport,
}: Props): JSX.Element {
  const cells: Cell[] = [
    { label: "Pages", value: totals.pages, tone: "neutral" },
    { label: "Links", value: totals.links, tone: "neutral" },
    {
      label: "Failed",
      value: totals.failed,
      tone: totals.failed > 0 ? "warn" : "neutral",
    },
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
                cell.tone === "warn" ? "text-brand-accent" : "text-fg",
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
