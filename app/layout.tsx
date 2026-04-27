import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import type { ReactNode, JSX } from "react";

export const metadata: Metadata = {
  title: "wiki-generator",
  description: "Local PDF → Obsidian wiki generator",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): JSX.Element {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
