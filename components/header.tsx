import type { JSX } from "react";
import { FileText } from "lucide-react";

export function Header(): JSX.Element {
  return (
    <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 max-w-4xl items-center px-6">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-foreground/80" aria-hidden />
          <span className="text-sm font-mono tracking-tight">wiki-generator</span>
        </div>
      </div>
    </header>
  );
}
