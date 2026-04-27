"use client";

import type { JSX } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

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

export function SummaryPanel({
  totals,
  importing,
  importResult,
  onImport,
}: Props): JSX.Element {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-2 text-sm">
        <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />
        <span>Batch complete.</span>
      </div>
      <div className="grid grid-cols-3 gap-3 text-sm font-mono">
        <Stat label="pages" value={totals.pages} />
        <Stat label="links" value={totals.links} />
        <Stat
          label="failed"
          value={totals.failed}
          tone={totals.failed > 0 ? "warn" : "ok"}
        />
      </div>
      <Button onClick={onImport} disabled={importing} className="self-start">
        {importing ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Importing…
          </>
        ) : (
          "Import to Wiki"
        )}
      </Button>
      {importResult ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <AlertCircle className="h-3 w-3" aria-hidden />
          <span>
            Imported {importResult.imported}, {importResult.conflicts} renamed.
          </span>
        </div>
      ) : null}
    </Card>
  );
}

interface StatProps {
  label: string;
  value: number;
  tone?: "ok" | "warn";
}

function Stat({ label, value, tone = "ok" }: StatProps): JSX.Element {
  return (
    <div className="flex flex-col">
      <span className="sr-only">
        {value} {label}
      </span>
      <span
        aria-hidden
        className={tone === "warn" ? "text-amber-500" : "text-foreground"}
      >
        {value}
      </span>
      <span
        aria-hidden
        className="text-xs uppercase tracking-wider text-muted-foreground"
      >
        {label}
      </span>
    </div>
  );
}
