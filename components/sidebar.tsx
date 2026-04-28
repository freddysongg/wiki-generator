import type { JSX } from "react";
import { SidebarNav } from "@/components/sidebar-nav";
import { Manifest } from "@/components/manifest";

export function Sidebar(): JSX.Element {
  return (
    <aside
      aria-label="primary navigation"
      className="flex flex-col w-[var(--rail-w)] shrink-0 border-r border-rule bg-bg"
    >
      <div className="px-4 py-3 border-b border-rule">
        <span className="font-bold text-[11px] tracking-tight text-fg">
          wiki-gen
        </span>
      </div>
      <SidebarNav />
      <Manifest />
    </aside>
  );
}
