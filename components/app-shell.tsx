"use client";

import type { JSX, ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { useBatch } from "@/components/batch-context";

const VIEW_LABEL: Record<string, string> = {
  "/": "Generate",
  "/graph": "Graph",
  "/plugins": "Plugins",
  "/history": "History",
};

const STAGE_PHRASE: Record<string, string> = {
  idle: "Ready",
  queued: "Queued",
  processing: "Processing",
  complete: "Complete",
};

interface Props {
  children: ReactNode;
}

export function AppShell({ children }: Props): JSX.Element {
  const pathname = usePathname();
  const view = VIEW_LABEL[pathname] ?? "Generate";
  const { snapshot } = useBatch();
  const stagePhrase = STAGE_PHRASE[snapshot.stage] ?? "Ready";

  let topRight = `${stagePhrase} · ${snapshot.fileCount} queued`;
  let bottomLeft = stagePhrase;
  if (snapshot.stage === "processing") {
    const done = snapshot.statuses.filter((s) => s.stage === "done").length;
    bottomLeft = `Processing · ${done}/${snapshot.statuses.length}`;
    topRight = bottomLeft;
  }
  if (snapshot.stage === "complete" && snapshot.totals) {
    bottomLeft = `Complete · ${snapshot.totals.pages} pages · ${snapshot.totals.links} links`;
    topRight = `Complete · ${snapshot.totals.pages} pages`;
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg text-fg">
      <header
        className="sticky top-0 z-20 flex items-center justify-between px-4 h-[var(--rule-h-top)] border-b border-rule bg-bg t-meta text-fg-mute"
        aria-label="top status rule"
      >
        <span>wiki-gen / v0.1</span>
        <span>{topRight}</span>
      </header>
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <main className="flex-1 min-w-0 px-7 py-6 flex flex-col gap-5">
          {children}
        </main>
      </div>
      <footer
        className="sticky bottom-0 z-20 flex items-center justify-between px-4 h-[var(--rule-h-bot)] border-t border-rule bg-bg t-meta text-fg-mute"
        aria-label="bottom status rule"
      >
        <span>{bottomLeft}</span>
        <span>v0.1 · {view}</span>
      </footer>
    </div>
  );
}
