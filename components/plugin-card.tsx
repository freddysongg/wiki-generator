import type { JSX } from "react";

export interface PluginCardData {
  name: string;
  href: string;
  tagline: string;
  why: string;
  schemaFields: ReadonlyArray<string>;
}

interface Props {
  plugin: PluginCardData;
}

export function PluginCard({ plugin }: Props): JSX.Element {
  return (
    <article className="flex flex-col gap-3 border border-rule px-5 py-5 bg-bg">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="t-display text-fg">
          <a
            href={plugin.href}
            target="_blank"
            rel="noreferrer"
            className="hover:text-[var(--accent)]"
          >
            {plugin.name}
          </a>
        </h3>
      </header>
      <p className="t-body text-fg">{plugin.tagline}</p>
      <p className="t-body text-fg-mute">{plugin.why}</p>
      {plugin.schemaFields.length > 0 ? (
        <footer className="flex flex-wrap items-center gap-1.5">
          <span className="t-eyebrow text-fg-faint">Reads</span>
          {plugin.schemaFields.map((field) => (
            <span
              key={field}
              className="inline-flex items-center px-2 py-0.5 t-meta text-fg-mute border border-rule"
            >
              {field}
            </span>
          ))}
        </footer>
      ) : null}
    </article>
  );
}
