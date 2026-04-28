import type { JSX } from "react";
import { PageHero } from "@/components/page-hero";

export default function HistoryPage(): JSX.Element {
  return (
    <>
      <PageHero
        eyebrow="View 04"
        headline="History."
        description="Past batches and their results. Coming soon."
      />
      <div className="border border-rule px-5 py-6 t-body text-fg-mute">
        Coming soon.
      </div>
    </>
  );
}
