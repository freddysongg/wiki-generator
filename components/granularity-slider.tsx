"use client";

import type { JSX } from "react";
import { Button } from "@/components/ui/button";
import type { Granularity } from "@/lib/types";

interface Props {
  value: Granularity;
  onChange: (value: Granularity) => void;
}

const OPTIONS: ReadonlyArray<{
  value: Granularity;
  label: string;
  hint: string;
}> = [
  { value: "coarse", label: "Coarse", hint: "few dense pages" },
  { value: "medium", label: "Medium", hint: "one per concept" },
  { value: "fine", label: "Fine", hint: "many small pages" },
];

export function GranularitySlider({ value, onChange }: Props): JSX.Element {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
        Granularity
      </span>
      <div className="inline-flex gap-1 rounded-md border border-border bg-muted p-1">
        {OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            type="button"
            variant={opt.value === value ? "default" : "ghost"}
            size="sm"
            data-active={opt.value === value}
            onClick={() => onChange(opt.value)}
            className="h-8 px-3 text-xs"
          >
            {opt.label}
          </Button>
        ))}
      </div>
      <span className="text-xs text-muted-foreground">
        {OPTIONS.find((o) => o.value === value)?.hint}
      </span>
    </div>
  );
}
