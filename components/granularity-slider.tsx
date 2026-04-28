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
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-fg focus-visible:outline-offset-[-2px]",
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
