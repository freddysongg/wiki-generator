import type { JSX } from "react";
import { PageHero } from "@/components/page-hero";

export default function PluginsPage(): JSX.Element {
  return (
    <>
      <PageHero
        eyebrow="View 03"
        headline="Plugins."
        description="Connect Obsidian plugins to the generator. Coming soon."
      />
      <div className="border border-rule px-5 py-6 t-body text-fg-mute">
        Coming soon.
      </div>
    </>
  );
}
