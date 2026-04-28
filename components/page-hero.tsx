import type { JSX, ReactNode } from "react";

interface SpecLine {
  text: string;
}

interface Props {
  eyebrow: string;
  headline: ReactNode;
  description?: string;
  spec?: ReadonlyArray<SpecLine>;
}

export function PageHero({
  eyebrow,
  headline,
  description,
  spec,
}: Props): JSX.Element {
  return (
    <header className="flex items-end justify-between gap-6 pb-3 border-b border-rule">
      <div className="flex flex-col gap-2 min-w-0">
        <span className="t-eyebrow text-fg-mute">{eyebrow}</span>
        <h1 className="t-hero text-fg break-words">{headline}</h1>
        {description ? (
          <p className="t-body text-fg-mute max-w-[42ch]">{description}</p>
        ) : null}
      </div>
      {spec && spec.length > 0 ? (
        <ul className="flex flex-col gap-1 text-right shrink-0 list-none m-0 p-0">
          {spec.map((line) => (
            <li key={line.text} className="t-meta text-fg-mute">
              {line.text}
            </li>
          ))}
        </ul>
      ) : null}
    </header>
  );
}
