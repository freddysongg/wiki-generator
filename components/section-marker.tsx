import type { JSX, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  index: string;
  label: string;
  tail?: ReactNode;
  withTopRule?: boolean;
}

export function SectionMarker({
  index,
  label,
  tail,
  withTopRule = true,
}: Props): JSX.Element {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between t-label text-fg-mute pt-3",
        withTopRule && "border-t border-rule",
      )}
    >
      <span>
        {index} — {label}
      </span>
      {tail ? <span className="t-meta text-fg-mute">{tail}</span> : null}
    </div>
  );
}
