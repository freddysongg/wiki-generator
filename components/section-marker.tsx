import type { JSX, ReactNode } from "react";

interface Props {
  index: string;
  label: string;
  tail?: ReactNode;
}

export function SectionMarker({ index, label, tail }: Props): JSX.Element {
  return (
    <div className="flex items-baseline justify-between t-label text-fg-mute pt-3 border-t border-rule">
      <span>
        {index} — {label}
      </span>
      {tail ? <span className="t-meta text-fg-mute">{tail}</span> : null}
    </div>
  );
}
