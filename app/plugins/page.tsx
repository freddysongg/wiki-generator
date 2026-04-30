import type { JSX } from "react";
import { PageHero } from "@/components/page-hero";
import { SectionMarker } from "@/components/section-marker";
import { PluginCard, type PluginCardData } from "@/components/plugin-card";

const PLUGINS: ReadonlyArray<PluginCardData> = [
  {
    name: "PDF++",
    href: "https://github.com/RyotaUshio/obsidian-pdf-plus",
    tagline: "Wikilinks to specific PDF page selections.",
    why: "Drop the source PDFs into your vault and `[[file.pdf#page=14]]` becomes navigable. Pairs with the sourcePages frontmatter.",
    schemaFields: ["source", "sourcePages"],
  },
  {
    name: "Extended Graph",
    href: "https://github.com/ElsaTam/obsidian-extended-graph",
    tagline: "Property/tag/link-type filters on Obsidian's core graph.",
    why: "Filter by tag:wiki-generator to isolate generated notes from the rest of your vault.",
    schemaFields: ["tags", "type"],
  },
  {
    name: "Dataview",
    href: "https://github.com/blacksmithgu/obsidian-dataview",
    tagline: "Query the wiki like a database.",
    why: "TABLE source FROM #wiki-generator just works. The frozen frontmatter schema is designed to keep queries written today working tomorrow.",
    schemaFields: ["title", "tags", "source", "sourcePages", "created"],
  },
  {
    name: "Various Complements",
    href: "https://github.com/tadashi-aikawa/obsidian-various-complements",
    tagline: "Wikilink autocomplete against titles AND aliases.",
    why: "Cross-references rely on canonical naming. Aliases let users type Backprop and still resolve to Backpropagation.",
    schemaFields: ["title", "aliases"],
  },
  {
    name: "Linter",
    href: "https://github.com/platers/obsidian-linter",
    tagline: "Optional. Formats YAML frontmatter consistently.",
    why: "Disable 'remove empty properties' or it strips empty aliases: [] arrays — those are intentional.",
    schemaFields: [],
  },
];

const COMPATIBILITY_NOTES: ReadonlyArray<string> = [
  "All emitted frontmatter uses plain scalars and arrays — no nested objects — so Linter and Templater don't reformat or strip fields.",
  "Smart Connections, Smart Composer, and Copilot are complementary: the wiki-generator produces the corpus, those plugins enrich it.",
];

export default function PluginsPage(): JSX.Element {
  return (
    <>
      <PageHero
        eyebrow="View 03"
        headline="Plugins."
        description="Companion plugins that amplify the generated wiki. None are required."
        spec={[{ text: `${PLUGINS.length} recommended` }]}
      />

      <section className="flex flex-col gap-3">
        <SectionMarker index="001" label="Recommended" tail="Open in browser" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PLUGINS.map((plugin) => (
            <PluginCard key={plugin.name} plugin={plugin} />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <SectionMarker index="002" label="Compatibility" />
        <ul className="border border-rule list-none m-0 p-0">
          {COMPATIBILITY_NOTES.map((note, index) => (
            <li
              key={index}
              className="border-b border-rule last:border-b-0 px-5 py-3 t-body text-fg-mute"
            >
              {note}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
