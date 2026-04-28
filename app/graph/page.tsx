import type { JSX } from "react";
import { PageHero } from "@/components/page-hero";

export default function GraphPage(): JSX.Element {
  return (
    <>
      <PageHero
        eyebrow="View 02"
        headline="Graph."
        description="Visualize the wiki's link graph. Coming soon."
      />
      <div className="border border-rule px-5 py-6 t-body text-fg-mute">
        Coming soon.
      </div>
    </>
  );
}
