"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { JSX } from "react";
import { cn } from "@/lib/utils";

interface NavItem {
  index: string;
  label: string;
  href: string;
}

const ITEMS: ReadonlyArray<NavItem> = [
  { index: "01", label: "Generate", href: "/" },
  { index: "02", label: "Graph", href: "/graph" },
  { index: "03", label: "History", href: "/history" },
];

export function SidebarNav(): JSX.Element {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col border-b border-rule">
      {ITEMS.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex items-center justify-between px-4 py-2.5 t-label border-b border-rule last:border-b-0",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-fg focus-visible:outline-offset-[-2px]",
              isActive
                ? "bg-fg text-bg font-bold"
                : "text-fg-mute hover:bg-bg-2",
            )}
          >
            <span>
              {item.index} · {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
