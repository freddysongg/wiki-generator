"use client";

import type { JSX } from "react";
import { useBatch, type BatchStage } from "@/components/batch-context";

interface Row {
  label: string;
  value: string;
}

const STAGE_LABEL: Record<BatchStage, string> = {
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
    { label: "Stage", value: STAGE_LABEL[snapshot.stage] },
    { label: "Files", value: snapshot.queuedCount.toString() },
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
