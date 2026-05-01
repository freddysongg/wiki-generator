import type { JSX, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  index: string;
  label: string;
  tail?: ReactNode;
  withTopRule?: boolean;
  collapsible?: boolean;
  isCollapsed?: boolean;
  onToggle?: () => void;
}

export function SectionMarker({
  index,
  label,
  tail,
  withTopRule = true,
  collapsible = false,
  isCollapsed = false,
  onToggle,
}: Props): JSX.Element {
  const baseClass = cn(
    "flex items-baseline justify-between t-label text-fg-mute pt-3",
    withTopRule && "border-t border-rule",
  );

  if (collapsible && onToggle) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!isCollapsed}
        aria-label={isCollapsed ? `expand ${label}` : `collapse ${label}`}
        className={cn(
          baseClass,
          "w-full text-left hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-fg focus-visible:outline-offset-[-2px]",
        )}
      >
        <span>
          {index} — {label}
        </span>
        <span className="flex items-baseline gap-3">
          {tail ? <span className="t-meta text-fg-mute">{tail}</span> : null}
          <span aria-hidden className="t-meta text-fg-mute">
            {isCollapsed ? "▸" : "▾"}
          </span>
        </span>
      </button>
    );
  }

  return (
    <div className={baseClass}>
      <span>
        {index} — {label}
      </span>
      {tail ? <span className="t-meta text-fg-mute">{tail}</span> : null}
    </div>
  );
}
